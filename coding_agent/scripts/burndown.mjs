import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeWorkspace } from './analyze_workspace.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const burndownFile = path.join(rootDir, 'docs', 'runs', 'burndown.md');

export async function appendBurndownRow({
  runId,
  timestamp = new Date().toISOString(),
  filesCount,
  totalDefects,
  codeCounts = {},
  failedGates = [],
  status = 'FAILED',
  providerSummary = 'gemini-flash/groq'
}) {
  const runsDir = path.dirname(burndownFile);
  if (!fs.existsSync(runsDir)) {
    fs.mkdirSync(runsDir, { recursive: true });
  }

  // Format code counts string (e.g. UNDECLARED: 45, MISSING_FE: 33, ...)
  const codeSummary = Object.entries(codeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join(', ') || '0 defects';

  const gatesSummary = failedGates.length > 0 ? failedGates.join(', ') : 'NONE';

  if (!fs.existsSync(burndownFile)) {
    const header = `# QuickCart Code-Generation Engine Burn-Down Log

| Run | Timestamp | Files | Total Defects | Defects Breakdown by Code | Failed Gates | Status | Provider Mix |
|---|---|---|---|---|---|---|---|
`;
    fs.writeFileSync(burndownFile, header, 'utf8');
  }

  const row = `| **${runId}** | ${timestamp} | ${filesCount} | ${totalDefects} | ${codeSummary} | ${gatesSummary} | ${status} | ${providerSummary} |\n`;
  fs.appendFileSync(burndownFile, row, 'utf8');
  console.log(`[Burn-Down] Appended Run #${runId} to docs/runs/burndown.md`);
}

async function main() {
  const args = process.argv.slice(2);
  let runId = 'baseline';
  let targetWs = 'C:/Users/VVNT SeQuor/.gemini/antigravity-ide/brain/2b6ba98c-557d-4289-9725-ed1f1d33c316/scratch/prd_test_a2';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--run' && args[i + 1]) {
      runId = args[i + 1];
      i++;
    } else if (args[i] === '--workspace' && args[i + 1]) {
      targetWs = args[i + 1];
      i++;
    }
  }

  console.log(`Analyzing workspace for burndown log: ${targetWs}`);
  const report = await analyzeWorkspace(targetWs);

  await appendBurndownRow({
    runId,
    timestamp: new Date().toISOString(),
    filesCount: report.filesCount,
    totalDefects: report.totalDefects,
    codeCounts: report.codeCounts,
    failedGates: ['importClosure', 'frontendContract', 'backendRuntime', 'apiAuthz', 'final_completion_gate'],
    status: report.totalDefects === 0 ? 'PASS' : 'FAILED',
    providerSummary: 'Gemini 2.5 Flash / Groq LLama-3.3'
  });
}

if (process.argv[1] && process.argv[1].endsWith('burndown.mjs')) {
  main().catch(err => {
    console.error('Error running burndown script:', err);
    process.exit(1);
  });
}
