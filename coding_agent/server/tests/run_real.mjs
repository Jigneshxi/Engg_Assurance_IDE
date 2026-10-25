import http from 'http';
import fs from 'fs';

const prd = "QuickCart e-commerce system with users and products.";
const postData = JSON.stringify({ prd, generationMode: 'new' });

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/openclaw/execute',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  res.setEncoding('utf8');
  let buffer = '';
  res.on('data', (chunk) => {
    buffer += chunk;
    const parts = buffer.split('\n\n');
    buffer = parts.pop();
    for (const part of parts) {
        if (part.startsWith('data: ')) {
            const dataStr = part.replace('data: ', '');
            if (dataStr === '[DONE]') {
                console.log("Stream ended.");
                process.exit(0);
            }
            try {
                const data = JSON.parse(dataStr);
                fs.appendFileSync('real_generation.log', `[${data.type}] ${JSON.stringify(data.data)}\n`);
                
                if (data.type === 'log') {
                    console.log(data.data);
                }
                
                if (data.type === 'awaiting_approval' && data.data.phase === 'DATABASE') {
                    console.log("✅ Halted at DATABASE phase human approval gate as required.");
                    process.exit(0);
                }
                
                if (data.type === 'error' || data.type === 'generation_failed_final_validation' || data.type === 'execution_failed') {
                    console.log("❌ Generation Failed:", data);
                    process.exit(1);
                }
            } catch(e) {}
        }
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(postData);
req.end();
