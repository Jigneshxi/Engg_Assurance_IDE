import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  checkAssuranceStatus,
  triggerAssuranceMission,
  getAssuranceScorecard,
  applyAssuranceRemediation
} from '../assuranceBridge.js'

test('Assurance Bridge: checkAssuranceStatus returns structured health payload', async () => {
  const status = await checkAssuranceStatus()
  assert.equal(typeof status, 'object')
  assert.ok('connected' in status)
  assert.equal(status.port, 8000)
  assert.ok(status.service.includes('CONVERGE'))
})

test('Assurance Bridge: triggerAssuranceMission validates workspace existence', async () => {
  const nonexistentPath = path.join(os.tmpdir(), 'nonexistent-workspace-' + Date.now())
  await assert.rejects(
    async () => {
      await triggerAssuranceMission(nonexistentPath)
    },
    /Workspace path does not exist/
  )
})

test('Assurance Bridge: applyAssuranceRemediation applies code fixes and creates audit trail', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assurance-ws-'))
  try {
    const srcDir = path.join(tempDir, 'src')
    fs.mkdirSync(srcDir, { recursive: true })
    
    const targetFile = path.join(srcDir, 'api.ts')
    const initialContent = `
export async function fetchData(url: string) {
  const res = await fetch(url);
  return res.json();
}
`.trim()
    fs.writeFileSync(targetFile, initialContent, 'utf8')

    // Remediation payload with replacement code
    const remediation = {
      id: 'rem-sec-01',
      file: 'src/api.ts',
      title: 'Wrap in Circuit Breaker',
      standard: 'ISO-26262',
      severity: 'HIGH',
      remediated_code: `
export async function fetchData(url: string) {
  const res = await fetchWithCircuitBreaker(url, { maxRetries: 3 });
  return res.json();
}
`.trim()
    }

    const result = await applyAssuranceRemediation(tempDir, remediation)
    assert.equal(result.success, true)
    assert.equal(result.file, 'src/api.ts')
    assert.notEqual(result.originalHash, result.newHash)

    // Verify file content on disk
    const diskContent = fs.readFileSync(targetFile, 'utf8')
    assert.ok(diskContent.includes('fetchWithCircuitBreaker'))

    // Verify audit log exists
    const auditPath = path.join(tempDir, '.openclaw', 'remediations-audit.json')
    assert.ok(fs.existsSync(auditPath))
    const audits = JSON.parse(fs.readFileSync(auditPath, 'utf8'))
    assert.equal(audits.length, 1)
    assert.equal(audits[0].standard, 'ISO-26262')
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('Assurance Bridge: applyAssuranceRemediation fails gracefully if target file is missing', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assurance-ws-'))
  try {
    const remediation = {
      file: 'nonexistent/file.ts',
      remediated_code: 'console.log("test")'
    }
    await assert.rejects(
      async () => {
        await applyAssuranceRemediation(tempDir, remediation)
      },
      /Target file to remediate does not exist/
    )
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
