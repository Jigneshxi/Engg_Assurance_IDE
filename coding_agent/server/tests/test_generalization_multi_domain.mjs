import assert from 'assert';
import {
  generateRequirementContract,
  generateArchitectureContract,
  generateManifest,
  determineActiveLayer,
  selectReadyModules
} from '../orchestrator.js';
import { validateManifestStructurally } from '../manifestValidator.js';
import { validateDatabasePhase } from '../dbValidator.js';
import { detectSemanticRepairProgress } from '../repairEngine.js';

console.log('============================================================');
console.log('OPENCLAW GENERALIZATION & MULTI-DOMAIN TEST SUITE');
console.log('============================================================');

// Mock LLM caller that produces domain-appropriate responses deterministically
function createDomainMockLLM(domainConfig) {
  return async (systemPrompt, userPrompt) => {
    // 0. Semantic Manifest QA Request
    if (systemPrompt.includes('evaluating a generated project manifest') || userPrompt.includes('GENERATED MANIFEST:')) {
      return JSON.stringify({ isValid: true, errors: [] });
    }

    // Database Semantic QA Request
    if (systemPrompt.includes('QA Database Architect') || systemPrompt.includes('semanticIssues')) {
      return JSON.stringify({ isValid: true, semanticIssues: [] });
    }

    // 1. Manifest Generation Request
    if (systemPrompt.includes('JSON manifest containing the MODULES') || systemPrompt.includes('Structured Generation Manifest') || userPrompt.includes('Output Manifest JSON')) {
      return JSON.stringify(domainConfig.manifest);
    }

    // 2. Architecture Contract Request
    if (systemPrompt.includes('Architecture Contract') || userPrompt.includes('Generate Architecture Contract JSON:')) {
      return JSON.stringify({
        project_name: domainConfig.name,
        domain: domainConfig.domain,
        language: "python",
        backend_framework: "fastapi",
        frontend_framework: "react",
        database: "sqlite",
        orm: "sqlalchemy",
        project_structure: {
          backend_root: "backend",
          frontend_root: "frontend",
          db_models_path: "backend/app/db/models.py",
          db_connection_path: "backend/app/db/database.py",
          base_import: "from app.db.database import Base",
          get_db_import: "from app.db.database import get_db",
          backend_entrypoint: "backend/main.py",
          frontend_entrypoint: "frontend/src/App.tsx"
        },
        auth_architecture: "jwt_bearer",
        api_prefix: "/api",
        entities: domainConfig.entities.map(e => ({ name: e, table: e.toLowerCase() + 's' })),
        environment_variables: [
          { name: "DATABASE_URL", required: true, default_dev: "sqlite:///./app.db" }
        ]
      });
    }

    // 3. Requirement Contract Request
    if (systemPrompt.includes('Requirement Contract') || userPrompt.includes('Requirement Contract')) {
      return JSON.stringify({
        requirements: domainConfig.requirements
      });
    }

    return '{}';
  };
}

