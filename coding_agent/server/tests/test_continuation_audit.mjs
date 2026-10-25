import fs from 'fs';
import path from 'path';
import { executeGeneration } from '../orchestrator.js';

const tempWorkspace = path.join(process.cwd(), 'temp_continuation_test_workspace');
if (!fs.existsSync(tempWorkspace)) fs.mkdirSync(tempWorkspace, { recursive: true });

function noopSendEvent(_event, _data) {}

const mockPRD = `
[PRD_BEGIN_MARKER]
Test PRD
[PRD_MIDDLE_MARKER]
End Test PRD
[PRD_END_MARKER]
`;

async function runTest(name, mockLLM, expectedError = null, testPRD = mockPRD) {
    console.log(`\n--- RUNNING ${name} ---`);
    let passed = false;
    
    const manifestPath = path.join(tempWorkspace, '.openclaw/manifest.json');
    if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
    
    try {
        await executeGeneration({
            prd: testPRD,
            existingFiles: [],
            generationMode: 'new',
            workspacePath: tempWorkspace,
            mockLLM: mockLLM
        }, noopSendEvent);
        
        if (expectedError) {
            console.error(`❌ ${name} FAILED: Expected error '${expectedError}' but succeeded.`);
        } else {
            console.log(`✅ ${name} PASSED.`);
            passed = true;
        }
    } catch (err) {
        if (expectedError && err.message.includes(expectedError)) {
            console.log(`✅ ${name} PASSED (Caught expected error).`);
            passed = true;
        } else {
            console.error(`❌ ${name} FAILED with unexpected error:`, err);
        }
    }
    
    return passed;
}

let allTestsPassed = true;

