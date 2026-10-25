import http from 'http';

const prd = `
# Modular Application Plan

## MOD-001 Foundation
Create basic backend setup.
- package.json
- server.js (express app)

## MOD-002 Backend Feature
Add an API endpoint for users.
- src/routes/users.js
- test.js

## MOD-003 Frontend Feature
Create a React frontend.
- frontend/package.json
- frontend/src/App.jsx
`;

const req = http.request('http://localhost:3001/api/openclaw/execute', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(chunk);
  });
  res.on('end', () => {
    console.log('--- Test Completed ---');
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(JSON.stringify({
  prd: prd,
  generationMode: 'new',
  existingFiles: []
}));
req.end();
