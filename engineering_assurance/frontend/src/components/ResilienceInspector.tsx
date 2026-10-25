/**
 * ============================================================================
 * CONVERGE PHASE 3.1 — RESILIENCE INSPECTOR
 * ============================================================================
 * PURPOSE: Visualize the AI's "invisible" self-healing resilience.
 *
 * For every UI element in the generated automation suite, shows:
 * - Primary selector (most stable strategy)
 * - 3 adaptive backup selectors (fallback chain)
 * - Resilience score (0-100) with color-coded ring
 * - Selector strategy badges (data-testid, aria-label, CSS, XPath)
 * - Heal count estimate and fragility risk
 *
 * Makes the self-healing capability demonstrable to stakeholders.
 */

import { apiClient } from '../utils/apiClient';
import React, { useState, useEffect } from 'react';
import { API_BASE } from '../config';

interface BackupSelector {
  selector: string;
  strategy: string;
  confidence: number;
}

interface LocatorElement {
  element_id: string;
  ui_component: string;
  page: string;
  primary_selector: string;
  primary_strategy: string;
  backup_selectors: BackupSelector[];
  resilience_score: number;
  heal_count: number;
  fragility_risk: string;
  recommendation: string;
}

interface ResilienceInspectorProps {
  taskId: string | null;
  demoMode?: boolean;
  /** Can also be fed directly from fullMeshState */
  locatorData?: any;
}

// ── Demo Data ─────────────────────────────────────────────────────────────────
const DEMO_ELEMENTS: LocatorElement[] = [
  {
    element_id: 'EL-001', ui_component: 'Login Submit Button', page: 'Authentication',
    primary_selector: 'data-testid=login-submit', primary_strategy: 'data-testid',
    backup_selectors: [
      { selector: "button[aria-label='Sign In']", strategy: 'aria-label', confidence: 92 },
      { selector: 'button.auth-submit:last-of-type', strategy: 'CSS Context', confidence: 78 },
      { selector: "//button[contains(text(),'Sign In')]", strategy: 'XPath Text', confidence: 65 },
    ],
    resilience_score: 96, heal_count: 1, fragility_risk: 'Low',
    recommendation: 'Primary selector is highly stable. Backup chain covers full DOM restructuring.'
  },
  {
    element_id: 'EL-002', ui_component: 'Email Input Field', page: 'Authentication',
    primary_selector: 'data-testid=email-input', primary_strategy: 'data-testid',
    backup_selectors: [
      { selector: "input[type='email']", strategy: 'CSS Attribute', confidence: 88 },
      { selector: "input[placeholder='Email address']", strategy: 'CSS Attribute', confidence: 74 },
      { selector: "//input[@name='email']", strategy: 'XPath Attribute', confidence: 70 },
    ],
    resilience_score: 91, heal_count: 0, fragility_risk: 'Low',
    recommendation: 'Stable input type selector. Placeholder text may change — monitor.'
  },
  {
    element_id: 'EL-003', ui_component: 'Navigation Menu Toggle', page: 'Dashboard',
    primary_selector: '.nav-hamburger-btn', primary_strategy: 'CSS Class',
    backup_selectors: [
      { selector: "button[aria-label='Toggle navigation']", strategy: 'aria-label', confidence: 85 },
      { selector: "header button:first-child", strategy: 'CSS Context', confidence: 62 },
      { selector: "//header//button[@class[contains(.,'menu')]]", strategy: 'XPath Text', confidence: 55 },
    ],
    resilience_score: 72, heal_count: 4, fragility_risk: 'Medium',
    recommendation: 'CSS class selector is fragile. Add data-testid to this element for stability.'
  },
  {
    element_id: 'EL-004', ui_component: 'Checkout Confirm Button', page: 'Checkout',
    primary_selector: 'data-testid=confirm-order', primary_strategy: 'data-testid',
    backup_selectors: [
      { selector: "button[aria-label='Confirm Order']", strategy: 'aria-label', confidence: 94 },
      { selector: '.checkout-confirm-btn', strategy: 'CSS Class', confidence: 80 },
      { selector: "//button[text()='Confirm Order']", strategy: 'XPath Text', confidence: 72 },
    ],
    resilience_score: 98, heal_count: 0, fragility_risk: 'Low',
    recommendation: 'Excellent selector coverage. Critical path element is fully armored.'
  },
  {
    element_id: 'EL-005', ui_component: 'Search Results Count', page: 'Search',
    primary_selector: '.results-count-label', primary_strategy: 'CSS Class',
    backup_selectors: [
      { selector: "[data-testid='results-count']", strategy: 'data-testid', confidence: 90 },
      { selector: "span.count:first-of-type", strategy: 'CSS Context', confidence: 58 },
      { selector: "//span[contains(@class,'count')]", strategy: 'XPath Class', confidence: 50 },
    ],
    resilience_score: 68, heal_count: 7, fragility_risk: 'High',
    recommendation: 'High heal count detected. Prioritize adding data-testid to this element.'
  },
];

