import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
import { executeGeneration } from '../orchestrator.js';

const prd = `AI Customer Support & Ticket Management Platform

It requires:

Frontend:
- React + TypeScript
- React Router
- role-based interfaces
- Customer
- Support Agent
- Team Manager
- Admin
- Ticket management
- Ticket conversations
- AI features
- Knowledge Base
- Notifications

Backend:
- Python 3.12
- FastAPI
- Pydantic
- PostgreSQL
- SQLAlchemy
- Alembic
- JWT authentication
- RBAC
- multi-tenant organization isolation
- AI service layer
- knowledge-base service
- notification service

Required major backend modules:
- authentication
- organizations
- users
- roles
- tickets
- ticket messages
- attachments
- categories
- knowledge base
- AI interactions
- notifications
- audit logs

Required AI functionality:
- ticket classification
- priority detection
- ticket summarization
- response suggestions
- knowledge-base retrieval
- sentiment analysis
- conversation context

Required API areas:
- auth
- tickets
- ticket messages
- assignment
- close ticket
- AI
- knowledge base
- admin

Required testing:
- backend Pytest
- frontend Jest/React Testing Library
`;

async function runTest() {
  const workspacePath = path.join(process.cwd(), 'real_workspace_test');
  if (fs.existsSync(workspacePath)) {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
  fs.mkdirSync(workspacePath);

  const sendEvent = (type, data) => {
    if (type === 'log') {
      console.log(data);
    }
  };

  console.log("=== STARTING REAL OLLAMA E2E GENERATION ===");
  try {
    await executeGeneration({
      prd,
      existingFiles: [],
      generationMode: 'new',
      workspacePath,
      cavemanMode: false
    }, sendEvent);
    
    console.log("=== REAL GENERATION FINISHED ===");
  } catch (e) {
    console.error("Test execution failed:", e);
  }
}

runTest();
