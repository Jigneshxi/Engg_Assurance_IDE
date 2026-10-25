/**
 * Phase 13: PRD Coverage After Generation Validator
 * 
 * Verifies that the generated project output actually implements the original
 * PRD requirements, establishing complete traceability:
 * 
 * ORIGINAL PRD
 *     ↓
 * Requirement Contract
 *     ↓
 * Manifest
 *     ↓
 * Generated Files
 *     ↓
 * Validated Implementation
 *     ↓
 * Runtime Evidence
 *     ↓
 * Final Requirement Coverage
 * 
 * Classification categories (strictly deterministic, zero silent omissions):
 * - SUPPORTED + IMPLEMENTED
 * - SUPPORTED + PARTIAL
 * - DEFERRED + EXPLICIT REASON
 * - MISSING
 * - FAILED
 * 
 * Defect Code: PRD_COVERAGE_FAILURE
 */

import path from 'path';
import { isPlaceholderStubComponent } from './frontendContractValidator.js';
import { autoDeriveRequirementMappings, isConstraintOrCrossCuttingRequirement } from './manifestValidator.js';

export const PRD_COVERAGE_DEFECT_CODES = Object.freeze({
  PRD_COVERAGE_FAILURE: 'PRD_COVERAGE_FAILURE',
  PRD_REQUIREMENT_MISSING: 'PRD_REQUIREMENT_MISSING',
  PRD_REQUIREMENT_FAILED: 'PRD_REQUIREMENT_FAILED',
  PRD_REQUIREMENT_PARTIAL: 'PRD_REQUIREMENT_PARTIAL',
  PRD_UNREASONED_DEFERRAL: 'PRD_UNREASONED_DEFERRAL'
});

export const REQUIREMENT_STATUS = Object.freeze({
  SUPPORTED_IMPLEMENTED: 'SUPPORTED + IMPLEMENTED',
  SUPPORTED_PARTIAL: 'SUPPORTED + PARTIAL',
  DEFERRED_EXPLICIT_REASON: 'DEFERRED + EXPLICIT REASON',
  MISSING: 'MISSING',
  FAILED: 'FAILED'
});

