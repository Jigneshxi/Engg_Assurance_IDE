import { scanForCredentials, redactSecret, DATABASE_DEFECT_CODES } from '../dbValidator.js';

async function runTests() {
  let passed = 0;
  let total = 0;

  const test = (name, fileObj, shouldFail, expectedRedaction = null) => {
    total++;
    const defects = scanForCredentials(fileObj);
    const hasDefects = defects.length > 0;
    let ok = hasDefects === shouldFail;

    if (shouldFail && defects.length > 0) {
      if (defects[0].code !== DATABASE_DEFECT_CODES.CREDENTIALS_EXPOSED) {
        ok = false;
        console.error(`❌ Defect code mismatch: expected ${DATABASE_DEFECT_CODES.CREDENTIALS_EXPOSED}, got ${defects[0].code}`);
      }
      if (expectedRedaction && !defects[0].evidence.includes(expectedRedaction)) {
        ok = false;
        console.error(`❌ Expected redacted evidence to contain "${expectedRedaction}", got "${defects[0].evidence}"`);
      }
      // CRITICAL: Ensure secret password is NOT in evidence
      if (defects[0].evidence.includes('secret123') || defects[0].evidence.includes('my-password') || defects[0].evidence.includes('superpass')) {
        ok = false;
        console.error(`❌ SECURITY LEAK: Evidence contains unredacted secret! Evidence: "${defects[0].evidence}"`);
      }
    }

    if (ok) {
      console.log(`✅ Test ${total} PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ Test ${total} FAIL: ${name}`);
      console.error('   Defects:', defects);
    }
  };

  // BAD: Hardcoded connection string with username and password
  test('BAD: postgresql connection string with password', {
    path: 'backend/app/db/database.py',
    content: 'DATABASE_URL = "postgresql://postgres:secret123@localhost:5432/mydb"'
  }, true, '***');

  // BAD: MySQL connection string with password
  test('BAD: mysql connection string with password', {
    path: 'backend/app/db/database.py',
    content: 'DATABASE_URL = "mysql+pymysql://admin:superpass@db.internal:3306/prod"'
  }, true, '***');

  // BAD: MongoDB connection string with password
  test('BAD: mongodb connection string with password', {
    path: 'backend/app/db/database.py',
    content: 'const MONGO_URI = "mongodb://clusterUser:my-password@cluster0.mongodb.net/app";'
  }, true, '***');

  // BAD: Explicit DB_PASSWORD assignment
  test('BAD: DB_PASSWORD variable assignment', {
    path: 'backend/app/db/config.py',
    content: 'DB_PASSWORD = "secret123"'
  }, true, '***');

  // BAD: Explicit POSTGRES_PASSWORD assignment
  test('BAD: POSTGRES_PASSWORD variable assignment', {
    path: 'backend/app/db/config.py',
    content: 'POSTGRES_PASSWORD = "my-password"'
  }, true, '***');

  // BAD: Documentation must still flag a real credential-bearing URL
  test('BAD: README with actual database credentials', {
    path: 'README.md',
    content: 'DATABASE_URL=postgresql://shop_admin:secret123@db.example.com:5432/shop'
  }, true, '***');

  // GOOD: Environment-variable documentation does not embed credentials
  test('GOOD: README documents DATABASE_URL as an environment variable', {
    path: 'README.md',
    content: 'DATABASE_URL=${DATABASE_URL}'
  }, false);

  // GOOD: Explicit documentation placeholders are not literal credentials
  test('GOOD: README contains a generic PostgreSQL placeholder URL', {
    path: 'README.md',
    content: 'DATABASE_URL=postgresql://user:password@host:port/database'
  }, false);

  // GOOD: Local test URLs with placeholder user/password remain safe examples
  test('GOOD: README contains a localhost test database placeholder URL', {
    path: 'README.md',
    content: 'DATABASE_URL=postgresql://user:password@localhost:5432/test_db'
  }, false);

  // BAD: A realistic password remains a finding even on localhost/test DBs
  test('BAD: README contains a non-placeholder password on localhost', {
    path: 'README.md',
    content: 'DATABASE_URL=postgresql://shop_admin:password123@localhost:5432/test_db'
  }, true, '***');

  // GOOD: Safe environment variable read via os.getenv
  test('GOOD: os.getenv("DATABASE_URL")', {
    path: 'backend/app/db/database.py',
    content: 'DATABASE_URL = os.getenv("DATABASE_URL")'
  }, false);

  // GOOD: Safe environment variable read in Node.js
  test('GOOD: process.env.DATABASE_URL', {
    path: 'backend/app/db/database.js',
    content: 'const databaseUrl = process.env.DATABASE_URL;'
  }, false);

  // GOOD: Config object reference
  test('GOOD: config.databaseUrl', {
    path: 'backend/app/db/database.js',
    content: 'const databaseUrl = config.databaseUrl;'
  }, false);

  // GOOD: env.DATABASE_URL reference
  test('GOOD: env.DATABASE_URL', {
    path: 'backend/app/db/database.ts',
    content: 'const databaseUrl = env.DATABASE_URL;'
  }, false);

  // GOOD: Development SQLite database path (no credentials)
  test('GOOD: Development SQLite URL (sqlite:///./test.db)', {
    path: 'backend/app/db/database.py',
    content: 'DATABASE_URL = "sqlite:///./test.db"'
  }, false);

  // GOOD: In-memory SQLite (sqlite:///:memory:)
  test('GOOD: In-memory SQLite URL', {
    path: 'backend/app/db/database.py',
    content: 'DATABASE_URL = "sqlite:///:memory:"'
  }, false);

  // GOOD: Default fallback to SQLite in getenv
  test('GOOD: os.getenv with SQLite fallback', {
    path: 'backend/app/db/database.py',
    content: 'DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sql_app.db")'
  }, false);

  // GOOD: alembic.ini exclusion
  test('GOOD: alembic.ini with generic driver placeholder', {
    path: 'backend/alembic.ini',
    content: 'sqlalchemy.url = driver://user:pass@localhost/dbname'
  }, false);

  // Secret redaction helper unit test
  const sampleSecret = 'DATABASE_URL = "postgresql://root:supersecret99@host:5432/db"';
  const redacted = redactSecret(sampleSecret);
  if (!redacted.includes('supersecret99') && redacted.includes('***')) {
    console.log(`✅ redactSecret correctly hides credentials`);
    passed++;
  } else {
    console.error(`❌ redactSecret failed to redact: ${redacted}`);
  }
  total++;

  console.log(`\nResults: ${passed}/${total} credential validation tests passed.`);
  process.exit(passed === total ? 0 : 1);
}

runTests().catch(console.error);