// -------------------------------------------------------------
// PRD 1: QuickCart (E-Commerce Reference)
// -------------------------------------------------------------
const prd1QuickCart = {
  name: "QuickCart",
  domain: "ecommerce",
  requirements: [
    { id: "REQ-001", description: "Product catalog and inventory browsing", type: "backend" },
    { id: "REQ-002", description: "Cart management and checkout calculation", type: "backend" },
    { id: "REQ-003", description: "Order creation, payment processing, and history", type: "backend" },
    { id: "REQ-004", description: "Storefront UI for browsing and purchase", type: "frontend" }
  ],
  entities: ["Product", "Category", "Cart", "CartItem", "Order", "OrderItem", "Payment", "User"],
  manifest: {
    project_id: "quickcart",
    project_requirements: {
      database: {
        entities: ["Product", "Category", "Order", "OrderItem", "User"],
        tables: ["products", "categories", "orders", "order_items", "users"],
        relationships: [
          { from: "OrderItem", to: "Product", type: "many-to-one" },
          { from: "OrderItem", to: "Order", type: "many-to-one" }
        ],
        foreign_keys: [
          { table: "order_items", column: "product_id", references: "products.id" },
          { table: "order_items", column: "order_id", references: "orders.id" }
        ],
        migrations_required: false,
        seed_required: false,
        initialization_requirements: true
      },
      backend: { framework: "fastapi", auth: "jwt_bearer" },
      frontend: { framework: "react" }
    },
    modules: [
      {
        id: "MOD-000",
        name: "Database Architecture & Schema",
        layer: "DATABASE",
        dependencies: [],
        required_files: [
          { path: "backend/app/db/database.py", purpose: "Engine and session setup" },
          { path: "backend/app/db/models.py", purpose: "Canonical SQLAlchemy models" }
        ]
      },
      {
        id: "MOD-001",
        name: "Backend Foundation",
        layer: "BACKEND_FOUNDATION",
        dependencies: ["MOD-000"],
        required_files: [
          { path: "backend/main.py", purpose: "FastAPI application entrypoint" }
        ]
      },
      {
        id: "MOD-002",
        name: "Catalog & Orders API",
        layer: "BACKEND",
        dependencies: ["MOD-001"],
        required_files: [
          { path: "backend/app/api/products.py", purpose: "Product endpoints" },
          { path: "backend/app/api/orders.py", purpose: "Order endpoints" }
        ]
      },
      {
        id: "MOD-005",
        name: "Storefront Frontend",
        layer: "FRONTEND",
        dependencies: ["MOD-002"],
        required_files: [
          { path: "frontend/src/App.tsx", purpose: "Frontend application root" },
          { path: "frontend/src/pages/Catalog.tsx", purpose: "Product listing page" }
        ]
      }
    ]
  }
};

// -------------------------------------------------------------
// PRD 2: Hospital Management System
// -------------------------------------------------------------
const prd2Hospital = {
  name: "HospitalCare",
  domain: "healthcare",
  requirements: [
    { id: "REQ-001", description: "Patient registration and medical history records", type: "backend" },
    { id: "REQ-002", description: "Doctor scheduling and department assignments", type: "backend" },
    { id: "REQ-003", description: "Patient appointment booking and status transitions", type: "backend" },
    { id: "REQ-004", description: "Prescriptions generation with drug dosage information", type: "backend" },
    { id: "REQ-005", description: "Medical billing and insurance claims", type: "backend" },
    { id: "REQ-006", description: "Clinical portal UI for doctors and administrators", type: "frontend" }
  ],
  entities: ["Patient", "Doctor", "Appointment", "Prescription", "MedicalRecord", "Billing"],
  manifest: {
    project_id: "hospital_care",
    project_requirements: {
      database: {
        entities: ["Patient", "Doctor", "Appointment", "Prescription", "MedicalRecord", "Billing"],
        tables: ["patients", "doctors", "appointments", "prescriptions", "medical_records", "billings"],
        relationships: [
          { from: "Appointment", to: "Doctor", type: "many-to-one" },
          { from: "Appointment", to: "Patient", type: "many-to-one" },
          { from: "Prescription", to: "Appointment", type: "many-to-one" },
          { from: "Billing", to: "Patient", type: "many-to-one" }
        ],
        foreign_keys: [
          { table: "appointments", column: "doctor_id", references: "doctors.id" },
          { table: "appointments", column: "patient_id", references: "patients.id" },
          { table: "prescriptions", column: "appointment_id", references: "appointments.id" },
          { table: "billings", column: "patient_id", references: "patients.id" }
        ],
        migrations_required: false,
        seed_required: false,
        initialization_requirements: true
      },
      backend: { framework: "fastapi", auth: "jwt_bearer" },
      frontend: { framework: "react" }
    },
    modules: [
      {
        id: "MOD-000",
        name: "Database Architecture & Schema",
        layer: "DATABASE",
        dependencies: [],
        required_files: [
          { path: "backend/app/db/database.py", purpose: "Engine and session setup" },
          { path: "backend/app/db/models.py", purpose: "Clinical models" }
        ]
      },
      {
        id: "MOD-001",
        name: "Backend Foundation",
        layer: "BACKEND_FOUNDATION",
        dependencies: ["MOD-000"],
        required_files: [
          { path: "backend/main.py", purpose: "Hospital service entrypoint" }
        ]
      },
      {
        id: "MOD-002",
        name: "Patients & Appointments API",
        layer: "BACKEND",
        dependencies: ["MOD-001"],
        required_files: [
          { path: "backend/app/api/patients.py", purpose: "Patient endpoints" },
          { path: "backend/app/api/appointments.py", purpose: "Appointment scheduling" }
        ]
      },
      {
        id: "MOD-003",
        name: "Prescriptions & Billing API",
        layer: "BACKEND",
        dependencies: ["MOD-001"],
        required_files: [
          { path: "backend/app/api/prescriptions.py", purpose: "Prescriptions endpoints" },
          { path: "backend/app/api/billing.py", purpose: "Billing endpoints" }
        ]
      },
      {
        id: "MOD-005",
        name: "Clinical Portal Frontend",
        layer: "FRONTEND",
        dependencies: ["MOD-002", "MOD-003"],
        required_files: [
          { path: "frontend/src/App.tsx", purpose: "Portal root" },
          { path: "frontend/src/pages/Appointments.tsx", purpose: "Appointment calendar" }
        ]
      }
    ]
  }
};

