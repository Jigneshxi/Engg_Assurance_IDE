import React from 'react';
import { evaluateDataOrigin } from '../../utils/telemetryUtils';
import { useStandaloneInvokeEnabled } from './standaloneInvoke';

interface GenericTelemetryWorkspaceProps {
  nodeKey: string;
  title?: string;
  onInvoke: (context?: string) => void;
  loading: boolean;
  standaloneEnabled?: boolean;
  telemetry: any;
}

const labelize = (value: string) =>
  value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

// One-line capability descriptions for Tier 2 & 3 agents (45-59)
const NODE_DESCRIPTIONS: Record<string, string> = {
  perf_intelligence_config:    'Analyses throughput, latency percentiles, and bottleneck hotspots across the execution mesh.',
  observability_intelligence:  'Correlates distributed traces, metrics, and logs into a unified quality signal.',
  rca_intelligence:            'Applies semantic 5-Whys reasoning to isolate the definitive root cause of failures.',
  incident_remediation:        'Generates auto-remediation playbooks and mean-time-to-recovery projections.',
  system_resilience:           'Scores system resilience and designs chaos experiments for anti-fragile validation.',
  release_risk_decision:       'Produces a binary GO/NO-GO release recommendation with confidence scoring.',
  business_impact_intelligence:'Maps test coverage gaps to revenue exposure and customer retention risk.',
  eng_economics_roi:           'Calculates automation ROI, FTE efficiency gains, and cost-per-defect metrics.',
  eng_knowledge_graph:         'Builds a recursive entity graph linking requirements, tests, and defects.',
  platform_meta_intelligence:  'Learns from historical mission patterns to continuously improve mesh strategy.',
  exploratory_test_assistant:  'Generates exploratory test charters and session-based testing heuristics.',
  locator_intelligence:        'Detects brittle selectors and proposes resilient, self-healing alternatives.',
  auto_migration_assistant:    'Converts legacy automation scripts to modern frameworks with zero manual effort.',
  mutation_test_assistant:     'Measures test suite effectiveness by injecting code mutations and tracking kills.',
  i18n_test_assistant:         'Validates locale-specific rendering, RTL layouts, and character encoding compliance.',
};

const GenericTelemetryWorkspace: React.FC<GenericTelemetryWorkspaceProps> = ({
  nodeKey,
  title,
  onInvoke,
  loading,
  telemetry,
}) => {
  const origin = evaluateDataOrigin(telemetry);
  const workspaceTitle = title || labelize(nodeKey);
  const description = NODE_DESCRIPTIONS[nodeKey] ?? null;
  const standaloneLocked = !useStandaloneInvokeEnabled();

  return (
    <div
      style={{
        padding: '20px',
        borderRadius: '14px',
        background: 'linear-gradient(135deg, #0f172a, #111827)',
        border: '1px solid #1e293b',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '12px',
          marginBottom: description ? '10px' : '16px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '0.68rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 800,
              color: '#93c5fd',
            }}
          >
            Specialist Telemetry Workspace
          </div>
          <h3 style={{ margin: '6px 0 0', color: '#f8fafc', fontSize: '1.1rem' }}>{workspaceTitle}</h3>
        </div>
        <div
          style={{
            padding: '5px 10px',
            borderRadius: '6px',
            fontSize: '0.65rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            flexShrink: 0,
            background:
              origin === 'live'
                ? 'rgba(16, 185, 129, 0.1)'
                : 'rgba(245, 158, 11, 0.1)',
            color: origin === 'live' ? '#10b981' : '#f59e0b',
            border: `1px solid ${
              origin === 'live'
                ? 'rgba(16,185,129,0.2)'
                : 'rgba(245,158,11,0.2)'
            }`,
          }}
        >
          {origin === 'live' ? 'Live Mesh Data' : 'Awaiting Live Data'}
        </div>
      </div>

      {/* Capability description — always shown when available */}
      {description && (
        <p
          style={{
            color: '#64748b',
            fontSize: '0.82rem',
            margin: '0 0 16px 0',
            lineHeight: 1.55,
            borderLeft: '2px solid #1e3a5f',
            paddingLeft: '10px',
          }}
        >
          {description}
        </p>
      )}

      {/* Status message */}
      <p style={{ color: '#cbd5e1', fontSize: '0.9rem', margin: 0, lineHeight: 1.6 }}>
        {origin === 'live'
          ? 'Live mesh payload resolved. Review the report parameters below for the exact fields feeding this workspace.'
          : 'This node is ready. A standalone run will hydrate its report parameters from the current mesh context.'}
      </p>

      {/* Action */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
        <button
          onClick={() =>
            onInvoke(`Refresh ${workspaceTitle} using the current mesh execution state.`)
          }
          disabled={loading || standaloneLocked}
          style={{
            padding: '10px 18px',
            background: loading || standaloneLocked ? '#1e3a5f' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: loading || standaloneLocked ? 'not-allowed' : 'pointer',
            fontWeight: 700,
            fontSize: '0.85rem',
            transition: 'background 0.2s',
          }}
        >
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="ti-reload spin-animation"></i> Processing...
            </span>
          ) : (
            'Refresh Analysis'
          )}
        </button>
      </div>
    </div>
  );
};

export default GenericTelemetryWorkspace;
