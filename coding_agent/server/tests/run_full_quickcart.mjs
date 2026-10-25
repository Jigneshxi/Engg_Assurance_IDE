import 'dotenv/config';
import { executeGeneration } from '../orchestrator.js';
import fs from 'fs';
import path from 'path';

const prd = `
# QuickCart PRD

## Overview
QuickCart is an e-commerce application with a comprehensive set of features designed to support modern online retail. It provides a complete flow for users to browse products, manage their cart, checkout, and track orders. It also provides an admin dashboard for inventory and order management.

## Architecture
- Backend: Node.js / Express or Python FastAPI.
- Database: PostgreSQL (using Prisma or SQLAlchemy).
- Frontend: React or Vue.js with modern routing and state management.
- Authentication: JWT based.

## Core Features
1. **User Authentication & Profiles**
   - User Registration (Email, Password, Name)
   - Login & JWT generation
   - User Profile viewing and updating
   - Address management (Shipping and Billing)

2. **Product Catalog**
   - View all products
   - Filter products by category, price, rating
   - View single product details (images, description, stock)
   - Search products by keywords

3. **Cart & Checkout**
   - Add/Remove items from Cart
   - Update Cart quantities
   - Checkout flow (Select Address, Select Payment Method, Place Order)
   - Dedicated checkout API router and schema
   - Order confirmation and email notification placeholders

4. **Order Management**
   - Users can view their order history
   - Users can view single order status
   - Admin can view all orders
   - Admin can update order status (Pending, Shipped, Delivered)

5. **Admin Features**
   - Admin authentication
   - Inventory Management: Add, Edit, Delete products
   - Category Management: Create, Update categories
   - Admin pages/APIs

6. **Reviews & Ratings**
   - Users can leave a review on purchased products
   - Users can rate products 1-5 stars
   - Average rating calculated on product

7. **Deployment & DevOps**
   - Dockerfile for Backend
   - Dockerfile for Frontend
   - docker-compose.yml for complete local setup
   - Missing deployment files (like Nginx config placeholders)
   - Missing health check endpoint

8. **Testing**
   - Comprehensive test suite files required
   - API integration tests placeholders
`;

const workspacePath = path.join(process.cwd(), 'quickcart_workspace');
if (fs.existsSync(workspacePath)) {
  fs.rmSync(workspacePath, { recursive: true, force: true });
}
fs.mkdirSync(workspacePath, { recursive: true });

function sendEvent(type, data) {
  if (type === 'log') {
    const msg = data.message || data;
    console.log(`[LOG] ${msg.slice(0, 500)}`);
  }
}

async function runTest() {
  console.log("=== STARTING FULL GENERATION (REAL PRD) ===");
  const generationId = 'full-quickcart-' + Date.now();
  
  let generationMode = 'new';
  while (true) {
      try {
        await executeGeneration({
          prd,
          existingFiles: [],
          generationMode,
          workspacePath,
          generationId
        }, sendEvent);
      } catch (e) {
        console.error("Execution failed:", e.message);
      }
    
      const manifestPath = path.join(workspacePath, '.openclaw/manifest.json');
      if (!fs.existsSync(manifestPath)) {
        console.log("Manifest was never generated or was deleted!");
        break;
      }
      
      let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      console.log(`\nGlobal Status: ${manifest.globalStatus}, Current Layer: ${manifest.currentLayer}`);
      
      if (manifest.globalStatus === 'WAITING_FOR_APPROVAL') {
          console.log(`\n=== ${manifest.currentLayer} PHASE COMPLETED AND GATED ===`);
          console.log(`APPROVING ${manifest.currentLayer}...`);
          
          manifest.globalStatus = 'RUNNING';
          manifest.approvedLayer = manifest.currentLayer;
          manifest.approvalState = manifest.approvalState || [];
          manifest.approvalState.push({ phase: manifest.currentLayer, status: 'approved' });
          fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    
          generationMode = 'existing';
      } else if (manifest.globalStatus === 'FAILED' || manifest.globalStatus === 'BLOCKED') {
          console.log("\n=== GENERATION BLOCKED OR FAILED ===");
          break;
      } else {
          console.log("\n=== GENERATION COMPLETED ===");
          break;
      }
  }
}
runTest().catch(console.error);