// -------------------------------------------------------------
// PRD 3: CRM System
// -------------------------------------------------------------
const prd3CRM = {
  name: "CloudCRM",
  domain: "crm",
  requirements: [
    { id: "REQ-001", description: "Organization and account profile management", type: "backend" },
    { id: "REQ-002", description: "Contact directory with email and phone tracking", type: "backend" },
    { id: "REQ-003", description: "Lead intake, scoring, and pipeline qualification", type: "backend" },
    { id: "REQ-004", description: "Deal stages, financial forecasting, and win/loss records", type: "backend" },
    { id: "REQ-005", description: "Activity log for calls, meetings, and notes", type: "backend" },
    { id: "REQ-006", description: "Sales pipeline Kanban dashboard UI", type: "frontend" }
  ],
  entities: ["Organization", "User", "Lead", "Contact", "Deal", "Activity"],
  manifest: {
    project_id: "cloud_crm",
    project_requirements: {
      database: {
        entities: ["Organization", "User", "Lead", "Contact", "Deal", "Activity"],
        tables: ["organizations", "users", "leads", "contacts", "deals", "activities"],
        relationships: [
          { from: "Contact", to: "Organization", type: "many-to-one" },
          { from: "Deal", to: "Organization", type: "many-to-one" },
          { from: "Activity", to: "Deal", type: "many-to-one" }
        ],
        foreign_keys: [
          { table: "contacts", column: "organization_id", references: "organizations.id" },
          { table: "deals", column: "organization_id", references: "organizations.id" },
          { table: "activities", column: "deal_id", references: "deals.id" }
        ],
        migrations_required: false,
        seed_required: false,
        initialization_requirements: true
      },
      backend: { framework: "fastapi", auth: "jwt_bearer" },
      frontend: { framework: "react" }
    },
    modules: [
      {
        id: "MOD-000",
        name: "Database Architecture & Schema",
        layer: "DATABASE",
        dependencies: [],
        required_files: [
          { path: "backend/app/db/database.py", purpose: "Engine and session setup" },
          { path: "backend/app/db/models.py", purpose: "CRM models" }
        ]
      },
      {
        id: "MOD-001",
        name: "Backend Foundation",
        layer: "BACKEND_FOUNDATION",
        dependencies: ["MOD-000"],
        required_files: [
          { path: "backend/main.py", purpose: "CRM service entrypoint" }
        ]
      },
      {
        id: "MOD-002",
        name: "Leads & Organizations API",
        layer: "BACKEND",
        dependencies: ["MOD-001"],
        required_files: [
          { path: "backend/app/api/organizations.py", purpose: "Account endpoints" },
          { path: "backend/app/api/leads.py", purpose: "Lead qualification" }
        ]
      },
      {
        id: "MOD-003",
        name: "Deals & Activities API",
        layer: "BACKEND",
        dependencies: ["MOD-001"],
        required_files: [
          { path: "backend/app/api/deals.py", purpose: "Deal pipeline" },
          { path: "backend/app/api/activities.py", purpose: "Activity tracking" }
        ]
      },
      {
        id: "MOD-005",
        name: "Sales Pipeline Frontend",
        layer: "FRONTEND",
        dependencies: ["MOD-002", "MOD-003"],
        required_files: [
          { path: "frontend/src/App.tsx", purpose: "Dashboard root" },
          { path: "frontend/src/pages/Pipeline.tsx", purpose: "Kanban board" }
        ]
      }
    ]
  }
};

