import http from 'http';

const prd = `
# Test Implementation Plan
Create a basic arithmetic module.
- src/math.js (must export add and multiply functions)
`;

const files = [
  {
    path: 'src/math.js',
    content: `export function add(a, b) { return a + b; }
// missing multiply
`
  }
];

const issues = [
  {
    severity: 'high',
    category: 'Functionality',
    file: 'src/math.js',
    current: 'multiply function is missing',
    expected: 'multiply function should be exported',
    fix: 'Add export function multiply(a, b) { return a * b; }'
  }
];

const reqData = JSON.stringify({ prd, files, issues });

const req = http.request('http://localhost:3001/api/compliance/fix', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(reqData)
  }
}, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  let responseData = '';
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(responseData);
      console.log('--- Fix Completed ---');
      console.log('Modified Count:', parsed.modifiedCount);
      console.log('Summary:', parsed.summary);
      if (parsed.files) {
        console.log('Updated File Content:', parsed.files.find(f => f.path === 'src/math.js')?.content);
      }
    } catch(e) {
      console.log('Raw response:', responseData);
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(reqData);
req.end();
