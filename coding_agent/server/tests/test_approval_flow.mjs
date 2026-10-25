import { executeGeneration } from '../orchestrator.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const prd = `
Small Test Project
DATABASE:
- users table
- products table

BACKEND:
- user API
- product API

FRONTEND:
- login page
- product page
`;

const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-test-approval-'));

function sendEvent(type, data) {
  if (type === 'log') {
    console.log(`[LOG] ${data.message || data}`);
  } else {
    console.log(`[EVENT] ${type}`, data);
  }
}

// Mock LLM function to quickly bypass actual LLM calls
async function mockLLM(system, user) {
  console.log(`[MOCK] System prompt: ${system.substring(0, 80)}`);
  if (system.includes('Enterprise Systems Architect')) {
    return JSON.stringify({
      project_name: "TestProject",
      domain: "test",
      language: "javascript",
      backend_framework: "express",
      frontend_framework: "react",
      database: "sqlite",
      orm: "sqlalchemy",
      project_structure: {
        backend_root: "backend",
        frontend_root: "frontend",
        db_models_path: "backend/db.js",
        db_connection_path: "backend/db.js",
        base_import: "const db = require('./db')",
        get_db_import: "const db = require('./db')",
        backend_entrypoint: "backend/foundation.js",
        frontend_entrypoint: "frontend/src/App.js"
      },
      auth_architecture: "none",
      api_prefix: "/api",
      entities: [{ name: "User", table: "users" }, { name: "Product", table: "products" }],
      environment_variables: []
    });
  }
  if (system.includes('Requirement Contract') && !system.includes('generated Manifest')) {
    return JSON.stringify({
      requirements: [
        { id: "REQ-001", description: "Test", source: "Test", type: "feature" }
      ]
    });
  }
  if (system.includes('generateManifest') || system.includes('machine-readable JSON manifest')) {
    return JSON.stringify({
      modules: [
        {
          id: 'MOD-000',
          name: 'Base Infrastructure',
          layer: 'GENERIC',
          dependencies: [],
          required_files: [{ path: 'package.json', purpose: 'Root config', type: 'generic' }]
        },
        {
          id: 'MOD-001',
          name: 'Database Models',
          layer: 'DATABASE',
          dependencies: ['MOD-000'],
          required_files: [{ path: 'backend/db.js', purpose: 'DB setup', type: 'backend' }]
        },
        {
          id: 'MOD-002',
          name: 'Backend Foundation',
          layer: 'BACKEND_FOUNDATION',
          dependencies: ['MOD-001'],
          required_files: [{ path: 'backend/foundation.js', purpose: 'Foundation setup', type: 'backend' }]
        },
        {
          id: 'MOD-003',
          name: 'Backend API',
          layer: 'BACKEND',
          dependencies: ['MOD-002'],
          required_files: [{ path: 'backend/api.js', purpose: 'API setup', type: 'backend' }]
        },
        {
          id: 'MOD-004',
          name: 'Frontend UI',
          layer: 'FRONTEND',
          dependencies: ['MOD-003'],
          required_files: [{ path: 'frontend/src/App.js', purpose: 'UI setup', type: 'frontend' }]
        }
      ],
      project_requirements: {
        database: { entities: [], tables: [] },
        backend: {},
        frontend: {}
      }
    });
  }
  
  if (user.includes('TARGET FILE: package.json')) {
    return `<file path="package.json">{}</file>`;
  }
  if (user.includes('TARGET FILE: backend/db.js')) {
    return `<file path="backend/db.js">console.log("db");</file>`;
  }
  if (user.includes('TARGET FILE: backend/foundation.js')) {
    return `<file path="backend/foundation.js">console.log("foundation");</file>`;
  }
  if (user.includes('TARGET FILE: backend/api.js')) {
    return `<file path="backend/api.js">console.log("api");</file>`;
  }
  if (user.includes('TARGET FILE: frontend/src/App.js')) {
    return `<file path="frontend/src/App.js">console.log("frontend");</file>`;
  }
  
  if (system.includes('dependency contract')) {
    return `Contract for ${user.slice(0, 50)}...`;
  }
  if (system.includes('Semantic Project Validation')) {
    return JSON.stringify({ complianceScore: 100, missingFeatures: [], implementedFeatures: [], missingFiles: [], unexpectedFiles: [], validationResults: 'Pass' });
  }
  
  if (system.includes('Principal Software Architect QA')) {
    return JSON.stringify({ isValid: true, errors: [] });
  }
  
  if (system.includes('QA Architect evaluating a generated project manifest')) {
    return JSON.stringify({ isValid: true, errors: [] });
  }
  
  if (system.includes('Compare the generated Manifest against the Requirement Contract') || system.includes('Requirement Coverage')) {
    return JSON.stringify({
      coverage: [
        { requirementId: "REQ-001", status: "COVERED", mappedTo: "test", reason: "test" }
      ]
    });
  }
  
  return `<file path="unknown">unknown</file>`;
}

async function runTest() {
  console.log("=== STARTING FIRST EXECUTION ===");
  await executeGeneration({
    prd,
    existingFiles: [],
    generationMode: 'new',
    workspacePath,
    mockLLM
  }, sendEvent);
  
  const manifestPath = path.join(workspacePath, '.openclaw/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`\nGlobal Status: ${manifest.globalStatus}`);
  console.log(`Current Layer: ${manifest.currentLayer}\n`);
  
  if (manifest.globalStatus === 'WAITING_FOR_APPROVAL') {
    console.log("=== APPROVING DATABASE AND RESUMING ===");
    manifest.globalStatus = 'RUNNING';
    manifest.approvedLayer = manifest.currentLayer;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    
    await executeGeneration({
      prd,
      existingFiles: [],
      generationMode: 'existing',
      workspacePath,
      mockLLM
    }, sendEvent);
    
    const manifest2 = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log(`\nGlobal Status: ${manifest2.globalStatus}`);
    console.log(`Current Layer: ${manifest2.currentLayer}\n`);
    
    if (manifest2.globalStatus === 'WAITING_FOR_APPROVAL') {
      console.log("=== APPROVING BACKEND AND RESUMING ===");
      manifest2.globalStatus = 'RUNNING';
      manifest2.approvedLayer = manifest2.currentLayer;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest2, null, 2));
      
      await executeGeneration({
        prd,
        existingFiles: [],
        generationMode: 'existing',
        workspacePath,
        mockLLM
      }, sendEvent);
      
      const manifest3 = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      console.log(`\nGlobal Status: ${manifest3.globalStatus}`);
      console.log(`Current Layer: ${manifest3.currentLayer}\n`);
    }
  }
}

runTest().catch(console.error);