// -------------------------------------------------------------
// PRD 4: AI Document / RAG Application
// -------------------------------------------------------------
const prd4RAG = {
  name: "DocumentRAG",
  domain: "ai_rag",
  requirements: [
    { id: "REQ-001", description: "Document upload and raw text ingestion", type: "backend" },
    { id: "REQ-002", description: "Text chunking and vector embedding generation", type: "backend" },
    { id: "REQ-003", description: "Semantic vector retrieval and top-k context extraction", type: "backend" },
    { id: "REQ-004", description: "LLM answer synthesis with strict citation tracking", type: "backend" },
    { id: "REQ-005", description: "Document manager and interactive QA chat interface", type: "frontend" }
  ],
  entities: ["Document", "Chunk", "Embedding", "Retrieval", "Query", "Answer"],
  manifest: {
    project_id: "doc_rag",
    project_requirements: {
      database: {
        entities: ["Document", "Chunk", "Query", "Answer"],
        tables: ["documents", "chunks", "queries", "answers"],
        relationships: [
          { from: "Chunk", to: "Document", type: "many-to-one" },
          { from: "Answer", to: "Query", type: "one-to-one" }
        ],
        foreign_keys: [
          { table: "chunks", column: "document_id", references: "documents.id" },
          { table: "answers", column: "query_id", references: "queries.id" }
        ],
        migrations_required: false,
        seed_required: false,
        initialization_requirements: true
      },
      backend: { framework: "fastapi", auth: "jwt_bearer" },
      frontend: { framework: "react" }
    },
    modules: [
      {
        id: "MOD-000",
        name: "Database Architecture & Schema",
        layer: "DATABASE",
        dependencies: [],
        required_files: [
          { path: "backend/app/db/database.py", purpose: "Engine and session setup" },
          { path: "backend/app/db/models.py", purpose: "RAG Document and Chunk models" }
        ]
      },
      {
        id: "MOD-001",
        name: "Backend Foundation",
        layer: "BACKEND_FOUNDATION",
        dependencies: ["MOD-000"],
        required_files: [
          { path: "backend/main.py", purpose: "RAG service entrypoint" }
        ]
      },
      {
        id: "MOD-002",
        name: "Ingestion & Vector Pipeline API",
        layer: "BACKEND",
        dependencies: ["MOD-001"],
        required_files: [
          { path: "backend/app/api/ingestion.py", purpose: "Document upload and chunking" },
          { path: "backend/app/api/query.py", purpose: "Vector retrieval and answer generation" }
        ]
      },
      {
        id: "MOD-005",
        name: "RAG Knowledge Explorer UI",
        layer: "FRONTEND",
        dependencies: ["MOD-002"],
        required_files: [
          { path: "frontend/src/App.tsx", purpose: "Knowledge explorer root" },
          { path: "frontend/src/pages/DocumentChat.tsx", purpose: "Chat with citations view" }
        ]
      }
    ]
  }
};

const domains = [
  { name: "QuickCart (E-Commerce)", config: prd1QuickCart, prdText: "Build an e-commerce platform with products, orders, cart, and payments." },
  { name: "Hospital Management", config: prd2Hospital, prdText: "Build a clinical management platform for patients, doctors, appointments, prescriptions, and billing." },
  { name: "CRM System", config: prd3CRM, prdText: "Build a customer relationship management application for organizations, leads, contacts, deals, and activities." },
  { name: "AI/RAG Application", config: prd4RAG, prdText: "Build a RAG system for document uploads, text chunking, embeddings, semantic retrieval, and citation-backed question answering." }
];

