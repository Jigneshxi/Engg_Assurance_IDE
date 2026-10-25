import fs from 'fs';

const content = fs.readFileSync('server/workspaces/quickcar-ecommerce-platform/backend/app/db/models.py', 'utf8');

const eName = 'Customer';
const classBlocks = content.split(/\n\s*class\s+/);
const reciprocalRels = [];

classBlocks.slice(1).forEach(block => {
  const clsMatch = block.match(/^([A-Za-z0-9_]+)/);
  if (!clsMatch) return;
  const sourceModel = clsMatch[1];
  const relInBlock = new RegExp(`([a-zA-Z0-9_]+)\\s*=\\s*relationship\\s*\\(\\s*['"]${eName}['"]\\s*,\\s*back_populates\\s*=\\s*['"]([a-zA-Z0-9_]+)['"]`, 'g');
  let rm;
  while ((rm = relInBlock.exec(block)) !== null) {
    reciprocalRels.push({
      propName: rm[2],
      targetModel: sourceModel,
      backPop: rm[1]
    });
  }
});
console.log('Reciprocal rels for Customer:', reciprocalRels);
