import fs from 'fs';
import path from 'path';

// Reset models.py from quickcart to the original before Customer was added
const wsCandidates = [
  path.resolve('server/workspaces/quickcart-ecommerce-platform'),
  path.resolve('server/workspaces/quickcar-ecommerce-platform'),
  path.resolve('workspaces/quickcart-ecommerce-platform')
];
const ws = wsCandidates.find(p => fs.existsSync(p)) || wsCandidates[0];
const modelsPath = path.join(ws, 'backend/app/db/models.py');
if (fs.existsSync(modelsPath)) {
  let originalModels = fs.readFileSync(modelsPath, 'utf8');
  // Strip any previously auto-generated Customer class for testing
  originalModels = originalModels.replace(/\n\s*class Customer\b[\s\S]*$/, '').trim() + '\n';
  fs.writeFileSync(modelsPath, originalModels, 'utf8');
  console.log(`Reset models.py in ${ws} to original without Customer.`);
} else {
  console.log(`No models.py found in candidate workspaces.`);
}
