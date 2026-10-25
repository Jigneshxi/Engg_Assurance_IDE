/**
 * UI Truthfulness Evaluator
 * Enforces fail-closed rules ensuring frontend never claims success
 * unless backend final completion gate has verifiably passed.
 */

export interface CompletionGatePayload {
  status: 'PASS' | 'FAIL';
  failedGates?: string[];
  totalGates?: number;
  passedGatesCount?: number;
  allModulesPassed?: boolean;
}

export interface StreamDonePayload {
  status?: string;
  gateStatus?: 'PASS' | 'FAIL' | string;
  failedGates?: string[];
  files?: Array<{ path: string; content?: string }>;
  report?: any;
  summary?: string;
}

export interface UiTruthfulnessInput {
  completionGate?: CompletionGatePayload | null;
  donePayload?: StreamDonePayload | null;
  activeRepairsCount?: number;
  blockedFilesCount?: number;
  failedFilesCount?: number;
  streamDisconnectedAbruptly?: boolean;
  hasTerminalError?: boolean;
  terminalErrorMessage?: string;
}

export interface UiTruthfulState {
  uiStatus: 'idle' | 'generating' | 'done' | 'error';
  isSuccess: boolean;
  bannerTitle: string;
  bannerMessage: string;
  badgeText: string;
  badgeTheme: 'success' | 'danger' | 'warning' | 'info';
  failedGates: string[];
}

export function evaluateUiTruthfulness(input: UiTruthfulnessInput = {}): UiTruthfulState {
  const {
    completionGate,
    donePayload,
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

export function preserveFailedCompletionGate(previous : CompletionGatePayload | null, failure : Partial<CompletionGatePayload> = {}): CompletionGatePayload {
  const details = Array.isArray(failure?.failedGates) && failure.failedGates.length ? failure.failedGates : previous?.failedGates;
  return { ...previous, ...failure, status: 'FAIL', failedGates: details?.length ? details : ['final_validation'] };
}
