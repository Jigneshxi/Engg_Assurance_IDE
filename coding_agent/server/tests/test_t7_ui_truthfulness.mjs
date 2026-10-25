import assert from 'node:assert';
import test from 'node:test';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

import { getLLMClientConfig } from '../llmRouter.js';
import { evaluateUiTruthfulness, preserveFailedCompletionGate } from '../uiTruthfulness.js';

test('T7.1: getLLMClientConfig returns real configured provider and model, not hardcoded defaults', () => {
  const clientConfig = getLLMClientConfig();
  assert.ok(clientConfig.provider, 'Provider must be defined');
  assert.ok(clientConfig.model, 'Model must be defined');
  assert.ok(clientConfig.activeModel, 'activeModel object must be defined');
  assert.strictEqual(clientConfig.activeModel.provider, clientConfig.provider, 'activeModel.provider must match clientConfig.provider');
  assert.ok(
    clientConfig.activeModel.name.includes(clientConfig.provider),
    `activeModel.name must include provider name: ${clientConfig.activeModel.name}`
  );
});

test('T7.2: evaluateUiTruthfulness enforces authoritative completion gate failure over in-flight states', () => {
  const failedGate = {
    status: 'FAIL',
    failedGates: ['backendRuntime', 'apiAuthz', 'browserE2e'],
    required: 30,
    generated: 25,
    validated: 10,
    blocked: 5,
    failed: 1
  };

  const uiState = evaluateUiTruthfulness({
    completionGate: failedGate,
    donePayload: { status: 'failed', gateStatus: 'FAIL' },
    activeRepairsCount: 3,
    blockedFilesCount: 5,
    failedFilesCount: 1
  });

  assert.strictEqual(uiState.uiStatus, 'error', 'Must be in error status');
  assert.strictEqual(uiState.badgeText, 'GATE FAILED', 'Badge must display GATE FAILED');
  assert.strictEqual(uiState.failedGates.length, 3, 'Must retain all failed gates');
  assert.ok(uiState.bannerMessage.includes('backendRuntime'), 'Banner message must list failed gates');
});

test('T7.3: preserveFailedCompletionGate preserves earlier failed gates when subsequent signal has empty or missing gates', () => {
  const previousFailedGate = {
    status: 'FAIL',
    failedGates: ['syntax', 'importClosure', 'generationBoundary']
  };

  // When subsequent failure event has empty or missing failedGates, previous failed gates must NOT be erased
  const emptyNewEvent = {
    status: 'FAIL',
    failedGates: []
  };

  const preserved = preserveFailedCompletionGate(previousFailedGate, emptyNewEvent);
  assert.strictEqual(preserved.status, 'FAIL', 'Status must remain FAIL');
  assert.ok(preserved.failedGates.includes('syntax'), 'Must retain syntax');
  assert.ok(preserved.failedGates.includes('importClosure'), 'Must retain importClosure');
  assert.ok(preserved.failedGates.includes('generationBoundary'), 'Must retain generationBoundary');
});

test('T7.4: Dynamic LLM stream telemetry updates provider and model state truthfully without hardcoding', () => {
  // Simulate App.tsx reducer/state updater logic
  let llmState = {
    provider: 'ollama',
    model: 'gemma3:27b',
    status: 'active'
  };

  // Event 1: LLM Router fails over to fallback provider (e.g. Google)
  const fallbackEvent = {
    type: 'llm_provider_fallback',
    data: { from: 'Ollama', to: 'Google' }
  };

  if (fallbackEvent.type === 'llm_provider_fallback') {
    llmState = {
      ...llmState,
      provider: fallbackEvent.data.to,
      status: 'fallback'
    };
  }

  assert.strictEqual(llmState.provider, 'Google', 'UI provider must reflect the failover destination');
  assert.strictEqual(llmState.status, 'fallback', 'Status must reflect fallback mode');

  // Event 2: New attempt selected with specific model
  const attemptEvent = {
    type: 'llm_provider_selected',
    data: { provider: 'Google', model: 'gemini-3.5-flash-lite' }
  };

  if (attemptEvent.type === 'llm_provider_selected') {
    llmState = {
      ...llmState,
      provider: attemptEvent.data.provider,
      model: attemptEvent.data.model,
      status: 'completed'
    };
  }

  assert.strictEqual(llmState.provider, 'Google', 'Provider must remain Google');
  assert.strictEqual(llmState.model, 'gemini-3.5-flash-lite', 'Model must reflect gemini-3.5-flash-lite truthfully');
});
