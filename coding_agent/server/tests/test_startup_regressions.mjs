import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import util from 'node:util';

// Exercise real handlers with mocked dependencies, without .env, network,
// port binding, credentials, or writes to project workspaces.
function harness(outputs = []) {
  const routes = new Map();
  let writtenManifest;
  const app = {
    use() {}, get() {}, listen() {}, all() {},
    post(url, handler) {
      assert(!routes.has(url), `Duplicate route: ${url}`);
      routes.set(url, handler);
    }
  };
  const express = Object.assign(() => app, { json: () => () => {} });
  const context = {
    express, dotenv: { config() {} }, cors: () => () => {},
    path, util, fileURLToPath: () => '/mock/server/server.js',
    process: { cwd: () => '/mock' }, global: {},
    console: { log() {}, error() {} }, exec() {},
    enterpriseFiles: [], executeGeneration() {},
    getLLMConfig: () => ({ maxPrdChars: 10000 }), getLLMClientConfig() {},
    callLLM: async () => { assert(outputs.length, 'Unexpected AI call'); return outputs.shift(); },
    fs: {
      existsSync: () => true,
      readFileSync: () => JSON.stringify({ globalStatus: 'WAITING_FOR_APPROVAL', currentLayer: 2 }),
      writeFileSync: (_, contents) => { writtenManifest = JSON.parse(contents); }
    }
  };
  let source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  source = source.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replaceAll('import.meta.url', '"mock"').replaceAll('export function ', 'function ');
  vm.runInNewContext(source, context);
  return {
    async request(url, body) {
      const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
      await routes.get(url)({ body }, res);
      return res;
    },
    manifest: () => writtenManifest
  };
}

const files = [{ path: 'src/math.js', content: 'export const add = (a, b) => a + b;' }];

test('fix accepts omitted issues and rejects malformed issues', async () => {
  const h = harness(['<file path="src/math.js">export const add = (a, b) => a + b;</file>']);
  const result = await h.request('/api/compliance/fix', { prd: 'Math', files });
  assert.equal(result.code, 200);
  assert.equal(result.data.modifiedCount, 1);
  assert.equal((await h.request('/api/compliance/fix', { prd: 'Math', files, issues: null })).code, 400);
});

test('audit preserves low scores and AI category results', async () => {
  const h = harness([JSON.stringify({ score: 5, issues: [], audit_categories: [{ name: 'Backend', status: 'fail' }] }), '{"issues":[]}']);
  const result = await h.request('/api/compliance/compare', { prd: 'Math', files });
  assert.equal(result.code, 200);
  assert.equal(result.data.score, 5);
  assert.equal(result.data.compliant, false);
  assert.equal(result.data.categories[0].status, 'fail');
});

test('missing scores and failed global reviews cannot pass', async () => {
  for (const outputs of [['{}', '{"issues":[]}'], ['{"score":100,"issues":[]}', 'not JSON']]) {
    const result = await harness(outputs).request('/api/compliance/compare', { prd: 'Math', files });
    assert.equal(result.code, 502);
  }
});

test('global review extracts JSON from surrounding text', async () => {
  const result = await harness(['{"score":100,"issues":[]}', 'Result: {"issues":[]}']).request('/api/compliance/compare', { prd: 'Math', files });
  assert.equal(result.code, 200);
  assert.equal(result.data.compliant, true);
});

test('approval records history and change requests are persisted', async () => {
  const h = harness();
  assert.equal((await h.request('/api/openclaw/resume', { action: 'approve' })).code, 200);
  assert.equal(h.manifest().approvedLayer, 2);
  assert.equal(h.manifest().approvalState.length, 1);
  await h.request('/api/openclaw/resume', { action: 'request_changes', notes: 'Fix math' });
  assert.equal(h.manifest().changeRequestNote, 'Fix math');
});

test('numeric configuration preserves decimals and rejects malformed numbers', () => {
  const source = fs.readFileSync(new URL('../llmRouter.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('function requireEnv('), source.indexOf('export function getLLMConfig'));
  const context = { process: { env: { TEMP: '0.7', BAD: '12abc' } } };
  vm.createContext(context);
  vm.runInContext(fn, context);
  assert.equal(vm.runInContext('requireEnv("TEMP", "number")', context), 0.7);
  assert.throws(() => vm.runInContext('requireEnv("BAD", "number")', context), /must be a number/);
});