async function runAll() {
    console.log("Starting Continuation Audit Tests...\n");

    let originalUserPromptCaptured = null;
    let _continuationPromptCaptured = null;

    // TEST 1, 3, 7, 8 - Context Preservation & Immutability
    let test1Passed = await runTest('TEST 1, 3, 7 - Original Context Preservation & Immutability', async (sys, usr) => {
        if (usr.includes('Output Manifest JSON')) return `{"project_requirements":{"database":{"entities":[],"tables":[]}},"modules":[{"id":"MOD-000","name":"DB","layer":"DATABASE","required_files":[{"path":"db.js","purpose":"DB"}]}]}`;
        if (sys.includes('Architect')) return `{"isValid": true}`;
        if (usr.includes('Analyze the generated files')) return `{"complianceScore": 100}`;
        if (usr.includes('Summarize the provided code')) return `// contract`;
        
        if (!usr.includes('CONTINUATION INSTRUCTION')) {
            originalUserPromptCaptured = usr;
            return `<file path="db.js">\nPART_A`;
        } else {
            _continuationPromptCaptured = usr;
            if (!usr.includes('[PRD_BEGIN_MARKER]') || !usr.includes('[PRD_END_MARKER]')) throw new Error("Markers missing in continuation prompt!");
            if (!usr.includes('PART_A')) throw new Error("Accumulated output missing from continuation prompt!");
            if (!usr.includes(originalUserPromptCaptured)) throw new Error("Original prompt was mutated or not fully included in continuation!");
            return `PART_B\n</file>`;
        }
    });
    allTestsPassed = allTestsPassed && test1Passed;

    // TEST 2 & 9 - Deterministic Concatenation & File Wrapper Integrity
    let test2Passed = await runTest('TEST 2 & 9 - File Wrapper Integrity & Concatenation', async (sys, usr) => {
        if (usr.includes('Output Manifest JSON')) return `{"project_requirements":{"database":{"entities":[],"tables":[]}},"modules":[{"id":"MOD-000","name":"DB","layer":"DATABASE","required_files":[{"path":"db2.js","purpose":"DB"}]}]}`;
        if (sys.includes('Architect')) return `{"isValid": true}`;
        if (usr.includes('Analyze the generated files')) return `{"complianceScore": 100}`;
        if (usr.includes('Summarize the provided code')) return `// contract`;

        if (!usr.includes('CONTINUATION INSTRUCTION')) return `<file path="db2.js">\nPART_A`;
        else return `PART_B\n</file>`;
    });
    
    const repPath = path.join(tempWorkspace, '.openclaw/generation-report.json');
    if (fs.existsSync(repPath)) {
        const rep = JSON.parse(fs.readFileSync(repPath, 'utf8'));
        if (rep.failedFiles > 0) {
             console.error("❌ TEST 2/9 FAILED: File was marked failed.");
             allTestsPassed = false;
        } else {
             const manifest = JSON.parse(fs.readFileSync(path.join(tempWorkspace, '.openclaw/manifest.json'), 'utf8'));
             const fileContent = manifest.modules[0].required_files[0].content;
             if (fileContent === 'PART_A\nPART_B') {
                 console.log("✅ TEST 2 & 9 passed assertions internally.");
             } else {
                 console.error("❌ TEST 2/9 FAILED: Concatenation mismatch. Content was:", fileContent);
                 allTestsPassed = false;
             }
        }
    }
    allTestsPassed = allTestsPassed && test2Passed;

    // TEST 4 & 11 - Missing Closing Tag Fails Module
    let test4Passed = await runTest('TEST 4 & 11 - Missing Closing Tag Fails Module', async (sys, usr) => {
        if (usr.includes('Output Manifest JSON')) return `{"project_requirements":{"database":{"entities":[],"tables":[]}},"modules":[{"id":"MOD-000","name":"DB","layer":"DATABASE","required_files":[{"path":"db3.js","purpose":"DB"}]}]}`;
        if (sys.includes('Architect')) return `{"isValid": true}`;
        if (usr.includes('Analyze the generated files')) return `{"complianceScore": 100}`;
        if (usr.includes('Summarize the provided code')) return `// contract`;

        return `<file path="fail.js">\nPART_A`;
    });
    const manifest4 = JSON.parse(fs.readFileSync(path.join(tempWorkspace, '.openclaw/manifest.json'), 'utf8'));
    if (manifest4.modules[0].status === 'FAILED') console.log("✅ TEST 4 & 11 passed assertions (Module Failed).");
    else { console.error(`❌ TEST 4/11 FAILED: Module did not fail. Actual status: ${manifest4.modules[0].status}`); allTestsPassed = false; }
    allTestsPassed = allTestsPassed && test4Passed;

    // TEST 5 - Syntactically valid but incomplete
    let test5Passed = await runTest('TEST 5 - Syntactically Valid but Missing </file>', async (sys, usr) => {
        if (usr.includes('Output Manifest JSON')) return `{"project_requirements":{"database":{"entities":[],"tables":[]}},"modules":[{"id":"MOD-000","name":"DB","layer":"DATABASE","required_files":[{"path":"db4.js","purpose":"DB"}]}]}`;
        if (sys.includes('Architect')) return `{"isValid": true}`;
        if (usr.includes('Analyze the generated files')) return `{"complianceScore": 100}`;
        if (usr.includes('Summarize the provided code')) return `// contract`;

        return `<file path="valid.js">\nconst app = {};\nmodule.exports = app;`;
    });
    const manifest5 = JSON.parse(fs.readFileSync(path.join(tempWorkspace, '.openclaw/manifest.json'), 'utf8'));
    if (manifest5.modules[0].status === 'FAILED') console.log("✅ TEST 5 passed assertions.");
    else { console.error("❌ TEST 5 FAILED: Syntactically valid file without </file> was accepted."); allTestsPassed = false; }
    allTestsPassed = allTestsPassed && test5Passed;

    if (allTestsPassed) {
        console.log("\n🚀 ALL CONTINUATION AUDIT TESTS PASSED SUCCESSFULLY! 🚀");
        process.exit(0);
    } else {
        console.error("\n❌ SOME TESTS FAILED. DO NOT PROCEED.");
        process.exit(1);
    }
}

runAll();
