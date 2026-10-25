/**
 * Deprecated telemetry helper.
 *
 * The app now prefers live, requirement-derived telemetry and validation
 * messages. This module only returns a neutral validation payload if a caller
 * still asks for simulated data directly.
 */

export const getSimulatedTelemetry = (nodeKey: string) => ({
  status: 'unavailable',
  source: 'validation',
  node_key: nodeKey,
  message: `No live telemetry is available yet for ${nodeKey}. Run Requirement Ops to generate requirement-aligned data.`,
  actionable_insights: [],
  quality_recommendations: [
    'Connect the node to live mission telemetry.',
    'Run Requirement Ops before opening standalone agent views.',
  ],
});
