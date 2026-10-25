import fs from 'fs';
import http from 'http';

const prd = fs.readFileSync('docs/amereyconnect-medicinal-platform.md', 'utf8');

const postData = JSON.stringify({
  prd,
  projectName: 'amereyconnect-medicinal-platform',
  generationMode: 'new',
  autoApprove: true
});

console.log('Sending POST /api/generate with PRD length:', prd.length);

const req = http.request({
  hostname: '127.0.0.1',
  port: 3001,
  path: '/api/generate',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
}, (res) => {
  console.log(`Response status: ${res.statusCode}`);
  let buffer = '';
  res.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep partial line
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed && typeof parsed === 'object') {
            if (parsed.message) console.log('EVENT:', parsed.message);
            else if (parsed.status) console.log('STATUS:', parsed.status, parsed.score ? `Score: ${parsed.score}` : '');
            else if (parsed.code) console.log('DEFECT/CODE:', parsed.code, parsed.file);
          }
        } catch (_) {}
      } else if (line.startsWith('event: ')) {
        const evType = line.slice(7).trim();
        console.log(`>>> [EVENT: ${evType}]`);
        if (evType === 'done' || evType === 'error') {
          console.log(`Stream finished with event: ${evType}`);
        }
      }
    }
  });

  res.on('end', () => {
    console.log('Generation SSE stream ended.');
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
  process.exit(1);
});

req.write(postData);
req.end();
