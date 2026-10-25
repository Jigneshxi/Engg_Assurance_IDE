import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { validateProjectContracts } from '../server/projectContractValidator.js';
import { resolveSharedPython } from '../server/pythonEnvironment.js';

const archivePath = path.resolve('docs/11-prd-tests/project_test44a.zip');
const reportPath = path.resolve('docs/08-quickcart-study/verification/test44-baseline.json');
const python = process.argv[2] || undefined;
const archiveBytes = await fs.readFile(archivePath);
const zip = await JSZip.loadAsync(archiveBytes);
const files = [];

for (const [archiveName, entry] of Object.entries(zip.files)) {
  if (entry.dir || archiveName.includes('/node_modules/') || archiveName.includes('/.venv/')) continue;
  const content = await entry.async('string');
  files.push({ path: archiveName.replace(/^project_test44a\//, ''), content, status: 'validated' });
}

const validation = await validateProjectContracts(files, python ? { python } : {});
const categoryCounts = {};
for (const defect of validation.defects || []) {
  const category = defect.code || 'UNKNOWN';
  categoryCounts[category] = (categoryCounts[category] || 0) + 1;
}
const categories = Object.fromEntries(Object.entries(categoryCounts).sort(([a], [b]) => a.localeCompare(b)));
const report = {
  generatedAt: new Date().toISOString(),
  archive: path.relative(process.cwd(), archivePath).replaceAll('\\', '/'),
  archiveSha256: createHash('sha256').update(archiveBytes).digest('hex'),
  archiveModified: (await fs.stat(archivePath)).mtime.toISOString(),
  historicalArchiveModified: false,
  filesAnalyzed: files.length,
  validatorScope: 'Static project contract checks only; not a clean-environment backend, browser, or production build run.',
  pythonAstAnalyzerAvailable: Boolean(python || resolveSharedPython({ checkExecutable: true })),
  validatorPassed: validation.isValid,
  defectCount: validation.defects?.length || 0,
  defectCountsByCategory: categories,
  defects: validation.defects || [],
  fixtureIsolation: 'Read directly from the historical ZIP. No files were extracted or modified.'
};

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath: path.relative(process.cwd(), reportPath), filesAnalyzed: report.filesAnalyzed, defectCount: report.defectCount, categories }, null, 2));
