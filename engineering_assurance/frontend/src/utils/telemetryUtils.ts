/**
 * ================================================================================
 * AEIAP TELEMETRY UTILITIES — DATA ORIGIN & ASSET RESOLUTION
 * ================================================================================
 */

/**
 * Evaluates the origin of a telemetry node.
 * Returns 'live' if data is present and non-empty, otherwise 'simulated'.
 */
export const evaluateDataOrigin = (telemetry: any): 'live' | 'simulated' => {
  if (!telemetry) return 'simulated';
  
  // Array check: Must have items
  if (Array.isArray(telemetry)) {
    return telemetry.length > 0 ? 'live' : 'simulated';
  }
  
  // Object check: Must have more than 0 keys
  if (typeof telemetry === 'object') {
    return Object.keys(telemetry).length > 0 ? 'live' : 'simulated';
  }
  
  // String/Primitive check
  return telemetry ? 'live' : 'simulated';
};

/**
 * Resolves artifact download availability.
 * Ensures we don't present "Dead Links" for pending agent outputs.
 */
export const resolveAssetStatus = (
  assetKey: string,
  fullMeshState: any
): { status: 'ready' | 'synthesizing' | 'unavailable'; url: string | null } => {
  if (!fullMeshState) return { status: 'unavailable', url: null };

  // 1. Check in specific artifact registry if present
  const artifacts = fullMeshState.artifacts || fullMeshState.files || [];
  const found = artifacts.find((a: any) => 
    a.key === assetKey || a.name?.toLowerCase().includes(assetKey.toLowerCase())
  );

  if (found) {
    return { status: 'ready', url: found.url || found.path };
  }

  // 2. Logic Check: If the mission is active but the file isn't in the list, it's synthesizing
  if (fullMeshState.status === 'processing') {
    return { status: 'synthesizing', url: null };
  }

  return { status: 'unavailable', url: null };
};
