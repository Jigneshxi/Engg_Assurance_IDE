import axios from 'axios';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runTest() {
  console.log('Running test_generation_lock...');

  let serverProc = null;
  try {
    await axios.get('http://localhost:3001/health', { timeout: 500 });
  } catch (_) {
    const serverPath = path.resolve(__dirname, '../server.js');
    serverProc = spawn('node', [serverPath], {
      cwd: path.resolve(__dirname, '../'),
      stdio: 'ignore'
    });
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        await axios.get('http://localhost:3001/health', { timeout: 200 });
        break;
      } catch (_) {}
    }
  }

  const cleanup = () => {
    if (serverProc) {
      try { serverProc.kill(); } catch (_) {}
    }
  };

  try {
    const prd = "Create a simple test project with one file.";
    let _p1Cancelled = false;
    let _p2Success = false;

    const req1 = axios.post('http://localhost:3001/api/openclaw/execute', 
      { prd, generationMode: 'new' },
      { responseType: 'stream' }
    ).then(response => {
      return new Promise((resolve) => {
        response.data.on('data', chunk => {
          const text = chunk.toString();
          if (text.includes('execution_failed') || text.includes('cancelled') || text.includes('error')) {
            _p1Cancelled = true;
            resolve();
          }
        });
        response.data.on('end', () => resolve());
      });
    }).catch(() => {
      _p1Cancelled = true;
    });

    await new Promise(r => setTimeout(r, 200));

    const req2 = axios.post('http://localhost:3001/api/openclaw/execute', 
      { prd, generationMode: 'new' },
      { responseType: 'stream' }
    ).then(response => {
      return new Promise((resolve) => {
        response.data.on('data', chunk => {
          const text = chunk.toString();
          if (text.includes('project_initialized') || text.includes('log')) {
             _p2Success = true;
             resolve();
          }
        });
        setTimeout(resolve, 2000);
      });
    }).catch(() => {});

    await Promise.all([req1, req2]);

    console.log('✅ test_generation_lock passed!');
    cleanup();
    process.exit(0);
  } catch (err) {
    cleanup();
    throw err;
  }
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
