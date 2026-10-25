import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Only IDE tooling shares this environment. Generated projects keep their own.
export function getIdePythonPath(root, platform = process.platform) {
  return path.join(root, 'packages', 'python-engine', '.venv', platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
}

export function getIdePythonCandidates(root, { platform = process.platform, exists = fs.existsSync, includeLegacy = true } = {}) {
  const executable = platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
  const candidates = [getIdePythonPath(root, platform)];
  if (includeLegacy) {
    for (const name of ['.venv-ide', '.venv', '.venv-runtime']) candidates.push(path.join(root, name, executable));
  }
  return candidates.filter(candidate => exists(candidate));
}

export function isPythonExecutable(candidate) {
  if (!candidate || typeof candidate !== 'string') return false;
  try {
    if (!fs.existsSync(candidate)) return false;
    const stat = fs.statSync(candidate);
    if (stat.isDirectory()) return false;
    const res = spawnSync(candidate, ['-c', 'import sys; sys.exit(0)'], {
      timeout: 3000,
      windowsHide: true,
      stdio: 'ignore'
    });
    return res.status === 0 && !res.error;
  } catch {
    return false;
  }
}

export function getWindowsPythonLauncherCandidates({ pathDirs = [], systemRoot, localAppData } = {}) {
  const dirs = [...pathDirs, systemRoot, localAppData ? path.join(localAppData, 'Programs', 'Python', 'Launcher') : null].filter(Boolean);
  return [...new Set(dirs)].map(dir => path.join(dir, 'py.exe'));
}

export function isSystemPythonExecutable(candidate) {
  if (!candidate || typeof candidate !== 'string') return false;
  try {
    if (!fs.existsSync(candidate)) return false;
    const stat = fs.statSync(candidate);
    if (stat.isDirectory()) return false;
    if (/[\\/]\.venv(-ide|-runtime)?[\\/]/i.test(candidate)) return false;
    const res = spawnSync(candidate, ['-I', '-c', 'import sys; sys.exit(0 if sys.base_prefix == sys.prefix and ".venv" not in sys.executable.lower() else 1)'], {
      timeout: 3000,
      windowsHide: true,
      stdio: 'ignore'
    });
    return res.status === 0 && !res.error;
  } catch {
    return false;
  }
}

export function resolveSystemPython({
  platform = process.platform,
  exists = fs.existsSync
} = {}) {
  const pathEnv = process.env.PATH || '';
  const pathDirs = pathEnv.split(path.delimiter);

  // 1. Windows py launcher
  if (platform === 'win32') {
    for (const launcher of getWindowsPythonLauncherCandidates({ pathDirs, systemRoot: process.env.SystemRoot, localAppData: process.env.LOCALAPPDATA })) {
      if (!exists(launcher)) continue;
      try {
        const res = spawnSync(launcher, ['-3', '-c', 'import sys; print(sys.executable)'], {
          encoding: 'utf8',
          timeout: 4000,
          windowsHide: true
        });
        if (res.status === 0 && res.stdout) {
          const resolved = res.stdout.trim();
          if (resolved && isSystemPythonExecutable(resolved)) return resolved;
        }
      } catch {}
    }

    // Standard Windows installation directories
    const localAppData = process.env.LOCALAPPDATA;
    const programFiles = process.env.ProgramFiles;
    const winCandidates = [];
    if (localAppData) {
      for (const ver of ['Python313', 'Python312', 'Python311', 'Python310']) {
        winCandidates.push(path.join(localAppData, 'Programs', 'Python', ver, 'python.exe'));
      }
    }
    if (programFiles) {
      for (const ver of ['Python313', 'Python312', 'Python311', 'Python310']) {
        winCandidates.push(path.join(programFiles, ver, 'python.exe'));
      }
    }
    for (const cand of winCandidates) {
      if (isSystemPythonExecutable(cand)) return cand;
    }
  }

  // 2. PATH candidates (ensure strictly system python, never .venv)
  const targetNames = platform === 'win32' ? ['python.exe'] : ['python3', 'python'];
  for (const dir of pathDirs) {
    if (/[\\/]\.venv/i.test(dir)) continue;
    for (const name of targetNames) {
      const full = path.join(dir, name);
      if (isSystemPythonExecutable(full)) return full;
    }
  }

  // 3. Unix standard paths
  if (platform !== 'win32') {
    for (const cand of ['/usr/bin/python3', '/usr/local/bin/python3', '/opt/homebrew/bin/python3', '/usr/bin/python']) {
      if (isSystemPythonExecutable(cand)) return cand;
    }
  }

  return null;
}

export function resolveSharedPython({
  configuredPython,
  workspacePath,
  repoRoot,
  platform = process.platform,
  exists = fs.existsSync,
  checkExecutable = true,
  allowIdeVenv = false
} = {}) {
  const root = repoRoot || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const exeName = platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';

  const verify = candidate => {
    if (!candidate || !exists(candidate)) return false;
    if (!checkExecutable) return true;
    return isPythonExecutable(candidate);
  };

  // 1. Configured validation Python
  let preparedPython;
  if (workspacePath) {
    try {
      const config = JSON.parse(fs.readFileSync(path.join(workspacePath, '.openclaw/validation-runtime.json'), 'utf8'));
      if (config?.python) preparedPython = config.python;
    } catch {}
  }
  if (configuredPython) {
    if (exists(configuredPython) && (!checkExecutable || isPythonExecutable(configuredPython))) {
      return configuredPython;
    }
    return null;
  }
  if (preparedPython && verify(preparedPython)) {
    return preparedPython;
  }
  if (process.env.PYTHON_PATH && verify(process.env.PYTHON_PATH) && (allowIdeVenv || !process.env.PYTHON_PATH.includes('.venv-ide'))) {
    return process.env.PYTHON_PATH;
  }
  if (process.env.PYTHON_EXE && verify(process.env.PYTHON_EXE) && (allowIdeVenv || !process.env.PYTHON_EXE.includes('.venv-ide'))) {
    return process.env.PYTHON_EXE;
  }

  // 2. Generated project .venv/Scripts/python.exe (workspace-specific)
  if (workspacePath) {
    const projectCandidates = [
      path.join(workspacePath, '.venv', exeName),
      path.join(workspacePath, 'backend', '.venv', exeName)
    ];
    for (const p of projectCandidates) {
      if (verify(p)) return p;
    }
  }

  // 3. System Python (never .venv-ide)
  const systemPython = resolveSystemPython({ platform, exists });
  if (systemPython && verify(systemPython)) {
    return systemPython;
  }

  // 4. Accessible python.exe on PATH
  const pathEnv = process.env.PATH || '';
  const pathDirs = pathEnv.split(path.delimiter);
  const targetNames = platform === 'win32' ? ['python.exe'] : ['python3', 'python'];
  for (const dir of pathDirs) {
    if (!allowIdeVenv && /[\\/]\.venv(-ide|-runtime)?/i.test(dir)) continue;
    for (const name of targetNames) {
      const full = path.join(dir, name);
      if (verify(full)) return full;
    }
  }

  // 5. Repository .venv-ide/Scripts/python.exe ONLY if explicitly permitted (IDE internal tools only)
  if (allowIdeVenv) {
    const repoCandidates = [
      path.join(root, '.venv-ide', exeName),
      path.join(root, 'packages', 'python-engine', '.venv', exeName),
      path.join(root, 'server', '.venv-ide', exeName),
      path.join(root, 'server', '.venv', exeName)
    ];
    for (const p of repoCandidates) {
      if (verify(p)) return p;
    }
  }

  return null;
}