// ── Resilience Ring ───────────────────────────────────────────────────────────
const ResilienceRing: React.FC<{ score: number; size?: number }> = ({ score, size = 52 }) => {
  const color = score >= 90 ? '#10b981' : score >= 75 ? '#6366f1' : score >= 60 ? '#f59e0b' : '#ef4444';
  const r = (size / 2) - 5;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 900, color }}>{score}</span>
      </div>
    </div>
  );
};

// ── Strategy Badge ────────────────────────────────────────────────────────────
const StrategyBadge: React.FC<{ strategy: string; isPrimary?: boolean }> = ({ strategy, isPrimary }) => {
  const colors: Record<string, { bg: string; color: string }> = {
    'data-testid':    { bg: 'rgba(16,185,129,0.12)',  color: '#6ee7b7' },
    'aria-label':     { bg: 'rgba(99,102,241,0.12)',  color: '#a5b4fc' },
    'CSS Context':    { bg: 'rgba(245,158,11,0.1)',   color: '#fcd34d' },
    'CSS Class':      { bg: 'rgba(245,158,11,0.1)',   color: '#fcd34d' },
    'CSS Attribute':  { bg: 'rgba(245,158,11,0.1)',   color: '#fcd34d' },
    'XPath Text':     { bg: 'rgba(239,68,68,0.1)',    color: '#fca5a5' },
    'XPath Attribute':{ bg: 'rgba(239,68,68,0.1)',    color: '#fca5a5' },
    'XPath Class':    { bg: 'rgba(239,68,68,0.1)',    color: '#fca5a5' },
    'Adaptive':       { bg: 'rgba(139,92,246,0.1)',   color: '#c4b5fd' },
  };
  const c = colors[strategy] || { bg: 'rgba(100,116,139,0.1)', color: '#94a3b8' };
  return (
    <span style={{
      padding: '2px 7px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 700,
      background: c.bg, color: c.color,
      border: isPrimary ? `1px solid ${c.color}44` : 'none',
      textTransform: 'uppercase', letterSpacing: '0.3px'
    }}>
      {isPrimary && '★ '}{strategy}
    </span>
  );
};

// ── Risk Badge ────────────────────────────────────────────────────────────────
const RiskBadge: React.FC<{ risk: string }> = ({ risk }) => {
  const c = risk === 'Low' ? { bg: 'rgba(16,185,129,0.1)', color: '#6ee7b7' }
    : risk === 'Medium' ? { bg: 'rgba(245,158,11,0.1)', color: '#fcd34d' }
    : { bg: 'rgba(239,68,68,0.1)', color: '#fca5a5' };
  return (
    <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.62rem', fontWeight: 800, background: c.bg, color: c.color }}>
      {risk} Risk
    </span>
  );
};

