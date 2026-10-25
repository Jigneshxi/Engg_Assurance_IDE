/**
 * UI Truthfulness Evaluator (Node ESM)
 * Enforces fail-closed rules ensuring frontend never claims success
 * unless backend final completion gate has verifiably passed.
 */

export function evaluateUiTruthfulness(input = {}) {
  const {
    completionGate = null,
    donePayload = null,
    activeRepairsCount = 0,
    blockedFilesCount = 0,
    failedFilesCount = 0,
    streamDisconnectedAbruptly = false,
    hasTerminalError = false,
    terminalErrorMessage = ''
  } = input;

  // 1. Terminal Error or Stream Disconnect (Fail-closed)
  if (hasTerminalError || streamDisconnectedAbruptly) {
    return {
      uiStatus: 'error',
      isSuccess: false,
      bannerTitle: 'Generation Halted with Execution Failure',
      bannerMessage: terminalErrorMessage || (streamDisconnectedAbruptly
        ? 'Connection terminated unexpectedly before completion gate passed.'
        : 'Execution failed during generation pipeline.'),
      badgeText: 'ERROR',
      badgeTheme: 'danger',
      failedGates: completionGate?.failedGates || []
    };
  }

  // 2. Authoritative Final Completion Gate Evaluation
  // If the completion gate has already been evaluated, its verdict is authoritative.
  if (completionGate) {
    const failedGates = Array.isArray(completionGate.failedGates) ? completionGate.failedGates : [];
    if (completionGate.status !== 'PASS' || failedGates.length > 0) {
      const failedList = failedGates.length > 0 ? failedGates.join(', ') : 'finalCompletionGate';
      return {
        uiStatus: 'error',
        isSuccess: false,
        bannerTitle: 'Generation Halted with Validation Failures',
        bannerMessage: `Authoritative completion gate rejected generation. Failed gates: ${failedList}.`,
        badgeText: 'GATE FAILED',
        badgeTheme: 'danger',
        failedGates: failedGates.length > 0 ? failedGates : ['finalCompletionGate']
      };
    }

    // Conflicting Telemetry: completion gate claims PASS but done payload claims failed
    if (donePayload && (donePayload.status === 'failed' || donePayload.gateStatus === 'FAIL')) {
      const conflictingGates = donePayload.failedGates?.length ? donePayload.failedGates : ['telemetryMismatch'];
      return {
        uiStatus: 'error',
        isSuccess: false,
        bannerTitle: 'Conflicting Telemetry Rejected',
        bannerMessage: 'Completion signal indicated failure despite partial pass assertion.',
        badgeText: 'CONFLICT',
        badgeTheme: 'danger',
        failedGates: conflictingGates
      };
    }

    // Blocked or failed files remaining when gate claims PASS
    if (blockedFilesCount > 0 || failedFilesCount > 0) {
      return {
        uiStatus: 'error',
        isSuccess: false,
        bannerTitle: 'Generation Incomplete / Blocked',
        bannerMessage: `${blockedFilesCount} file(s) blocked, ${failedFilesCount} file(s) failed. Final gate cannot pass.`,
        badgeText: 'FAILED',
        badgeTheme: 'danger',
        failedGates: ['generationCompleteness']
      };
    }

    // Verified PASS state
    return {
      uiStatus: 'done',
      isSuccess: true,
      bannerTitle: 'Project Generation & Validation Complete',
      bannerMessage: 'All modules completed successfully. 15/15 gates verified.',
      badgeText: 'DONE',
      badgeTheme: 'success',
      failedGates: []
    };
  }

  // 3. Active Repairs running - UI must never claim completion while repair is in flight
  if (activeRepairsCount > 0) {
    return {
      uiStatus: 'generating',
      isSuccess: false,
      bannerTitle: 'Active Repair In Progress',
      bannerMessage: `Automated repair active for ${activeRepairsCount} file(s). Final gate not yet evaluated.`,
      badgeText: 'REPAIRING',
      badgeTheme: 'warning',
      failedGates: []
    };
  }

  // 4. Blocked files or Failed files without completion gate
  if (blockedFilesCount > 0 || failedFilesCount > 0) {
    return {
      uiStatus: 'error',
      isSuccess: false,
      bannerTitle: 'Generation Incomplete / Blocked',
      bannerMessage: `${blockedFilesCount} file(s) blocked, ${failedFilesCount} file(s) failed. Final gate cannot pass.`,
      badgeText: 'FAILED',
      badgeTheme: 'danger',
      failedGates: ['generationCompleteness']
    };
  }

  // 5. Missing completion gate payload (Fail-closed)
  if (donePayload) {
    return {
      uiStatus: 'error',
      isSuccess: false,
      bannerTitle: 'Unverified Completion Rejected',
      bannerMessage: 'Received completion signal without authoritative completion gate verification.',
      badgeText: 'UNVERIFIED',
      badgeTheme: 'danger',
      failedGates: ['missingCompletionGate']
    };
  }

  return {
    uiStatus: 'idle',
    isSuccess: false,
    bannerTitle: 'Ready for PRD Specification',
    bannerMessage: 'Awaiting generation trigger.',
    badgeText: 'PRD ENTRY',
    badgeTheme: 'info',
    failedGates: []
  };
}

export function preserveFailedCompletionGate(previous, failure = {}) {
  const details = Array.isArray(failure?.failedGates) && failure.failedGates.length ? failure.failedGates : previous?.failedGates;
  return { ...previous, ...failure, status: 'FAIL', failedGates: details?.length ? details : ['final_validation'] };
}
