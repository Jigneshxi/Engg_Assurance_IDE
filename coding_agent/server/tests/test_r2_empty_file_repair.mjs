import assert from 'assert';
import { repairFile } from '../repairEngine.js';
import { repairProjectContracts } from '../integrationContract.js';

console.log('================================================');
console.log('    TEST R2: EMPTY & MISSING FILE REPAIR TEST   ');
console.log('================================================\n');

async function testEmptyFileRepairDirectCleanFallback() {
  console.log('--- TEST 1: Empty File in repairFile Triggers Clean Fallback (No Patch Search Error) ---');

  const fileDef = {
    path: 'backend/alembic/env.py',
    content: '', // 0 chars
    repairAttempts: 0,
    status: 'repairing'
  };

  const activeModule = { id: 'MOD-000', name: 'Database Foundations', layer: 'DATABASE' };
  const manifest = { modules: [{ id: 'MOD-000', required_files: [fileDef] }] };
  const defects = [{ code: 'OUTPUT_FORMAT_TRUNCATED', message: 'Size: 0 chars. File output was empty.' }];

  const loggedMessages = [];
  const events = [];
  const sendEvent = (ev, data) => {
    events.push({ ev, data });
    if (ev === 'log') loggedMessages.push(data);
  };

  // Caller provides complete file implementation in <file> tags
  const cleanEnvContent = `from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

config = context.config
target_metadata = None

def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    connectable = engine_from_config(config.get_section(config.config_ini_section), prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
`;

  const caller = async (_systemPrompt, _userPrompt) => {
    // Assert that the system/user prompt does NOT ask for a patch search block
    return `<file path="backend/alembic/env.py">\n${cleanEnvContent}\n</file>`;
  };

  const res = await repairFile({
    fileDef,
    activeModule,
    manifest,
    defects,
    caller,
    sendEvent,
    generationId: 'gen-empty-env',
    validateFn: async (cand) => ({ isValid: cand.content.includes('run_migrations'), errors: [] })
  });

  assert.strictEqual(res.success, true, 'Repair should succeed for empty file via clean fallback');
  assert.strictEqual(fileDef.status, 'validated', 'Empty file should reach validated status');
  assert.ok(fileDef.content.includes('run_migrations_online'), 'File content should be cleanly populated');

  // Verify that "Patch search text is empty" was NEVER produced
  const hasPatchEmptyError = loggedMessages.some(m => m.includes('Patch search text is empty'));
  assert.strictEqual(hasPatchEmptyError, false, 'Engine must NEVER log "Patch search text is empty" on empty file');

  console.log('✅ PASS: Empty file repaired cleanly without search/replace patch error.\n');
}

async function testEmptyFileWithMarkdownCodeBlock() {
  console.log('--- TEST 2: Empty File Repaired from Markdown Fenced Code Output ---');

  const fileDef = {
    path: 'backend/app/api/tasks.py',
    content: '   \n  ', // whitespace only
    repairAttempts: 0,
    status: 'repairing'
  };

  const activeModule = { id: 'MOD-001', name: 'Task Endpoints', layer: 'BACKEND' };
  const manifest = { modules: [{ id: 'MOD-001', required_files: [fileDef] }] };
  const defects = [{ code: 'OUTPUT_FORMAT_TRUNCATED', message: 'Size: 0 chars' }];

  const loggedMessages = [];
  const sendEvent = (ev, data) => {
    if (ev === 'log') loggedMessages.push(data);
  };

  const cleanRouterContent = `from fastapi import APIRouter
router = APIRouter()

@router.get('/tasks')
def list_tasks():
    return [{"id": 1, "title": "Task 1"}]
`;

  // Caller provides code in markdown code fences without <file> tag
  const caller = async () => `\`\`\`python\n${cleanRouterContent}\n\`\`\``;

  const res = await repairFile({
    fileDef,
    activeModule,
    manifest,
    defects,
    caller,
    sendEvent,
    generationId: 'gen-empty-tasks',
    validateFn: async (cand) => ({ isValid: cand.content.includes('list_tasks'), errors: [] })
  });

  assert.strictEqual(res.success, true, 'Repair should succeed for empty file with markdown fence');
  assert.strictEqual(fileDef.status, 'validated');
  assert.ok(fileDef.content.includes('list_tasks'), 'Router content should be populated from code block');
  assert.strictEqual(loggedMessages.some(m => m.includes('Patch search text is empty')), false);

  console.log('✅ PASS: Markdown code fence extracted cleanly for empty file.\n');
}

async function testRepairProjectContractsWithEmptyFile() {
  console.log('--- TEST 3: repairProjectContracts Handles Empty File Cleanly ---');

  const files = [
    {
      path: 'backend/app/main.py',
      content: 'from fastapi import FastAPI\napp = FastAPI()\n'
    },
    {
      path: 'backend/alembic/env.py',
      content: '' // empty file
    }
  ];

  const loggedMessages = [];
  const sendEvent = (ev, data) => {
    if (ev === 'log') loggedMessages.push(data);
  };

  const generatedEnvContent = `from logging.config import fileConfig
from alembic import context
# complete alembic env
`;

  let callerInvoked = false;
  const mockCaller = async (systemInstruction, _userPrompt) => {
    callerInvoked = true;
    assert.ok(
      systemInstruction.includes('currently empty or missing') || systemInstruction.includes('Do NOT return a search/replace patch'),
      'Prompt must instruct caller to generate complete source code instead of search/replace patch'
    );
    return JSON.stringify({
      files: [{ path: 'backend/alembic/env.py', content: generatedEnvContent }]
    });
  };

  let _validationCount = 0;
  const mockValidate = async (candFiles) => {
    _validationCount++;
    const env = candFiles.find(f => f.path === 'backend/alembic/env.py');
    if (!env || !env.content || !env.content.includes('complete alembic env')) {
      return {
        isValid: false,
        stage: 1,
        defects: [
          {
            code: 'FILE_EMPTY_OR_CORRUPT',
            file: 'backend/alembic/env.py',
            message: 'Alembic env.py is empty.'
          }
        ]
      };
    }
    return {
      isValid: true,
      stage: 2,
      defects: []
    };
  };

  const result = await repairProjectContracts(files, {
    validate: mockValidate,
    caller: mockCaller,
    integrationContract: { endpoints: [] },
    maxRounds: 2,
    sendEvent,
    generationId: 'gen-contract-empty'
  });

  assert.strictEqual(callerInvoked, true, 'Caller should have been invoked for contract repair');
  assert.strictEqual(result.isValid, true, 'Project contract repair should achieve isValid: true');
  const repairedEnv = files.find(f => f.path === 'backend/alembic/env.py');
  assert.ok(repairedEnv && repairedEnv.content.includes('complete alembic env'), 'Target file must have new content');
  assert.strictEqual(loggedMessages.some(m => m.includes('Patch search text is empty')), false);

  console.log('✅ PASS: repairProjectContracts repaired empty file without patch search failure.\n');
  console.log('================================================');
  console.log('    ALL R2 EMPTY FILE REPAIR TESTS PASSED!      ');
  console.log('================================================');
}

async function runAll() {
  await testEmptyFileRepairDirectCleanFallback();
  await testEmptyFileWithMarkdownCodeBlock();
  await testRepairProjectContractsWithEmptyFile();
}

runAll().catch(err => {
  console.error('❌ Test R2 Failed:', err);
  process.exit(1);
});
