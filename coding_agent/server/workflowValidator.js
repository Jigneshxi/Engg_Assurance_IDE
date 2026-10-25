import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createArtifactSnapshot } from './projectArtifacts.js';
import { scanForCredentials, scanForSecuritySinks, redactSecret } from './securityValidator.js';
import { createValidationWorkspace, validationEnvironment, executeCommand, stopProcess } from './validationRuntime.js';
import { resolveSharedPython } from './pythonEnvironment.js';
import { formatErrorDiagnostic } from './errorDiagnostic.js';

export const testEnvironment = validationEnvironment;
const idKey = value => String(value).replace(/[^a-z0-9]+/gi, '_').toLowerCase();
const namesRequirement = (name, id) => new RegExp(`(?:^|_)${idKey(id)}(?:_|$)`).test(idKey(name));

export function parseWorkflowReport(runner, report) {
  if (runner === 'pytest') {
    const cases = [...report.matchAll(/<testcase\b([^>]*)(?:\/>|>([\s\S]*?)<\/testcase>)/g)];
    const names = cases.map(c => (c[1].match(/\bname="([^"]*)"/) || [])[1] || '');
    const passed = cases.length > 0 && cases.every(c => !/<(?:failure|error|skipped)\b/.test(c[2] || ''));
    return { passed, names, testCount: cases.length };
  }
  const data = JSON.parse(report);
  const names = [];
  const collect = suites => { for (const suite of suites || []) { for (const spec of suite.specs || []) names.push(spec.title); collect(suite.suites); } };
  collect(data.suites);
  return { passed: data.stats?.expected > 0 && data.stats?.unexpected === 0 && data.stats?.flaky === 0 && data.stats?.skipped === 0 && !(data.errors?.length), names, testCount: data.stats?.expected || 0 };
}

export function findPlaywrightConfigs(files = []) {
  const names = new Set(['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs', 'playwright.config.cjs']);
  return files.filter(file => {
    const normalized = String(file?.path || '').replaceAll('\\', '/');
    return normalized.startsWith('frontend/') && names.has(normalized.slice('frontend/'.length));
  }).map(file => file.path);
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function startServers(directory, python) {
  const pythonExe = resolveSharedPython({ configuredPython: python, workspacePath: directory }) || python;
  const children = [];
  const stop = () => children.forEach(stopProcess);
  function start(command, args, cwd, env) {
    const child = spawn(command, args, { cwd, env, detached: process.platform !== 'win32', shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command), stdio: ['ignore', 'pipe', 'pipe'] });
    child.output = ''; child.startError = null;
    child.on('error', error => { child.startError = error; });
    const collect = data => { child.output = redactSecret((child.output + data).slice(-12000)); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    children.push(child); return child;
  }
  async function ready(child, url) {
    for (let n = 0; n < 100; n++) {
      if (child.startError || child.exitCode !== null) throw new Error(`Validation server failed: ${child.startError?.message || child.output}`);
      try { const response = await fetch(url, { signal: AbortSignal.timeout(500) }); if (response.status < 500) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error(`Validation server did not become ready: ${url}\n${child.output}`);
  }
  try {
    const backendPort = await freePort(); const frontendPort = await freePort();
    const backendUrl = `http://127.0.0.1:${backendPort}`; const frontendUrl = `http://127.0.0.1:${frontendPort}`;
    const env = validationEnvironment(directory, { PORT: String(backendPort), FRONTEND_URL: frontendUrl, VITE_API_URL: backendUrl, CORS_ORIGINS: frontendUrl });
    const backend = path.join(directory, 'backend');
    if (fs.existsSync(path.join(backend, 'main.py'))) {
      if (!pythonExe) throw new Error('No usable Python interpreter available to start validation backend server');
      const child = start(pythonExe, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(backendPort)], backend, env);
      await ready(child, backendUrl + '/openapi.json');
    } else if (fs.existsSync(path.join(backend, 'package.json'))) {
      const child = start(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['start'], backend, env);
      await ready(child, backendUrl);
    }
    const frontend = path.join(directory, 'frontend');
    const vite = path.join(frontend, 'node_modules/vite/bin/vite.js');
    if (!fs.existsSync(vite)) throw new Error('Vite dependency unavailable; run validation dependency setup');
    const child = start(process.execPath, [vite, '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort'], frontend, env);
    await ready(child, frontendUrl);
    return { frontendUrl, backendUrl, stop };
  } catch (error) { stop(); throw error; }
}

export async function validateWorkflowExecution(files, contract, options = {}) {
  const snapshot = createArtifactSnapshot(files);
  const defects = []; const suites = [];
  const sendEvent = options.sendEvent || (() => {});
  const workflows = contract?.workflows || [];
  const add = (file, message, details = {}) => {
    const defect = { code: 'WORKFLOW_TEST_FAILURE', severity: 'HIGH', file, message: redactSecret(message), ...details };
    defects.push(defect); sendEvent('workflow_failed', defect);
    sendEvent('log', `❌ [workflow_failed] ${file || 'workflow'}: ${defect.message}`);
  };
  if (!workflows.length) add('', 'No executable workflow suites were declared in the shared contract');
  const playwrightConfigs = findPlaywrightConfigs(files);
  if (playwrightConfigs.length > 1) {
    add('', `Multiple Playwright configurations are present; keep exactly one authoritative config: ${playwrightConfigs.join(', ')}`,
      { code: 'DUPLICATE_PLAYWRIGHT_CONFIG' });
  }
  if (files.some(f => scanForCredentials(f).length || scanForSecuritySinks(f).length)) add('', 'Workflow execution blocked: credential or security defects must be repaired first', { status: 'blocked' });
  if (defects.length) return { isValid: false, browserPassed: false, artifactHash: snapshot.hash, suites, defects, errors: defects.map(d => d.message) };
  const sandbox = createValidationWorkspace(snapshot.files, options.workspacePath);
  const directory = sandbox.directory;
  let servers;
  try {
    for (const workflow of workflows) {
      if (!snapshot.files.some(f => f.path === workflow.testFile)) { add(workflow.testFile, 'Declared workflow test file is missing'); continue; }
      sendEvent('workflow_started', { testFile: workflow.testFile, runner: workflow.runner });
      try {
        let command, args, cwd, reportFile;
        let env = testEnvironment(directory);
        const resolvedPython = resolveSharedPython({ configuredPython: options.python, workspacePath: directory, allowIdeVenv: false });
        if (workflow.runner === 'pytest') {
          if (!resolvedPython && !options.execute) throw new Error('No usable Python interpreter available for pytest workflow');
          cwd = path.join(directory, 'backend'); reportFile = path.join(directory, 'pytest-report.xml');
          // A supplied executor is used by deterministic tests and may only
          // inspect the command/report contract; real execution still fails
          // closed above when Python is unavailable.
          command = resolvedPython || process.execPath;
          args = ['-m', 'pytest', path.relative(cwd, path.join(directory, workflow.testFile)), `--junitxml=${reportFile}`];
        } else if (workflow.runner === 'playwright') {
          cwd = path.join(directory, 'frontend');
          const cli = path.join(cwd, 'node_modules/@playwright/test/cli.js');
          if (!fs.existsSync(cli)) throw new Error('Playwright dependency unavailable; run validation dependency setup and install Chromium');
          if (!servers) {
            if (!resolvedPython) throw new Error('No usable Python interpreter available to start backend server for Playwright');
            servers = await (options.startServers || startServers)(directory, resolvedPython);
          }
          const defaultBrowserDir = fs.existsSync(path.join(os.homedir(), '.openclaw/playwright-browsers'))
            ? path.join(os.homedir(), '.openclaw/playwright-browsers')
            : path.resolve(options.workspacePath || '.', '.openclaw/playwright-browsers');
          env = testEnvironment(directory, { FRONTEND_URL: servers.frontendUrl, VITE_API_URL: servers.backendUrl, PLAYWRIGHT_BROWSERS_PATH: options.browserPath || defaultBrowserDir });
          let config = ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs', 'playwright.config.cjs'].map(f => path.join(cwd, f)).find(f => fs.existsSync(f));
          if (!config) {
            // Harness configuration belongs to the disposable run, not the artifact.
            config = path.join(cwd, 'playwright.validation.cjs');
            fs.writeFileSync(config, 'module.exports = {testDir: "./tests", workers: 1, retries: 0, use: {baseURL: process.env.FRONTEND_URL, headless: true, browserName: "chromium"}};');
          }
          reportFile = path.join(directory, 'playwright-report.json');
          env.PLAYWRIGHT_JSON_OUTPUT_NAME = reportFile;
          command = process.execPath;
          args = [cli, 'test', path.relative(cwd, path.join(directory, workflow.testFile)).replace(/\\/g, '/'), '--config', config, '--reporter=json'];
        } else throw new Error('Unsupported workflow runner');
        fs.rmSync(reportFile, { force: true });
        const result = await (options.execute || executeCommand)(command, args, { cwd, env, timeout: options.timeout || 120000 });
        if (result.code !== 0 || !fs.existsSync(reportFile)) throw new Error(`Workflow command exited ${result.code}; ${fs.existsSync(reportFile) ? 'test report retained' : 'no test report'}\n${formatErrorDiagnostic(result.output || '', 30)}`);
        const evidence = parseWorkflowReport(workflow.runner, fs.readFileSync(reportFile, 'utf8'));
        const covered = workflow.requirementIds.filter(id => evidence.names.some(name => namesRequirement(name, id)));
        const missing = workflow.requirementIds.filter(id => !covered.includes(id));
        if (!evidence.passed || missing.length) throw new Error(`Workflow tests failed or skipped, or omitted requirement IDs: ${missing.join(', ') || 'see test report'}\n${formatErrorDiagnostic(result.output || '', 30)}`);
        suites.push({ testFile: workflow.testFile, runner: workflow.runner, passed: true, testCount: evidence.testCount, requirementIds: covered, artifactHash: snapshot.hash });
        sendEvent('workflow_passed', suites[suites.length - 1]);
      } catch (error) { add(workflow.testFile, error.message); }
    }
  } finally { servers?.stop(); sandbox.cleanup(); }
  const hasFrontend = files.some(f => /^frontend\/.*\.[jt]sx?$/.test(f.path));
  const browserPassed = !hasFrontend || suites.some(s => s.runner === 'playwright' && s.passed);
  if (!browserPassed) add('', 'Frontend browser workflow tests did not execute successfully');
  // FIX-4 (workflowValidator): Surface a typed blockedByEnvironment flag so callers can
  // distinguish an environment setup failure (missing binaries, CDN 404) from a real test failure.
  // String-matching error messages in the orchestrator is fragile; this flag is authoritative.
  const blockedByEnvironment = defects.some(d =>
    (d.message || '').toLowerCase().includes('playwright dependency unavailable') ||
    (d.message || '').toLowerCase().includes('vite dependency unavailable') ||
    (d.message || '').toLowerCase().includes('browser binary') ||
    (d.message || '').toLowerCase().includes('validation dependency setup') ||
    (d.message || '').toLowerCase().includes('playwright-browsers') ||
    d.code === 'WORKFLOW_PREREQUISITE_FAILED'
  );
  return { isValid: defects.length === 0 && suites.length === workflows.length, browserPassed, blockedByEnvironment, artifactHash: snapshot.hash, suites, defects, errors: defects.map(d => d.message) };
}