function normPath(p) {
  if (!p) return '';
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Extracts requirements from PRD text if an explicit contract is not yet parsed.
 */
export function extractRequirementsFromPrd(prdText = '') {
  const requirements = [];
  if (!prdText || typeof prdText !== 'string') return requirements;

  const lines = prdText.split('\n');
  let reqCounter = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    // Match headers or bullet patterns: ## REQ-001 Title, - [ ] REQ-001 Title, 1. Title
    const reqMatch = trimmed.match(/^(?:##|\d+\.|-|\*)\s*(?:\[[ x]\]\s*)?(REQ-[A-Z0-9_-]+|MOD-[A-Z0-9_-]+)?\s*(.+)/i);
    if (reqMatch) {
      const explicitId = reqMatch[1];
      const desc = reqMatch[2];
      if (desc && desc.length > 5 && !desc.toLowerCase().startsWith('overview') && !desc.toLowerCase().startsWith('architecture')) {
        const id = explicitId || `REQ-${String(reqCounter++).padStart(3, '0')}`;
        requirements.push({
          id,
          description: desc,
          type: desc.toLowerCase().includes('database') || desc.toLowerCase().includes('model') ? 'database' :
                desc.toLowerCase().includes('ui') || desc.toLowerCase().includes('page') || desc.toLowerCase().includes('frontend') ? 'frontend' : 'backend'
        });
      }
    }
  }

  return requirements;
}

/**
 * Detects whether a generated file is a non-functional placeholder or re-export stub.
 */
export function isPlaceholderStub(file) {
  if (!file || !file.content) return true;
  const content = file.content.trim();
  if (content.length === 0) return true;
  // React scaffold shell: <div className="...-page"><h2>...</h2></div>
  if (content.length < 320 && /<div\s+className=["'][a-z0-9_-]+-page["']>\s*<h2>[^<]+<\/h2>\s*<\/div>/i.test(content)) {
    return true;
  }
  // Pure re-export stub without logic
  if (content.length < 150 && /^from\s+\.[a-zA-Z0-9_]+\s+import\s+\*/.test(content)) {
    return true;
  }
  return false;
}

/**
 * Inspects a generated file for implementation signals (keywords, functions, schemas, endpoints).
 */
export function inspectFileForRequirementSignals(file, requirement) {
  if (!file || !file.content) return { matches: false, score: 0, signals: [] };
  if (isPlaceholderStub(file)) return { matches: false, score: 0, signals: [] };
  const content = file.content;
  const signals = [];

  const descWords = (requirement.description || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);

  let matchedWordsCount = 0;
  for (const word of descWords) {
    if (content.toLowerCase().includes(word)) {
      matchedWordsCount++;
      signals.push(`keyword:${word}`);
    }
  }

  // Check code-level indicators (functions, classes, endpoints)
  const id = (requirement.id || '').toLowerCase();
  if (content.toLowerCase().includes(id)) {
    signals.push(`explicit_id:${requirement.id}`);
  }

  const score = descWords.length > 0 ? (matchedWordsCount / descWords.length) : 0;
  return {
    matches: score >= 0.25 || signals.length > 0,
    score,
    signals
  };
}

/**
 * Master PRD Coverage Gate Validator
 * Evaluates the full traceability chain from PRD to runtime evidence.
 */
export async function validatePrdCoverage(context = {}, options = {}) {
  const {
    prd = '',
    requirementContract = null,
    manifest = null,
    generatedFiles = [],
    validationResults = null,
    runtimeEvidence = null
  } = context;

  const defects = [];
  const errors = [];
  const classifications = [];

  // 1. Resolve requirement contract
  let reqs = [];
  if (requirementContract && Array.isArray(requirementContract.requirements) && requirementContract.requirements.length > 0) {
    reqs = requirementContract.requirements;
  } else if (manifest?.requirementContract && Array.isArray(manifest.requirementContract.requirements)) {
    reqs = manifest.requirementContract.requirements;
  } else if (manifest?.requirements && Array.isArray(manifest.requirements)) {
    reqs = manifest.requirements;
  } else if (typeof prd === 'string' && prd.trim()) {
    reqs = extractRequirementsFromPrd(prd);
  }

  if (reqs.length === 0) {
    // If no requirements are specified or discovered, pass gracefully
    return {
      isValid: false,
      defects: [{ code: 'PRD_REQUIREMENTS_EMPTY', severity: 'HIGH', message: 'No PRD requirements could be resolved' }],
      errors: ['No PRD requirements could be resolved'],
      classifications: [],
      metrics: {
        totalRequirements: 0,
        implementedCount: 0,
        partialCount: 0,
        deferredCount: 0,
        missingCount: 0,
        failedCount: 0,
        coverageRatio: 0
      }
    };
  }

  // Build index of generated files: normPath -> file object
  const fileIndex = new Map();
  (generatedFiles || []).forEach(f => {
    if (f && f.path) {
      fileIndex.set(normPath(f.path), f);
    }
  });

  // Build index of manifest requirement mappings
  let rawMappings = manifest?.requirement_mappings || (Array.isArray(manifest?.requirements) ? manifest.requirements : []);
  if ((!Array.isArray(rawMappings) || rawMappings.length === 0) && requirementContract && manifest?.modules) {
    try {
      rawMappings = autoDeriveRequirementMappings(manifest, requirementContract);
    } catch (_) {}
  }
  const mappingIndex = new Map();
  if (Array.isArray(rawMappings)) {
    rawMappings.forEach(m => {
      const id = m.id || m.requirementId;
      if (id) mappingIndex.set(String(id).trim(), m);
    });
  }

  // Build index of module required files
  const moduleFileMap = new Map();
  (manifest?.modules || []).forEach(m => {
    if (m && m.id) {
      const files = (m.required_files || []).map(f => typeof f === 'string' ? f : f?.path).filter(Boolean);
      moduleFileMap.set(m.id, files.map(normPath));
    }
  });

  let implementedCount = 0;
  let partialCount = 0;
  let deferredCount = 0;
  let missingCount = 0;
  let failedCount = 0;

  for (const req of reqs) {
    const reqId = String(req.id || '').trim();
    const mapping = mappingIndex.get(reqId);

    // Case 1: Explicitly DEFERRED
    const isDeclaredDeferred = (mapping && (mapping.status === 'DEFERRED' || mapping.deferred === true)) ||
                               (req.status === 'DEFERRED' || req.deferred === true);

    if (isDeclaredDeferred) {
      const deferralReason = (mapping?.deferral_reason || mapping?.reason || req.deferral_reason || req.reason || '').trim();
      if (!deferralReason) {
        const msg = `PRD Coverage Failure: Requirement ${reqId} is marked DEFERRED without an explicit reason.`;
        errors.push(msg);
        defects.push({
          code: PRD_COVERAGE_DEFECT_CODES.PRD_COVERAGE_FAILURE,
          subtype: PRD_COVERAGE_DEFECT_CODES.PRD_UNREASONED_DEFERRAL,
          requirementId: reqId,
          severity: 'HIGH',
          message: msg
        });
        classifications.push({
          id: reqId,
          description: req.description,
          status: REQUIREMENT_STATUS.FAILED,
          reason: 'DEFERRED without explicit rationale',
          mappedFiles: [],
          evidence: null
        });
        failedCount++;
      } else {
        deferredCount++;
        classifications.push({
          id: reqId,
          description: req.description,
          status: REQUIREMENT_STATUS.DEFERRED_EXPLICIT_REASON,
          reason: deferralReason,
          mappedFiles: [],
          evidence: { deferredReason: deferralReason }
        });
      }
      continue;
    }

    // Determine mapped files
    let targetFilePaths = [];
    if (mapping && Array.isArray(mapping.files)) {
      targetFilePaths = mapping.files.map(normPath);
    } else if (mapping && mapping.module && moduleFileMap.has(mapping.module)) {
      targetFilePaths = moduleFileMap.get(mapping.module);
    } else {
      // Find candidate files matching requirement keywords
      for (const [np, f] of fileIndex.entries()) {
        const signal = inspectFileForRequirementSignals(f, req);
        if (signal.matches) {
          targetFilePaths.push(np);
        }
      }

      // If no individual file matched, check if requirement is a project-wide quality/completeness criteria or architectural constraint
      if (targetFilePaths.length === 0 && fileIndex.size > 0) {
        const isProjectWideQuality = /(?:all source files|complete and valid|syntactically|production[- ]ready|code quality|clean interface|intuitive ui)/i.test(req.description || '') || isConstraintOrCrossCuttingRequirement(req);
        if (isProjectWideQuality) {
          targetFilePaths = Array.from(fileIndex.keys());
        }
      }
    }

    // Case 2: MISSING (Zero files mapped and no signal found)
    if (targetFilePaths.length === 0) {
      const msg = `PRD Coverage Failure: Requirement ${reqId} ("${req.description || 'Feature'}") has no mapped generated files or implementation signals.`;
      errors.push(msg);
      defects.push({
        code: PRD_COVERAGE_DEFECT_CODES.PRD_COVERAGE_FAILURE,
        subtype: PRD_COVERAGE_DEFECT_CODES.PRD_REQUIREMENT_MISSING,
        requirementId: reqId,
        severity: 'HIGH',
        message: msg
      });
      classifications.push({
        id: reqId,
        description: req.description,
        status: REQUIREMENT_STATUS.MISSING,
        reason: 'No mapped or generated files implement this requirement',
        mappedFiles: [],
        evidence: null
      });
      missingCount++;
      continue;
    }

    // Case 3: Check existence and status of mapped files
    const existingMappedFiles = [];
    const missingMappedFiles = [];

    for (const tf of targetFilePaths) {
      if (fileIndex.has(tf)) {
        existingMappedFiles.push(fileIndex.get(tf));
      } else {
        missingMappedFiles.push(tf);
      }
    }

    // Case 4: Check validation status of files
    const failedValidationFiles = [];
    if (validationResults && Array.isArray(validationResults.defects)) {
      validationResults.defects.forEach(d => {
        const dFile = normPath(d.file || d.path);
        if (targetFilePaths.includes(dFile)) {
          failedValidationFiles.push(dFile);
        }
      });
    }

    if (failedValidationFiles.length > 0) {
      const msg = `PRD Coverage Failure: Requirement ${reqId} maps to files that failed validation: ${failedValidationFiles.join(', ')}`;
      errors.push(msg);
      defects.push({
        code: PRD_COVERAGE_DEFECT_CODES.PRD_COVERAGE_FAILURE,
        subtype: PRD_COVERAGE_DEFECT_CODES.PRD_REQUIREMENT_FAILED,
        requirementId: reqId,
        failedFiles: failedValidationFiles,
        severity: 'HIGH',
        message: msg
      });
      classifications.push({
        id: reqId,
        description: req.description,
        status: REQUIREMENT_STATUS.FAILED,
        reason: `Associated files failed validation: ${failedValidationFiles.join(', ')}`,
        mappedFiles: targetFilePaths,
        evidence: { failedValidationFiles }
      });
      failedCount++;
      continue;
    }

    // Check if partial or stubs: some files missing, empty, or placeholder stubs
    const emptyFiles = existingMappedFiles.filter(f => !f.content || f.content.trim().length === 0);
    const stubFiles = existingMappedFiles.filter(f => isPlaceholderStub(f));
    const nonStubFiles = existingMappedFiles.filter(f => !isPlaceholderStub(f) && f.content && f.content.trim().length > 0);

    if (existingMappedFiles.length > 0 && nonStubFiles.length === 0) {
      const msg = `PRD Coverage Failure: Requirement ${reqId} ("${req.description || 'Feature'}") maps only to placeholder stubs or empty files.`;
      errors.push(msg);
      defects.push({
        code: PRD_COVERAGE_DEFECT_CODES.PRD_COVERAGE_FAILURE,
        subtype: PRD_COVERAGE_DEFECT_CODES.PRD_REQUIREMENT_MISSING,
        requirementId: reqId,
        severity: 'HIGH',
        message: msg
      });
      classifications.push({
        id: reqId,
        description: req.description,
        status: REQUIREMENT_STATUS.MISSING,
        reason: 'Mapped files are non-functional placeholder stubs',
        mappedFiles: targetFilePaths,
        evidence: null
      });
      missingCount++;
      continue;
    }

    const isPartial = missingMappedFiles.length > 0 || emptyFiles.length > 0 || stubFiles.length > 0;

    if (isPartial) {
      const msg = `PRD Coverage Failure: Requirement ${reqId} is only PARTIALLY implemented (${nonStubFiles.length}/${targetFilePaths.length} functional files exist, ${emptyFiles.length} empty, ${stubFiles.length} stubs).`;
      errors.push(msg);
      defects.push({
        code: PRD_COVERAGE_DEFECT_CODES.PRD_COVERAGE_FAILURE,
        subtype: PRD_COVERAGE_DEFECT_CODES.PRD_REQUIREMENT_PARTIAL,
        requirementId: reqId,
        missingFiles: missingMappedFiles,
        emptyFiles: emptyFiles.map(f => f.path),
        stubFiles: stubFiles.map(f => f.path),
        severity: 'MEDIUM',
        message: msg
      });
      classifications.push({
        id: reqId,
        description: req.description,
        status: REQUIREMENT_STATUS.SUPPORTED_PARTIAL,
        reason: `Missing files: ${missingMappedFiles.join(', ')}`,
        mappedFiles: targetFilePaths,
        evidence: { existingCount: nonStubFiles.length, totalExpected: targetFilePaths.length }
      });
      partialCount++;
      continue;
    }

    // Check API route presence if requirement explicitly specifies an HTTP endpoint
    const apiMatch = (req.description || '').match(/(?:GET|POST|PUT|PATCH|DELETE)\s+([/a-zA-Z0-9_\-{}]+)/i) ||
                     (req.description || '').match(/(\/api\/[a-zA-Z0-9_\-{}]+)/i);
    if (apiMatch) {
      const targetEndpoint = apiMatch[1].replace(/\/+$/, '').split('?')[0];
      const endpointBasePath = targetEndpoint.replace(/{[^}]+}/g, '').replace(/\/+$/, '');
      const backendFiles = Array.from(fileIndex.values()).filter(f => f && f.path && (f.path.endsWith('.py') || (f.path.endsWith('.js') && f.path.includes('backend')) || (f.path.endsWith('.ts') && f.path.includes('backend'))));
      const hasRouteDefinition = backendFiles.some(bf => {
        const c = bf.content || '';
        return (c.includes(targetEndpoint) || (endpointBasePath && endpointBasePath.length > 3 && c.includes(endpointBasePath))) &&
               /(?:@router\.|@app\.|router\.(?:get|post|put|delete|patch)|app\.(?:get|post|put|delete|patch))/i.test(c);
      });
      if (!hasRouteDefinition) {
        const msg = `PRD Coverage Failure: Requirement ${reqId} specifies endpoint "${apiMatch[0]}" but no matching route handler is implemented in backend files.`;
        errors.push(msg);
        defects.push({
          code: PRD_COVERAGE_DEFECT_CODES.PRD_COVERAGE_FAILURE,
          subtype: PRD_COVERAGE_DEFECT_CODES.PRD_REQUIREMENT_MISSING,
          requirementId: reqId,
          severity: 'HIGH',
          message: msg
        });
        classifications.push({
          id: reqId,
          description: req.description,
          status: REQUIREMENT_STATUS.MISSING,
          reason: `Required endpoint "${apiMatch[0]}" is missing implementation in backend route handlers`,
          mappedFiles: targetFilePaths,
          evidence: null
        });
        missingCount++;
        continue;
      }
    }

    const reqDesc = (req.description || '').toLowerCase();
    const reqType = (req.type || '').toLowerCase();

    // Check API requirement implementation evidence: route handlers required, model/schema alone is insufficient
    const isApiObligation = reqType === 'backend' || reqType === 'api' || /(?:api|endpoint|route|crud|rest\b)/i.test(reqDesc);
    const isDbOnlyRequirement = reqType === 'database' || /(?:database schema|data persistence|orm model|table schema)/i.test(reqDesc);

    if (isApiObligation && !isDbOnlyRequirement) {
      const hasRouteHandler = existingMappedFiles.some(f => {
        const c = f.content || '';
        return /(?:@router\.|@app\.|router\.(?:get|post|put|delete|patch)|app\.(?:get|post|put|delete|patch)|FastAPI\(|express\()/i.test(c);
      });
      const onlyModelsOrDb = existingMappedFiles.every(f => {
        const p = normPath(f.path);
        return /(?:models?|database|db|schemas?)\.(?:py|ts|js)/i.test(p) || /(?:^|\/)(?:models|db|database|schemas)(?:\/|$)/i.test(p);
      });
      if (onlyModelsOrDb || !hasRouteHandler) {
        const msg = `PRD Coverage Failure: Requirement ${reqId} specifies an API obligation, but mapped files lack concrete route handler implementation. A model/schema alone is insufficient.`;
        errors.push(msg);
        defects.push({
          code: PRD_COVERAGE_DEFECT_CODES.PRD_COVERAGE_FAILURE,
          subtype: PRD_COVERAGE_DEFECT_CODES.PRD_REQUIREMENT_MISSING,
          requirementId: reqId,
          severity: 'HIGH',
          message: msg
        });
        classifications.push({
          id: reqId,
          description: req.description,
          status: REQUIREMENT_STATUS.MISSING,
          reason: 'API requirement lacks route handler implementation; model/schema match alone is insufficient',
          mappedFiles: targetFilePaths,
          evidence: null
        });
        missingCount++;
        continue;
      }
    }

    // Check UI requirement implementation evidence: functional component required
    const isUiObligation = reqType === 'frontend' || reqType === 'ui' || /(?:ui\b|frontend|view|page|component|dashboard|screen|modal|form)/i.test(reqDesc);
    if (isUiObligation) {
      const hasFunctionalComponent = existingMappedFiles.some(f => {
        const p = normPath(f.path);
        if (!/\.(tsx|jsx|vue|html)$/i.test(p) && !p.startsWith('frontend/')) return false;
        const c = f.content || '';
        const baseName = path.basename(p, path.extname(p));
        return !isPlaceholderStubComponent(c, baseName) && /(?:function\s+[A-Z]\w*|const\s+[A-Z]\w*\s*=|class\s+[A-Z]\w*|<[a-zA-Z][^>]*>)/i.test(c);
      });
      if (!hasFunctionalComponent) {
        const msg = `PRD Coverage Failure: Requirement ${reqId} specifies a UI obligation, but contains no functional component implementation.`;
        errors.push(msg);
        defects.push({
          code: PRD_COVERAGE_DEFECT_CODES.PRD_COVERAGE_FAILURE,
          subtype: PRD_COVERAGE_DEFECT_CODES.PRD_REQUIREMENT_MISSING,
          requirementId: reqId,
          severity: 'HIGH',
          message: msg
        });
        classifications.push({
          id: reqId,
          description: req.description,
          status: REQUIREMENT_STATUS.MISSING,
          reason: 'UI requirement lacks functional frontend component implementation',
          mappedFiles: targetFilePaths,
          evidence: null
        });
        missingCount++;
        continue;
      }
    }

    // Check Workflow requirement implementation evidence: connected backend + frontend evidence required
    const isWorkflowReq = reqType === 'workflow' || /(?:complete customer|customer and admin|end-to-end checkout|complete workflow)/i.test(reqDesc);
    if (isWorkflowReq) {
      const hasBackendFile = existingMappedFiles.some(f => normPath(f.path).startsWith('backend/') || /\.(py)$/i.test(f.path));
      const hasFrontendFile = existingMappedFiles.some(f => normPath(f.path).startsWith('frontend/') || /\.(tsx|jsx)$/i.test(f.path));
      if (!hasBackendFile || !hasFrontendFile) {
        const msg = `PRD Coverage Failure: Requirement ${reqId} specifies a complete workflow obligation, but lacks connected backend and frontend implementation evidence.`;
        errors.push(msg);
        defects.push({
          code: PRD_COVERAGE_DEFECT_CODES.PRD_COVERAGE_FAILURE,
          subtype: PRD_COVERAGE_DEFECT_CODES.PRD_REQUIREMENT_MISSING,
          requirementId: reqId,
          severity: 'HIGH',
          message: msg
        });
        classifications.push({
          id: reqId,
          description: req.description,
          status: REQUIREMENT_STATUS.MISSING,
          reason: 'Workflow requirement requires both backend and frontend implementation evidence',
          mappedFiles: targetFilePaths,
          evidence: null
        });
        missingCount++;
        continue;
      }
    }

    if (options.requireRuntimeEvidence && !['documentation', 'configuration'].includes(reqType)) {
      const suite = runtimeEvidence?.suites?.find(s => s.passed === true && s.testCount > 0 && s.requirementIds?.includes(reqId) && s.artifactHash === options.artifactHash);
      if (runtimeEvidence?.isValid !== true || runtimeEvidence?.artifactHash !== options.artifactHash || !suite) {
        const message = `Requirement ${reqId} has no passing executable test evidence for the final artifact`;
        errors.push(message);
        defects.push({ code: 'PRD_RUNTIME_EVIDENCE_MISSING', requirementId: reqId, message, severity: 'HIGH' });
        classifications.push({ id: reqId, description: req.description, status: REQUIREMENT_STATUS.FAILED, reason: message, mappedFiles: targetFilePaths, evidence: null });
        failedCount++;
        continue;
      }
    }

    // Case 5: Fully SUPPORTED + IMPLEMENTED
    implementedCount++;
    classifications.push({
      id: reqId,
      description: req.description,
      status: REQUIREMENT_STATUS.SUPPORTED_IMPLEMENTED,
      reason: 'Fully implemented and verified across generated files',
      mappedFiles: targetFilePaths,
      evidence: {
        fileCount: existingMappedFiles.length,
        verifiedFiles: existingMappedFiles.map(f => f.path)
      }
    });
  }

  const totalRequirements = reqs.length;
  const coveredRequirements = implementedCount + deferredCount;
  const coverageRatio = totalRequirements > 0 ? (coveredRequirements / totalRequirements) : 1.0;
  const isValid = missingCount === 0 && failedCount === 0 && partialCount === 0;

  return {
    isValid,
    defects,
    errors,
    classifications,
    metrics: {
      totalRequirements,
      implementedCount,
      partialCount,
      deferredCount,
      missingCount,
      failedCount,
      coverageRatio
    }
  };
}