// ── Element Row ───────────────────────────────────────────────────────────────
const ElementRow: React.FC<{ element: LocatorElement; index: number }> = ({ element, index }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      borderRadius: '10px',
      border: `1px solid ${element.fragility_risk === 'High' ? 'rgba(239,68,68,0.2)' : element.fragility_risk === 'Medium' ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.07)'}`,
      background: 'rgba(255,255,255,0.02)',
      overflow: 'hidden',
      transition: 'border-color 0.2s'
    }}>
      {/* Row Header */}
      <div
        style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <ResilienceRing score={element.resilience_score} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: '#475569' }}>{element.element_id}</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f1f5f9' }}>{element.ui_component}</span>
            <span style={{ fontSize: '0.65rem', color: '#64748b' }}>· {element.page}</span>
            <RiskBadge risk={element.fragility_risk} />
            {element.heal_count > 0 && (
              <span style={{ fontSize: '0.62rem', color: element.heal_count > 5 ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>
                🔧 {element.heal_count} heals/100 runs
              </span>
            )}
          </div>
          {/* Primary selector preview */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <StrategyBadge strategy={element.primary_strategy} isPrimary />
            <code style={{ fontSize: '0.72rem', color: '#10b981', fontFamily: 'monospace', background: 'rgba(16,185,129,0.06)', padding: '2px 8px', borderRadius: '4px' }}>
              {element.primary_selector}
            </code>
          </div>
        </div>

        {/* Backup count + expand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1rem', fontWeight: 900, color: '#6366f1' }}>{element.backup_selectors.length}</div>
            <div style={{ fontSize: '0.55rem', color: '#475569', textTransform: 'uppercase' }}>Backups</div>
          </div>
          <i className={expanded ? 'ti-angle-up' : 'ti-angle-down'} style={{ color: '#475569', fontSize: '0.8rem' }} />
        </div>
      </div>

      {/* Expanded: Backup Selector Chain */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Selector Chain Visualization */}
          <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
            Adaptive Selector Chain
          </div>

          {/* Primary */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 900, color: '#10b981', flexShrink: 0 }}>1</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                <StrategyBadge strategy={element.primary_strategy} isPrimary />
                <span style={{ fontSize: '0.6rem', color: '#10b981', fontWeight: 700 }}>PRIMARY</span>
              </div>
              <code style={{ fontSize: '0.75rem', color: '#f1f5f9', fontFamily: 'monospace' }}>{element.primary_selector}</code>
            </div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981' }}>100%</div>
          </div>

          {/* Connector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '12px' }}>
            <div style={{ width: '1px', height: '12px', background: 'rgba(255,255,255,0.1)', marginLeft: '11px' }} />
            <span style={{ fontSize: '0.6rem', color: '#334155', fontWeight: 700 }}>FALLBACK CHAIN</span>
          </div>

          {/* Backups */}
          {element.backup_selectors.map((backup, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', marginLeft: `${(i + 1) * 8}px` }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 900, color: '#818cf8', flexShrink: 0 }}>{i + 2}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                  <StrategyBadge strategy={backup.strategy} />
                  <span style={{ fontSize: '0.6rem', color: '#475569', fontWeight: 700 }}>BACKUP {i + 1}</span>
                </div>
                <code style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>{backup.selector}</code>
              </div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: backup.confidence >= 80 ? '#6366f1' : backup.confidence >= 65 ? '#f59e0b' : '#ef4444' }}>
                {backup.confidence}%
              </div>
            </div>
          ))}

          {/* Recommendation */}
          {element.recommendation && (
            <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <i className="ti-light-bulb" style={{ color: '#8b5cf6', fontSize: '0.8rem', marginTop: '2px', flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#c4b5fd', lineHeight: 1.5 }}>{element.recommendation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const ResilienceInspector: React.FC<ResilienceInspectorProps> = ({ taskId, demoMode, locatorData }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterRisk, setFilterRisk] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'score' | 'risk' | 'heals'>('score');

  useEffect(() => {
    if (locatorData && locatorData.elements?.length > 0) {
      setData(locatorData);
      return;
    }
    if (!taskId) return;
    fetchData();
  }, [taskId, locatorData]);

  const fetchData = async () => {
    setLoading(true); setError('');
    try {
      const res = await apiClient.get(`/api/converge/resilience-inspector/${taskId}`);
      if (res.status === "COMPLETED") { setData(await res.json()); }
      else setError('Resilience data not available. Run a mission with Module 2 (Forge) enabled.');
    } catch (e: any) { setError(`Failed to load: ${e.message}`); }
    finally { setLoading(false); }
  };

  if (!taskId && !locatorData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '12px', color: '#475569', textAlign: 'center' }}>
        <i className="ti-anchor" style={{ fontSize: '2.5rem', color: '#334155' }} />
        <p style={{ fontSize: '0.85rem', maxWidth: '300px', lineHeight: 1.6 }}>
          No resilience data is available yet. Run a mission with Module 2 (Forge) to generate Resilience Inspector artifacts.
        </p>
      </div>
    );
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '20px', color: '#64748b', fontSize: '0.85rem', justifyContent: 'center' }}>
      <i className="ti-reload" style={{ animation: 'spin 1s linear infinite' }} />
      Loading resilience artifacts...
      <style>{'@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
    </div>
  );

  if (error && !data) return (
    <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', color: '#fcd34d', fontSize: '0.82rem' }}>
      <i className="ti-alert" style={{ marginRight: '8px' }} />{error}
    </div>
  );

  const elements: LocatorElement[] = data?.elements || [];
  const stability = data?.stability || 'N/A';
  const highRisk = data?.high_risk_count || elements.filter(e => e.fragility_risk === 'High').length;
  const avgScore = elements.length > 0 ? Math.round(elements.reduce((s, e) => s + (e.resilience_score || 0), 0) / elements.length) : 0;

  const filtered = elements
    .filter(e => filterRisk === 'ALL' || e.fragility_risk === filterRisk)
    .sort((a, b) => {
      if (sortBy === 'score') return b.resilience_score - a.resilience_score;
      if (sortBy === 'heals') return b.heal_count - a.heal_count;
      const riskOrder = { High: 0, Medium: 1, Low: 2 };
      return (riskOrder[a.fragility_risk as keyof typeof riskOrder] || 2) - (riskOrder[b.fragility_risk as keyof typeof riskOrder] || 2);
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti-anchor" style={{ color: '#10b981', fontSize: '1rem' }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#f1f5f9' }}>Resilience Inspector</h3>
            <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748b' }}>
              Primary + 3 adaptive backup selectors per element
            </p>
          </div>
        </div>
        {data?.data_source && (
          <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: data.data_source.includes('Simulation') || data.data_source.includes('AI') ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)', color: data.data_source.includes('Simulation') || data.data_source.includes('AI') ? '#fcd34d' : '#10b981' }}>
            {data.data_source}
          </span>
        )}
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
        {[
          { label: 'Elements', value: elements.length, color: '#6366f1' },
          { label: 'Avg Score', value: avgScore, color: avgScore >= 85 ? '#10b981' : avgScore >= 70 ? '#f59e0b' : '#ef4444' },
          { label: 'High Risk', value: highRisk, color: highRisk > 0 ? '#ef4444' : '#10b981' },
          { label: 'Stability', value: stability, color: '#8b5cf6' },
        ].map(stat => (
          <div key={stat.label} style={{ padding: '12px', borderRadius: '10px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: '0.62rem', color: '#475569', marginTop: '3px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Filter + Sort Bar */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.03)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
          {['ALL', 'Low', 'Medium', 'High'].map(risk => (
            <button key={risk} onClick={() => setFilterRisk(risk)} style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', background: filterRisk === risk ? 'rgba(99,102,241,0.2)' : 'transparent', color: filterRisk === risk ? '#a5b4fc' : '#64748b', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}>
              {risk}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
          <span style={{ fontSize: '0.65rem', color: '#475569', alignSelf: 'center' }}>Sort:</span>
          {[{ id: 'score', label: 'Score' }, { id: 'risk', label: 'Risk' }, { id: 'heals', label: 'Heals' }].map(s => (
            <button key={s.id} onClick={() => setSortBy(s.id as any)} style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: sortBy === s.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)', color: sortBy === s.id ? '#a5b4fc' : '#64748b', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer' }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Element List */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px', color: '#475569', fontSize: '0.82rem' }}>
          No elements match the current filter.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map((el, i) => <ElementRow key={el.element_id} element={el} index={i} />)}
        </div>
      )}

      {/* Legend */}
      <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.62rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', alignSelf: 'center' }}>Strategy Legend:</span>
        {[
          { strategy: 'data-testid', desc: 'Most stable' },
          { strategy: 'aria-label', desc: 'Accessibility-based' },
          { strategy: 'CSS Context', desc: 'Moderate stability' },
          { strategy: 'XPath Text', desc: 'Last resort' },
        ].map(item => (
          <div key={item.strategy} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <StrategyBadge strategy={item.strategy} />
            <span style={{ fontSize: '0.62rem', color: '#475569' }}>{item.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ResilienceInspector;