async function runGeneralizationTests() {
  let passedCount = 0;
  let totalTests = 0;

  for (const { name, config, prdText } of domains) {
    console.log(`\n============================================================`);
    console.log(`TESTING DOMAIN: ${name}`);
    console.log(`============================================================`);

    const mockLLM = createDomainMockLLM(config);
    const events = [];
    const sendEvent = (event, data) => events.push({ event, data });

    // Step 1: Requirement Contract Generation
    totalTests++;
    console.log(`[1] Testing Dynamic Requirement Contract Generation for ${name}...`);
    const reqContract = await generateRequirementContract(prdText, mockLLM, sendEvent, "test-" + config.domain);
    assert.ok(reqContract.requirements.length > 0, "Requirement contract must have requirements");
    assert.deepStrictEqual(reqContract.requirements, config.requirements);
    console.log(`✅ PASS: Requirement Contract generated with ${reqContract.requirements.length} domain requirements.`);
    passedCount++;

    // Step 2: Architecture Contract Generation
    totalTests++;
    console.log(`[2] Testing Dynamic Architecture Contract Generation for ${name}...`);
    const archContract = await generateArchitectureContract(prdText, reqContract, mockLLM, sendEvent, "test-" + config.domain);
    assert.strictEqual(archContract.domain, config.domain);
    assert.ok(archContract.project_structure.backend_root === 'backend');
    console.log(`✅ PASS: Architecture Contract generated for domain '${archContract.domain}' with canonical entrypoints.`);
    passedCount++;

    // Step 3: Manifest Generation with Injected Contracts
    totalTests++;
    console.log(`[3] Testing Dynamic Manifest Generation for ${name}...`);
    let manifest;
    try {
      manifest = await generateManifest(prdText, [], 'new', sendEvent, mockLLM, "test-" + config.domain, archContract, reqContract);
    } catch (e) {
      console.error("Events before failure:", events);
      throw e;
    }
    assert.ok(manifest.modules.length >= 4, "Manifest must have at least 4 modules");
    console.log(`✅ PASS: Manifest generated with ${manifest.modules.length} modules.`);
    passedCount++;

    // Step 4: Manifest Structural & Single Ownership Validation
    totalTests++;
    console.log(`[4] Validating Manifest Structure and Ownership for ${name}...`);
    const manifestQA = validateManifestStructurally(manifest);
    assert.strictEqual(manifestQA.isValid, true, `Manifest validation failed: ${JSON.stringify(manifestQA.errors)}`);
    console.log(`✅ PASS: Manifest validation passed with 0 errors and 0 duplicate ownership claims.`);
    passedCount++;

    // Step 5: Scheduler & DAG Verification
    totalTests++;
    console.log(`[5] Testing Scheduler Layer Ordering & Dependency Gating for ${name}...`);
    // MOD-000 must be in DATABASE layer and eligible first
    const activeLayer = determineActiveLayer(manifest.modules);
    assert.strictEqual(activeLayer, 'DATABASE');
    const readyAtStart = selectReadyModules(manifest.modules, manifest.modules, activeLayer);
    assert.strictEqual(readyAtStart.length, 1);
    assert.strictEqual(readyAtStart[0].id, 'MOD-000');

    // Dependent modules must be blocked until MOD-000 passes
    const backendModules = manifest.modules.filter(m => m.layer === 'BACKEND' || m.layer === 'BACKEND_FOUNDATION');
    const prematureBackendReady = selectReadyModules(backendModules, manifest.modules, 'BACKEND_FOUNDATION');
    assert.strictEqual(prematureBackendReady.length, 0, "Backend foundation must not be eligible before DATABASE passes");
    console.log(`✅ PASS: Scheduler correctly enforces layer boundaries and dependency gating.`);
    passedCount++;

    // Step 6: Generic Database Validation for This Domain
    totalTests++;
    console.log(`[6] Testing Generic Database Validation for ${name} entities...`);
    // Create mock database files matching this domain's entities
    const dbModule = manifest.modules.find(m => m.id === 'MOD-000');
    
    // Generate synthetic model content for this domain's entities
    let syntheticModels = "from app.db.database import Base\nfrom sqlalchemy import Column, Integer, String, ForeignKey\nfrom sqlalchemy.orm import relationship\n\n";
    for (const ent of config.manifest.project_requirements.database.entities) {
      const tbl = ent.toLowerCase() + 's';
      syntheticModels += `class ${ent}(Base):\n    __tablename__ = '${tbl}'\n    id = Column(Integer, primary_key=True)\n`;
      
      // Add foreign keys and relationships if defined
      const fks = config.manifest.project_requirements.database.foreign_keys.filter(fk => fk.table === tbl);
      for (const fk of fks) {
        syntheticModels += `    ${fk.column} = Column(Integer, ForeignKey('${fk.references}'))\n`;
      }
      const rels = config.manifest.project_requirements.database.relationships.filter(r => r.from === ent);
      for (const r of rels) {
        syntheticModels += `    ${r.to.toLowerCase()} = relationship('${r.to}')\n`;
      }
      syntheticModels += '\n';
    }

    dbModule.required_files[0].content = "from sqlalchemy import create_engine\nfrom sqlalchemy.orm import sessionmaker, declarative_base\nBase = declarative_base()\n";
    dbModule.required_files[1].content = syntheticModels;

    const dbValidationResult = await validateDatabasePhase([dbModule], manifest, prdText, mockLLM, sendEvent, {
      authoritativeOrm: false // Static check mode
    });

    assert.strictEqual(dbValidationResult.isValid, true, `DB validation failed for ${name}: ${JSON.stringify(dbValidationResult.errors)}`);
    console.log(`✅ PASS: Database validation dynamically verified all ${config.entities.length} ${name} entities and relationships.`);
    passedCount++;
  }

  // Step 7: Failure Injection & Oscillation Detection Test
  console.log(`\n============================================================`);
  console.log(`PHASE 20 & 11: FAILURE INJECTION & OSCILLATION DETECTION TEST`);
  console.log(`============================================================`);
  totalTests++;
  console.log(`Testing SEMANTIC_REPAIR_OSCILLATION detection...`);

  // Simulate alternating states between State A (database.py import) and State B (base.py import)
  const defectA = [{ code: 'DB_REL001', file: 'backend/app/db/models.py', model: 'Appointment', relationship: 'doctor' }];
  const defectB = [{ code: 'DB_REL001', file: 'backend/app/db/models.py', model: 'Doctor', relationship: 'appointments' }];

  // Step 1: Initial defect A
  const state1 = detectSemanticRepairProgress({
    previous: null,
    defects: defectA,
    fileHashes: { 'backend/app/db/models.py': 'hash_state_A' }
  });
  assert.strictEqual(state1.status, 'PROGRESS');

  // Step 2: Transition to defect B
  const state2 = detectSemanticRepairProgress({
    previous: state1.state,
    defects: defectB,
    fileHashes: { 'backend/app/db/models.py': 'hash_state_B' }
  });
  assert.strictEqual(state2.status, 'PROGRESS');

  // Step 3: Oscillation back to defect A and file hash A
  const state3 = detectSemanticRepairProgress({
    previous: state2.state,
    defects: defectA,
    fileHashes: { 'backend/app/db/models.py': 'hash_state_A' }
  });

  assert.strictEqual(state3.status, 'SEMANTIC_REPAIR_OSCILLATION', `Expected SEMANTIC_REPAIR_OSCILLATION, got: ${state3.status}`);
  console.log(`✅ PASS: Oscillation back to prior repair state was terminated with SEMANTIC_REPAIR_OSCILLATION.`);
  passedCount++;

  console.log(`\n============================================================`);
  console.log(`GENERALIZATION TEST RESULTS: ${passedCount}/${totalTests} TESTS PASSED`);
  console.log(`============================================================`);
}

runGeneralizationTests().catch(err => {
  console.error('❌ Generalization Test Suite Failed:', err);
  process.exit(1);
});
