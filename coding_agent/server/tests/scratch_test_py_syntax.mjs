import fs from 'fs';

function validatePythonStatic(content) {
  const errors = [];
  if (!content || !content.trim()) {
    errors.push('Python file is empty.');
    return errors;
  }

  const lines = content.split('\n');
  const stack = [];
  let inTripleDouble = false;
  let inTripleSingle = false;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const rawLine = lines[lineNum];
    let line = rawLine;

    let i = 0;
    let inDouble = false;
    let inSingle = false;

    while (i < line.length) {
      if (!inTripleSingle && line.startsWith('"""', i)) {
        inTripleDouble = !inTripleDouble;
        i += 3;
        continue;
      }
      if (!inTripleDouble && line.startsWith("'''", i)) {
        inTripleSingle = !inTripleSingle;
        i += 3;
        continue;
      }
      if (inTripleDouble || inTripleSingle) {
        i++;
        continue;
      }

      const ch = line[i];
      if (ch === '\\' && (inDouble || inSingle)) {
        i += 2;
        continue;
      }

      if (!inSingle && ch === '"') {
        inDouble = !inDouble;
        i++;
        continue;
      }
      if (!inDouble && ch === "'") {
        inSingle = !inSingle;
        i++;
        continue;
      }

      if (inDouble || inSingle) {
        i++;
        continue;
      }

      if (ch === '#') {
        break;
      }

      if (ch === '(' || ch === '[' || ch === '{') {
        stack.push({ ch, lineNum: lineNum + 1 });
      } else if (ch === ')' || ch === ']' || ch === '}') {
        const last = stack.pop();
        if (!last) {
          errors.push(`Unmatched closing '${ch}' at line ${lineNum + 1}`);
        } else if (
          (ch === ')' && last.ch !== '(') ||
          (ch === ']' && last.ch !== '[') ||
          (ch === '}' && last.ch !== '{')
        ) {
          errors.push(`Mismatched bracket '${ch}' at line ${lineNum + 1} (expected closing for '${last.ch}' from line ${last.lineNum})`);
        }
      }
      i++;
    }
  }

  if (inTripleDouble) errors.push('Unclosed triple double quotes (""")');
  if (inTripleSingle) errors.push("Unclosed triple single quotes (''')");
  if (stack.length > 0) {
    const unclosed = stack.pop();
    errors.push(`Unclosed bracket '${unclosed.ch}' opened at line ${unclosed.lineNum}`);
  }

  return errors;
}

const seedContent = fs.readFileSync('./workspaces/taskflow_contract_test/backend/app/db/seed.py', 'utf8');
console.log('Seed errors:', validatePythonStatic(seedContent));

const envContent = fs.readFileSync('./workspaces/taskflow_contract_test/backend/app/db/migrations/env.py', 'utf8');
console.log('Env errors:', validatePythonStatic(envContent));

const scriptContent = fs.readFileSync('./workspaces/taskflow_contract_test/backend/app/db/migrations/script.py', 'utf8');
console.log('Script errors:', validatePythonStatic(scriptContent));
