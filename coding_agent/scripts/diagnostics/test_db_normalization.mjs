import fs from 'fs';
import path from 'path';
import { validateDatabasePhase } from '../../server/dbValidator.js';

const ws = path.resolve('server/workspaces/quickcar-ecommerce-platform');
const manifestPath = path.join(ws, '.openclaw/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const dbModule = manifest.modules.find(m => m.layer === 'DATABASE');

dbModule.required_files.forEach(f => {
  const p = path.resolve(ws, f.path);
  if (fs.existsSync(p)) f.content = fs.readFileSync(p, 'utf8');
});

const modelsFile = dbModule.required_files.find(f => f.path.endsWith('models.py'));
let content = modelsFile.content;

// Fix Address.addresses self-referential error
content = content.replace(/\n\s*addresses = relationship\(['"]Address['"][^\n]*\)/g, '');

// Append Customer class
if (!content.includes('class Customer')) {
  content += `\n\nclass Customer(Base):\n    __tablename__ = "customers"\n\n    id = Column(Integer, primary_key=True, index=True)\n    email = Column(String(255), unique=True, nullable=False)\n    name = Column(String(255), nullable=True)\n\n    addresses = relationship("Address", back_populates="customer")\n    orders = relationship("Order", back_populates="customer")\n    reviews = relationship("Review", back_populates="customer")\n`;
}
modelsFile.content = content;

// Also add Customer to manifest entities so required entities check passes
if (!manifest.project_requirements.database.entities.includes('Customer')) {
  manifest.project_requirements.database.entities.push('Customer');
}
if (!manifest.project_requirements.database.tables.includes('customers')) {
  manifest.project_requirements.database.tables.push('customers');
}

validateDatabasePhase([dbModule], manifest, '', () => {}, (t, d) => console.log(`[${t}]`, d), { workspacePath: ws }).then(res => {
  console.log('--- Test Validation Result ---');
  console.log('isValid:', res.isValid);
  console.log('Errors count:', res.errors.length);
  if (!res.isValid) console.log('Errors:', res.errors);
});
