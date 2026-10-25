import assert from 'node:assert';
import test from 'node:test';
import { isBoilerplateFile, generateDeterministicBasePy, getBoilerplateTemplate } from '../foundationTemplates.js';
import { verifyMergedCodeSyntax } from '../orchestrator.js';
import { repairFile } from '../repairEngine.js';

test('T2.1: isBoilerplateFile identifies backend/app/db/base.py across all path variants', () => {
  const variants = [
    'backend/app/db/base.py',
    'backend\\app\\db\\base.py',
    'app/db/base.py',
    '/app/db/base.py',
    'BACKEND/APP/DB/BASE.PY'
  ];

  for (const variant of variants) {
    assert.strictEqual(
      isBoilerplateFile(variant),
      true,
      `Should recognize ${variant} as a boilerplate file`
    );
  }

  // Non-boilerplate files must return false
  assert.strictEqual(isBoilerplateFile('backend/app/db/models.py'), false);
  assert.strictEqual(isBoilerplateFile('backend/app/db/database.py'), false);
  assert.strictEqual(isBoilerplateFile('backend/app/api/tasks.py'), false);
});

test('T2.2: generateDeterministicBasePy extracts models from modelsContent and produces valid Python', () => {
  const sampleModelsContent = `
from sqlalchemy import Column, Integer, String, ForeignKey
from app.db.database import Base

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    name = Column(String(50))

class Project(Base):
    __tablename__ = 'projects'
    id = Column(Integer, primary_key=True)

class Task(Base):
    __tablename__ = 'tasks'
    id = Column(Integer, primary_key=True)
`;

  const baseContent = generateDeterministicBasePy(sampleModelsContent, []);

  assert.ok(baseContent.includes('from app.db.database import Base'));
  assert.ok(baseContent.includes('from app.db.models import Project, Task, User'));
  assert.ok(baseContent.includes('__all__ = ["Base", "Project", "Task", "User"]'));

  const syntaxCheck = verifyMergedCodeSyntax(baseContent, 'backend/app/db/base.py');
  assert.strictEqual(syntaxCheck.valid, true, `Generated base.py must have valid Python syntax: ${syntaxCheck.reason}`);
});

test('T2.3: generateDeterministicBasePy handles empty models with fallback gracefully', () => {
  const baseContent = generateDeterministicBasePy('', []);
  assert.ok(baseContent.includes('from app.db.database import Base'));
  assert.ok(baseContent.includes('from app.db import models'));
  assert.ok(baseContent.includes('__all__ = ["Base"]'));

  const syntaxCheck = verifyMergedCodeSyntax(baseContent, 'backend/app/db/base.py');
  assert.strictEqual(syntaxCheck.valid, true, `Empty models base.py must have valid Python syntax: ${syntaxCheck.reason}`);
});

test('T2.4: getBoilerplateTemplate generates base.py using context without LLM', () => {
  const context = {
    declaredEntities: ['Team', 'Member'],
    modelsContent: `class Task(Base):\n    pass\n`
  };

  const content = getBoilerplateTemplate('backend/app/db/base.py', 'TaskFlow', context);
  assert.ok(content);
  assert.ok(content.includes('Member'));
  assert.ok(content.includes('Task'));
  assert.ok(content.includes('Team'));
  assert.ok(content.includes('__all__ = ["Base", "Member", "Task", "Team"]'));
});

test('T2.5: repairFile bypasses LLM entirely for backend/app/db/base.py', async () => {
  let llmCalled = false;
  const mockCaller = async () => {
    llmCalled = true;
    throw new Error('LLM caller should NOT be invoked for boilerplate file repair!');
  };

  const emittedEvents = [];
  const sendEvent = (event, payload) => {
    emittedEvents.push({ event, payload });
  };

  const fileDef = {
    path: 'backend/app/db/base.py',
    content: 'from app.db.database import Basefrom app.models.user import User', // Glued corrupted syntax
    status: 'repairing',
    errors: ['SyntaxError: invalid syntax']
  };

  const activeModule = { id: 'database', layer: 'DATABASE' };
  const manifest = {
    projectName: 'taskflow-task-manage-platform',
    files: [
      {
        path: 'backend/app/db/models.py',
        content: `class User(Base):\n    pass\nclass Project(Base):\n    pass\n`
      }
    ],
    declaredEntities: ['User', 'Project']
  };

  const defects = [{ code: 'SYNTAX_ERROR', message: 'SyntaxError at line 1' }];

  const result = await repairFile({
    fileDef,
    activeModule,
    manifest,
    defects,
    caller: mockCaller,
    sendEvent
  });

  assert.strictEqual(llmCalled, false, 'LLM caller must NOT be invoked');
  assert.strictEqual(result.success, true, 'Repair must report success');
  assert.strictEqual(result.status, 'repaired');
  assert.strictEqual(fileDef.status, 'validated');
  assert.strictEqual(fileDef.errors.length, 0);

  // Content should now be cleanly generated base.py
  assert.ok(fileDef.content.includes('from app.db.database import Base'));
  assert.ok(fileDef.content.includes('from app.db.models import Project, User'));
  assert.ok(!fileDef.content.includes('Basefrom'));

  // Ensure deterministic repair event was logged
  const deterministicLog = emittedEvents.find(e => e.event === 'log' && e.payload.includes('[repair_deterministic]'));
  assert.ok(deterministicLog, 'Must emit [repair_deterministic] log event');
  assert.ok(deterministicLog.payload.includes('backend/app/db/base.py is a boilerplate file'));

  // Ensure no LLM generation events were fired
  const generatingEvents = emittedEvents.filter(e => e.event === 'file_generating');
  assert.strictEqual(generatingEvents.length, 0, 'Must have 0 file_generating events');
});
