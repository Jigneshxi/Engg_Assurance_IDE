import assert from 'assert';
import { validateDatabasePhase, DATABASE_DEFECT_CODES } from '../dbValidator.js';
import { getRepairStrategy } from '../repairEngine.js';

async function runPhase6Tests() {
  console.log('🧪 Starting Phase 6 Database / ORM Semantic Validation Suite...\n');
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      passed++;
      console.log(`  ✅ [PASS] ${name}`);
    } catch (e) {
      console.error(`  ❌ [FAIL] ${name}: ${e.message}`);
      throw e;
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  ✅ [PASS] ${name}`);
    } catch (e) {
      console.error(`  ❌ [FAIL] ${name}: ${e.message}`);
      throw e;
    }
  }

  const baseFile = {
    path: 'backend/app/db/database.py',
    content: `from sqlalchemy.orm import declarative_base\nBase = declarative_base()\n`,
    status: 'validated'
  };

  const createManifest = (files, dbReqs) => ({
    modules: [{ id: 'db', status: 'validated', required_files: files }],
    architectureContract: { language: 'python', orm: 'sqlalchemy' },
    project_requirements: {
      database: dbReqs
    }
  });

  const dummyCaller = async () => JSON.stringify({ isValid: true, semanticIssues: [] });
  const dummySendEvent = () => {};

  // 1. Valid Bidirectional SQLAlchemy Relationships
  await asyncTest('Valid bidirectional SQLAlchemy back_populates relationships pass', async () => {
    const modelsFile = {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

class ParentRecord(Base):
    __tablename__ = 'parent_records'
    id = Column(Integer, primary_key=True)
    name = Column(String(50))
    children = relationship('ChildRecord', back_populates='parent')

class ChildRecord(Base):
    __tablename__ = 'child_records'
    id = Column(Integer, primary_key=True)
    parent_id = Column(Integer, ForeignKey('parent_records.id'))
    parent = relationship('ParentRecord', back_populates='children')
`,
      status: 'validated'
    };
    const reqs = {
      entities: ['ParentRecord', 'ChildRecord'],
      tables: ['parent_records', 'child_records']
    };
    const files = [baseFile, modelsFile];
    const res = await validateDatabasePhase(
      [{ required_files: files }],
      createManifest(files, reqs),
      '',
      dummyCaller,
      dummySendEvent,
      { skipSqlalchemy: true }
    );
    assert.strictEqual(res.isValid, true, 'Valid relationships should pass validation');
    assert.strictEqual(res.defects.length, 0);
  });

  // 2. Mismatched back_populates attribute detected
  await asyncTest('Mismatched back_populates target fails with DB_REL001', async () => {
    const modelsFile = {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

class ParentRecord(Base):
    __tablename__ = 'parent_records'
    id = Column(Integer, primary_key=True)
    children = relationship('ChildRecord', back_populates='parent')

class ChildRecord(Base):
    __tablename__ = 'child_records'
    id = Column(Integer, primary_key=True)
    parent_id = Column(Integer, ForeignKey('parent_records.id'))
    parent = relationship('ParentRecord', back_populates='wrong_reciprocal_name')
`,
      status: 'validated'
    };
    const reqs = {
      entities: ['ParentRecord', 'ChildRecord'],
      tables: ['parent_records', 'child_records']
    };
    const files = [baseFile, modelsFile];
    const res = await validateDatabasePhase(
      [{ required_files: files }],
      createManifest(files, reqs),
      '',
      dummyCaller,
      dummySendEvent,
      { skipSqlalchemy: true }
    );
    assert.strictEqual(res.isValid, false);
    const defect = res.defects.find(d => d.code === DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP);
    assert(defect, 'Must produce DB_REL001 defect');
    assert.strictEqual(defect.actualState, 'wrong_back_populates');
  });

  // 3. Missing reciprocal relationship on target model
  await asyncTest('Missing reciprocal relationship on target model fails with DB_REL001', async () => {
    const modelsFile = {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

class ParentRecord(Base):
    __tablename__ = 'parent_records'
    id = Column(Integer, primary_key=True)
    children = relationship('ChildRecord', back_populates='parent')

class ChildRecord(Base):
    __tablename__ = 'child_records'
    id = Column(Integer, primary_key=True)
    parent_id = Column(Integer, ForeignKey('parent_records.id'))
`,
      status: 'validated'
    };
    const reqs = {
      entities: ['ParentRecord', 'ChildRecord'],
      tables: ['parent_records', 'child_records']
    };
    const files = [baseFile, modelsFile];
    const res = await validateDatabasePhase(
      [{ required_files: files }],
      createManifest(files, reqs),
      '',
      dummyCaller,
      dummySendEvent,
      { skipSqlalchemy: true }
    );
    assert.strictEqual(res.isValid, false);
    const defect = res.defects.find(d => d.code === DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP);
    assert(defect, 'Must produce DB_REL001 defect');
    assert.strictEqual(defect.actualState, 'missing');
  });

  // 4. Target class mismatch on reciprocal relationship
  await asyncTest('Target class mismatch on reciprocal relationship fails with DB_REL001', async () => {
    const modelsFile = {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

class ParentRecord(Base):
    __tablename__ = 'parent_records'
    id = Column(Integer, primary_key=True)
    children = relationship('ChildRecord', back_populates='parent')

class ThirdEntity(Base):
    __tablename__ = 'third_entities'
    id = Column(Integer, primary_key=True)

class ChildRecord(Base):
    __tablename__ = 'child_records'
    id = Column(Integer, primary_key=True)
    parent = relationship('ThirdEntity', back_populates='children')
`,
      status: 'validated'
    };
    const reqs = {
      entities: ['ParentRecord', 'ChildRecord', 'ThirdEntity'],
      tables: ['parent_records', 'child_records', 'third_entities']
    };
    const files = [baseFile, modelsFile];
    const res = await validateDatabasePhase(
      [{ required_files: files }],
      createManifest(files, reqs),
      '',
      dummyCaller,
      dummySendEvent,
      { skipSqlalchemy: true }
    );
    assert.strictEqual(res.isValid, false);
    const defect = res.defects.find(d => d.code === DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP);
    assert(defect, 'Must produce DB_REL001 defect');
    assert.strictEqual(defect.actualState, 'wrong_target_model');
  });

  // 5. ForeignKey referencing non-existent column in valid table
  await asyncTest('ForeignKey referencing missing column in existing table fails with DB_FK001', async () => {
    const modelsFile = {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

class ParentRecord(Base):
    __tablename__ = 'parent_records'
    id = Column(Integer, primary_key=True)
    name = Column(String(50))

class ChildRecord(Base):
    __tablename__ = 'child_records'
    id = Column(Integer, primary_key=True)
    parent_id = Column(Integer, ForeignKey('parent_records.nonexistent_column'))
`,
      status: 'validated'
    };
    const reqs = {
      entities: ['ParentRecord', 'ChildRecord'],
      tables: ['parent_records', 'child_records']
    };
    const files = [baseFile, modelsFile];
    const res = await validateDatabasePhase(
      [{ required_files: files }],
      createManifest(files, reqs),
      '',
      dummyCaller,
      dummySendEvent,
      { skipSqlalchemy: true }
    );
    assert.strictEqual(res.isValid, false);
    const defect = res.defects.find(d => d.code === DATABASE_DEFECT_CODES.FOREIGN_KEY_FAILURE);
    assert(defect, 'Must produce DB_FK001 defect');
    assert.strictEqual(defect.targetColumn, 'nonexistent_column');
    assert.strictEqual(defect.targetTable, 'parent_records');
  });

  // 6. ForeignKey referencing non-existent table
  await asyncTest('ForeignKey referencing unknown table fails validation', async () => {
    const modelsFile = {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer, ForeignKey
from .database import Base

class ChildRecord(Base):
    __tablename__ = 'child_records'
    id = Column(Integer, primary_key=True)
    parent_id = Column(Integer, ForeignKey('unknown_table.id'))
`,
      status: 'validated'
    };
    const reqs = {
      entities: ['ChildRecord'],
      tables: ['child_records']
    };
    const files = [baseFile, modelsFile];
    const res = await validateDatabasePhase(
      [{ required_files: files }],
      createManifest(files, reqs),
      '',
      dummyCaller,
      dummySendEvent,
      { skipSqlalchemy: true }
    );
    assert.strictEqual(res.isValid, false);
    const defect = res.defects.find(d => d.code === DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP);
    assert(defect, 'Must produce defect for unknown table');
    assert.strictEqual(defect.targetTable, 'unknown_table');
  });

  // 7. Prisma valid schema with relation and foreign key field
  await asyncTest('Valid Prisma schema relation passes validation', async () => {
    const prismaFile = {
      path: 'schema.prisma',
      content: `
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

model ParentEntity {
  id       Int           @id @default(autoincrement())
  children ChildEntity[]
}

model ChildEntity {
  id       Int          @id @default(autoincrement())
  parentId Int
  parent   ParentEntity @relation(fields: [parentId], references: [id])
}
`,
      status: 'validated'
    };
    const reqs = {
      entities: ['ParentEntity', 'ChildEntity'],
      tables: ['parent_entities', 'child_entities']
    };
    const files = [prismaFile];
    const res = await validateDatabasePhase(
      [{ required_files: files }],
      {
        ...createManifest(files, reqs),
        architectureContract: { language: 'typescript', orm: 'prisma' }
      },
      '',
      dummyCaller,
      dummySendEvent
    );
    assert.strictEqual(res.isValid, true, 'Valid Prisma relations must pass');
  });

  // 8. Prisma schema with missing foreign key field fails with DB_FK001
  await asyncTest('Prisma schema with missing relation field fails with DB_FK001', async () => {
    const prismaFile = {
      path: 'schema.prisma',
      content: `
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

model ParentEntity {
  id Int @id @default(autoincrement())
}

model ChildEntity {
  id     Int          @id @default(autoincrement())
  parent ParentEntity @relation(fields: [missingFkField], references: [id])
}
`,
      status: 'validated'
    };
    const reqs = {
      entities: ['ParentEntity', 'ChildEntity'],
      tables: ['parent_entities', 'child_entities']
    };
    const files = [prismaFile];
    const res = await validateDatabasePhase(
      [{ required_files: files }],
      {
        ...createManifest(files, reqs),
        architectureContract: { language: 'typescript', orm: 'prisma' }
      },
      '',
      dummyCaller,
      dummySendEvent
    );
    assert.strictEqual(res.isValid, false);
    const defect = res.defects.find(d => d.code === DATABASE_DEFECT_CODES.FOREIGN_KEY_FAILURE);
    assert(defect, 'Must produce DB_FK001 for missing Prisma foreign key field');
    assert.strictEqual(defect.field, 'missingFkField');
  });

  // 9. Prisma schema referencing unknown target model fails with DB_REL001
  await asyncTest('Prisma schema referencing unknown target model fails with DB_REL001', async () => {
    const prismaFile = {
      path: 'schema.prisma',
      content: `
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

model ChildEntity {
  id       Int           @id @default(autoincrement())
  parentId Int
  parent   GhostEntity   @relation(fields: [parentId], references: [id])
}
`,
      status: 'validated'
    };
    const reqs = {
      entities: ['ChildEntity'],
      tables: ['child_entities']
    };
    const files = [prismaFile];
    const res = await validateDatabasePhase(
      [{ required_files: files }],
      {
        ...createManifest(files, reqs),
        architectureContract: { language: 'typescript', orm: 'prisma' }
      },
      '',
      dummyCaller,
      dummySendEvent
    );
    assert.strictEqual(res.isValid, false);
    const defect = res.defects.find(d => d.code === DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP);
    assert(defect, 'Must produce DB_REL001 for unknown target model in Prisma');
    assert.strictEqual(defect.targetModel, 'GhostEntity');
  });

  // 10. Repair Strategy Mapping
  test('getRepairStrategy returns correct strategies for DB_REL001 and DB_FK001', () => {
    const relStrategy = getRepairStrategy(DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP);
    assert(relStrategy, 'RelationshipRepairStrategy must exist');
    assert.strictEqual(relStrategy.name, 'RelationshipRepairStrategy');

    const fkStrategy = getRepairStrategy(DATABASE_DEFECT_CODES.FOREIGN_KEY_FAILURE);
    assert(fkStrategy, 'ForeignKeyRepairStrategy must exist');
    assert.strictEqual(fkStrategy.name, 'ForeignKeyRepairStrategy');
    assert(fkStrategy.instructions.length > 0);
  });

  console.log(`\n====================================================`);
  console.log(`Phase 6 ORM Semantics Suite: ${passed}/${total} tests passed (100%)`);
  console.log(`====================================================`);
}

runPhase6Tests().catch(err => {
  console.error('\n❌ Phase 6 Test Suite Failed:', err);
  process.exit(1);
});
