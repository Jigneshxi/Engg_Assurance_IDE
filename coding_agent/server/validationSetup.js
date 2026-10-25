import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { executeCommand, validationEnvironment } from './validationRuntime.js';
import { resolveSystemPython } from './pythonEnvironment.js';

export function getValidationCacheBase(root, options = {}) {
  if (options.cacheDir) return options.cacheDir;
  if (process.env.OPENCLAW_CACHE_DIR) return process.env.OPENCLAW_CACHE_DIR;
  if (options.localOnly || /setup-test-|openclaw-validation-|test-tmp/i.test(root)) {
    return path.join(root, '.openclaw/validation-runtime');
  }
  return path.join(os.homedir(), '.openclaw', 'validation-runtime');
}

export function getValidationBrowserPath(root, options = {}) {
  if (options.browserPath) return options.browserPath;
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (options.localOnly || /setup-test-|openclaw-validation-|test-tmp/i.test(root)) {
    return path.join(root, '.openclaw/playwright-browsers');
  }
  return path.join(os.homedir(), '.openclaw', 'playwright-browsers');
}

// Install only declared dependencies in an owned cache, without loading .env,
// npm credentials, project .npmrc files, or lifecycle scripts.
export async function prepareValidationDependencies(files, workspacePath, { execute = executeCommand, sendEvent = () => {}, installBrowsers = true, cacheDir, browserPath, localOnly } = {}) {
  const root = path.resolve(workspacePath);
  const manifests = files.filter(f => ['frontend/package.json', 'backend/requirements.txt'].includes(f.path));
  const hash = crypto.createHash('sha256').update(JSON.stringify(manifests.map(f => [f.path, f.content]))).digest('hex').slice(0, 20);
  const cacheBase = getValidationCacheBase(root, { cacheDir, localOnly });
  const cache = path.join(cacheBase, hash);
  fs.mkdirSync(cache, { recursive: true });
  const npmConfig = path.join(cache, 'empty.npmrc'); fs.writeFileSync(npmConfig, '');
  const globalNpmConfig = path.join(cache, 'global.empty.npmrc'); fs.writeFileSync(globalNpmConfig, '');
  const env = validationEnvironment(cache, { NPM_CONFIG_USERCONFIG: npmConfig, NPM_CONFIG_GLOBALCONFIG: globalNpmConfig, npm_config_cache: path.join(cache, 'npm-cache') });
  const metadata = { cache };
  async function run(command, args, cwd, extra = {}) {
    const childEnv = { ...env, ...extra };
    if (extra.cleanEnv) {
      delete childEnv.PYTHONPATH;
      delete childEnv.VIRTUAL_ENV;
      delete childEnv.PYTHONHOME;
    }
    const result = await execute(command, args, { cwd, env: childEnv, timeout: 180000 });
    if (result.code !== 0) throw new Error(`Validation dependency setup failed (${command}): ${result.output || result.code}`);
  }
  const frontend = manifests.find(f => f.path === 'frontend/package.json');
  if (frontend && typeof frontend.content === 'string' && frontend.content.trim().startsWith('{')) {
    let pkg = null;
    try { pkg = JSON.parse(frontend.content); } catch (_) {}
    if (pkg && (pkg.dependencies || pkg.devDependencies)) {
      const clean = { private: true, dependencies: { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } };
      for (const [name, version] of Object.entries(clean.dependencies)) {
        if (!/^(@[a-z\d._-]+\/)?[a-z\d._-]+$/i.test(name) || typeof version !== 'string' || /(?:https?:|git|file:|link:|workspace:|npm:)/i.test(version)) throw new Error(`Unsupported automatic dependency source: ${name}`);
      }
      const directory = path.join(cache, 'frontend'); fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(clean));
      if (!fs.existsSync(path.join(directory, '.ready'))) {
        sendEvent('log', '🔧 [validation_setup] Installing declared frontend dependencies without lifecycle scripts');
        await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--ignore-scripts', '--include=optional', '--no-audit', '--no-fund'], directory);
        fs.writeFileSync(path.join(directory, '.ready'), hash);
      }
      const link = path.join(root, 'frontend/node_modules'); fs.mkdirSync(path.dirname(link), { recursive: true });
      try {
        const stat = fs.lstatSync(link);
        if (stat.isSymbolicLink() || stat.isDirectory() || stat.isFile()) {
          try { fs.unlinkSync(link); } catch (_) { fs.rmSync(link, { recursive: true, force: true }); }
        }
      } catch (err) {
        if (err.code !== 'ENOENT') {
          try { fs.rmSync(link, { recursive: true, force: true }); } catch (_) {}
        }
      }
      fs.symlinkSync(path.join(directory, 'node_modules'), link, process.platform === 'win32' ? 'junction' : 'dir');
      metadata.browserPath = getValidationBrowserPath(root, { browserPath, localOnly });
      const cli = path.join(directory, 'node_modules/@playwright/test/cli.js');
      if (installBrowsers && fs.existsSync(cli) && !fs.existsSync(path.join(metadata.browserPath, '.ready'))) {
        try {
          sendEvent('log', '🔧 [validation_setup] Installing Chromium for isolated browser tests');
          await run(process.execPath, [cli, 'install', 'chromium'], directory, { PLAYWRIGHT_BROWSERS_PATH: metadata.browserPath });
          fs.writeFileSync(path.join(metadata.browserPath, '.ready'), hash);
        } catch (browserError) {
          sendEvent('log', `⚠️ [validation_setup_browser_failed] Chromium installation failed (${browserError.message}); browser tests will be treated as environment-blocked.`);
        }
      }
    }
  }
  const requirements = manifests.find(f => f.path === 'backend/requirements.txt');
  if (requirements && typeof requirements.content === 'string' && requirements.content.trim()) {
    const lines = requirements.content.split(/\r?\n/).map(l => l.replace(/\s+#.*$/, '').trim()).filter(l => l && !l.startsWith('#'));
    for (const line of lines) if (!/^[A-Za-z0-9_.-]+(?:\[[A-Za-z0-9_,.-]+\])?(?:\s*(?:===|==|~=|!=|<=|>=|<|>)\s*[A-Za-z0-9.*+!_-]+(?:\s*,\s*(?:==|!=|<=|>=|<|>)\s*[A-Za-z0-9.*+!_-]+)*)?$/.test(line)) throw new Error(`Unsupported automatic Python dependency declaration; use standard package versions`);
    const venv = path.join(cache, 'python');
    fs.mkdirSync(venv, { recursive: true });
    metadata.python = path.join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    if (!fs.existsSync(metadata.python)) {
      sendEvent('log', '🔧 [validation_setup] Creating isolated Python environment');
      const basePython = resolveSystemPython({ repoRoot: root });
      if (!basePython) {
        throw new Error('System Python not found for isolated validation environment; cannot use .venv-ide or parent virtualenv');
      }
      await run(basePython, ['-m', 'venv', venv], cache, { cleanEnv: true });

      // Guard: verify isolation and ensure .venv-ide is not in sys.prefix or sys.path
      if (fs.existsSync(metadata.python)) {
        const guardRes = spawnSync(metadata.python, ['-I', '-c', 'import sys; print(sys.prefix); print("---"); print("\\n".join(sys.path))'], {
          encoding: 'utf8',
          env: {
            PATH: path.dirname(metadata.python) + path.delimiter + (process.env.SystemRoot || 'C:\\Windows') + '\\system32',
            SystemRoot: process.env.SystemRoot || 'C:\\Windows',
            WINDIR: process.env.WINDIR || 'C:\\Windows'
          }
        });
        if (guardRes.status !== 0 || !guardRes.stdout) {
          throw new Error(`Validation Python environment initialization failed: ${guardRes.stderr || 'unknown error'}`);
        }
        if (/[/\\]\.venv(-ide|-runtime)?[/\\]/i.test(guardRes.stdout)) {
          throw new Error(`CRITICAL SECURITY FAILURE: Validation Python venv leaked repo environment (.venv-ide): ${guardRes.stdout}`);
        }
      } else if (execute === executeCommand) {
        throw new Error(`Validation Python venv creation failed: ${metadata.python} was not created`);
      }
    }
    const ready = path.join(venv, '.ready');
    if (!fs.existsSync(ready)) {
      // Guard: Never run pip against a path outside the validation runtime
      const pythonNorm = path.resolve(metadata.python);
      const cacheNorm = path.resolve(cache);
      if (!pythonNorm.startsWith(cacheNorm)) {
        throw new Error(`CRITICAL GUARD ABORT: Attempted to run pip against python outside cache: ${pythonNorm}`);
      }
      const req = path.join(cache, 'requirements.txt'); fs.writeFileSync(req, lines.join('\n') + '\n');
      await run(metadata.python, ['-I', '-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', '-r', req], cache, { cleanEnv: true });
      fs.writeFileSync(ready, hash);
    }
  }
  fs.mkdirSync(path.join(root, '.openclaw'), { recursive: true });
  fs.writeFileSync(path.join(root, '.openclaw/validation-runtime.json'), JSON.stringify(metadata, null, 2));
  return metadata;
}
