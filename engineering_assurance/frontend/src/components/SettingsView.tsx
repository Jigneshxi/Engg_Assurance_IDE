import React, { useState, useEffect, useCallback } from 'react';
import { LLMTierPool, LLMIdentity, ConnectionConfig, Platform, LLMConfig } from '../types';
import { API_BASE } from '../config';
import { apiClient } from '../utils/apiClient';
import './SettingsView.css';

interface SettingsProps {
  platforms: Platform[];
  connectedPlatforms: Record<string, ConnectionConfig>;
  onOpenConfig: (id: string) => void;
  status: { type: string; text: string };
  apiBase?: string;
  platformConnStatus?: Record<string, { type: 'idle' | 'testing' | 'success' | 'error', message: string }>;
  onVaultStatusChange?: (isReady: boolean) => void;
}

type PulseStatus = 'idle' | 'testing' | 'online' | 'fault';

interface IdentityState {
  pulse: PulseStatus;
  pulseMsg: string;
  confirmRevoke: boolean;
  revoking: boolean;
}

const TIER_META: Record<string, { icon: string; label: string; color: string; desc: string }> = {
  strategic: { icon: 'ti-crown', label: 'Strategic Tier', color: '#f59e0b', desc: 'Highest-capability models for complex reasoning' },
  primary: { icon: 'ti-bolt', label: 'Primary Tier', color: '#6366f1', desc: 'Default inference tier for all standard tasks' },
  economy: { icon: 'ti-stats-up', label: 'Economy Tier', color: '#10b981', desc: 'Cost-efficient fallback for high-volume tasks' },
  local: { icon: 'ti-shield', label: 'Privacy Shield', color: '#3b82f6', desc: 'Local Ollama - zero data egress' },
};

const FALLBACK_CHAIN = ['strategic', 'primary', 'economy', 'local'];

const PROVIDER_COLORS: Record<string, string> = {
  groq: '#f55036', openai: '#10a37f', ollama: '#7c3aed',
};

const SettingsView: React.FC<SettingsProps> = ({ platforms, connectedPlatforms, onOpenConfig, apiBase, platformConnStatus, onVaultStatusChange }) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'platform'>('ai');
  const [pools, setPools] = useState<LLMTierPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState<string | null>(null);
  const [newIdent, setNewIdent] = useState<LLMConfig>({ provider: 'Groq', url: '', key: '', model: '' });
  const [formPulse, setFormPulse] = useState<{ status: PulseStatus; msg: string }>({ status: 'idle', msg: '' });
  const [identStates, setIdentStates] = useState<Record<number, IdentityState>>({});

  const API_ENDPOINT = apiBase || API_BASE;
  const getPlatStatus = (id: string) =>
    platformConnStatus?.[(id || '').toLowerCase()] ?? { type: 'idle', message: '' };

  const getIdentState = (id: number): IdentityState =>
    identStates[id] ?? { pulse: 'idle', pulseMsg: '', confirmRevoke: false, revoking: false };

  const updateIdentState = (id: number, patch: Partial<IdentityState>) =>
    setIdentStates(prev => ({ ...prev, [id]: { ...getIdentState(id), ...patch } }));

  const hydrateVault = useCallback(async () => {
    try {
      const data = await apiClient.get(`/llm/vault`);
      setPools(data);
    } catch (e) {
      console.error('Vault hydration failed', e);
      setPools([]);
    } finally {
      setLoading(false);
    }
  }, [API_ENDPOINT]);

  useEffect(() => { hydrateVault(); }, [hydrateVault]);

  useEffect(() => {
    const hasActiveIdentity = pools.some(pool =>
      pool.identities?.some(identity => identity.status === 'active' && Boolean(identity.model?.trim()))
    );
    onVaultStatusChange?.(hasActiveIdentity);
  }, [pools, onVaultStatusChange]);

  // ── PULSE TEST (vault-aware — sends only the ID, key decrypted server-side) ──
  const testIdentity = async (id: number, provider: string, model: string) => {
    updateIdentState(id, { pulse: 'testing', pulseMsg: '' });
    try {
      const data = await apiClient.post(`/llm/identity/${id}/test`, {});
      updateIdentState(id, {
        pulse: data.success ? 'online' : 'fault',
        pulseMsg: data.message,
      });
    } catch (e: any) {
      updateIdentState(id, { pulse: 'fault', pulseMsg: 'Backend unreachable - is the server running?' });
    }
  };


  // ── REVOKE (two-step inline confirm) ────────────────────────
  const requestRevoke = (id: number) => updateIdentState(id, { confirmRevoke: true });
  const cancelRevoke = (id: number) => updateIdentState(id, { confirmRevoke: false });
  const executeRevoke = async (id: number) => {
    updateIdentState(id, { revoking: true });
    try {
      await apiClient.delete(`/llm/identity/${id}`);
      setIdentStates(prev => { const n = { ...prev }; delete n[id]; return n; });
      hydrateVault();
    } catch (e: any) {
      updateIdentState(id, { revoking: false, confirmRevoke: false });
      alert('Revocation failed - check backend.');
    }
  };

  // ── ADD IDENTITY ──────────────────────────────────────────────
  const testNewIdentity = async () => {
    const isOllama = newIdent.provider.toLowerCase() === 'ollama';
    if (!newIdent.provider || !newIdent.model || (!isOllama && !newIdent.key)) {
      setFormPulse({ status: 'fault', msg: isOllama ? 'Fill Provider and Model first.' : 'Fill Provider, Model and Key first.' }); return;
    }
    setFormPulse({ status: 'testing', msg: '' });
    try {
      const data = await apiClient.post(`/llm/test`, newIdent);
      setFormPulse({ status: data.success ? 'online' : 'fault', msg: data.message });
    } catch (e: any) {
      setFormPulse({ status: 'fault', msg: 'Pulse failed.' });
    }
  };

  const addIdentity = async (tier: string) => {
    const isOllama = newIdent.provider.toLowerCase() === 'ollama';
    if (!newIdent.provider || !newIdent.model || (!isOllama && !newIdent.key)) {
      alert(isOllama ? 'Please fill Provider and Model before vaulting.' : 'Please fill Provider, Model, and API Key before vaulting.');
      return;
    }

    try {
      const data = await apiClient.post(`/llm/identity`, { ...newIdent, tier });
      setShowAddForm(null);
      setFormPulse({ status: 'idle', msg: '' });
      setNewIdent({ provider: 'Groq', url: '', key: '', model: '' });
      hydrateVault();
    } catch (e: any) {
      alert(`Vault commit failed: ${e?.data?.message || e?.data?.detail || e.message}`);
    }
  };

  // ── TRANSPARENCY CHAIN ────────────────────────────────────────
  const activeChain = FALLBACK_CHAIN.map(tier => ({
    tier,
    meta: TIER_META[tier],
    pool: pools.find(p => p.tier === tier),
    active: pools.find(p => p.tier === tier)?.identities?.find(i => i.status === 'active'),
  })).filter(x => x.pool);

  const primaryActive = activeChain.find(x => x.active);

  // ── IDENTITY CARD ─────────────────────────────────────────────
  const renderIdentityCard = (ident: LLMIdentity, pool: LLMTierPool) => {
    const s = getIdentState(ident.id);
    const usagePct = Math.min(100, Math.round(((ident.usage ?? 0) / (pool.policy?.token_threshold ?? 500000)) * 100));

    const getStatusCfg = (pulse: PulseStatus) => {
      if (pulse === 'online') return { class: 'status-online', label: 'Identity Active' };
      if (pulse === 'testing') return { class: 'status-testing', label: 'Checking Pulse…' };
      if (pulse === 'fault') return { class: 'status-fault', label: 'Heartbeat Failed' };
      return { class: 'status-idle', label: 'Vaulted / Idle' };
    };
    const statusCfg = getStatusCfg(s.pulse);

    return (
      <div key={ident.id} className={`identity-card ${ident.status}`}>
        {/* ── Card Header ── */}
        <div className="icard-header">
          <div className={`icard-provider-badge prov-${ident.provider?.toLowerCase()} bg-prov-alpha border-prov-alpha text-prov`}>
            {ident.provider?.toUpperCase()}
          </div>
          <div className="icard-info">
            <span className="icard-model">{ident.model}</span>
            <span className="icard-key">{ident.key_masked}</span>
          </div>
          <div className={`icard-status-badge ${statusCfg.class}`}>
            <span className="icard-dot"></span>
            {statusCfg.label}
          </div>
        </div>

        {/* ── Usage Bar ── */}
        <div className="icard-usage">
          <div className="usage-bar-container" title={`${((ident.usage ?? 0) / 1000).toFixed(1)}k / ${((pool.policy?.token_threshold ?? 0) / 1000).toFixed(0)}k tokens`}>
            <progress className="usage-progress-bar" value={usagePct} max={100}></progress>
          </div>
          <div className="icard-usage-labels">
            <span>{((ident.usage ?? 0) / 1000).toFixed(1)}k tokens used</span>
            <span>{ident.requests ?? 0} requests</span>
          </div>
        </div>

        {/* ── Fault Detail ── */}
        {s.pulse === 'fault' && s.pulseMsg && (
          <div className="icard-fault-detail">{s.pulseMsg}</div>
        )}

        {/* ── Action Footer ── */}
        <div className="icard-actions">
          {/* Test Connection */}
          <button
            className={`btn-pulse ${s.pulse}`}
            onClick={() => testIdentity(ident.id, ident.provider, ident.model)}
            disabled={s.pulse === 'testing'}
          >
            {s.pulse === 'testing' && <span className="spin-dot" />}
            {s.pulse === 'idle' && <><i className="ti-wifi" /> Test Connection</>}
            {s.pulse === 'testing' && ' Testing...'}
            {s.pulse === 'online' && <><i className="ti-check" /> Online - Re-test</>}
            {s.pulse === 'fault' && <><i className="ti-alert" /> Test Failed - Retry</>}
          </button>

          {/* Spacer */}
          <div className="icard-actions-divider" />

          {/* Revoke (two-step) */}
          {!s.confirmRevoke ? (
            <button className="btn-revoke-soft" onClick={() => requestRevoke(ident.id)} title="Revoke identity">
              <i className="ti-trash" /> Revoke
            </button>
          ) : (
            <div className="revoke-confirm-row">
              <span className="revoke-confirm-label">Sure?</span>
              <button
                className="btn-revoke-confirm"
                onClick={() => executeRevoke(ident.id)}
                disabled={s.revoking}
              >
                {s.revoking ? <span className="spin-dot" /> : 'Yes, Revoke'}
              </button>
              <button className="btn-revoke-cancel" onClick={() => cancelRevoke(ident.id)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── POOL CARD ─────────────────────────────────────────────────
  const renderPoolCard = (pool: LLMTierPool) => {
    const meta = TIER_META[pool.tier] ?? { icon: 'ti-server', label: pool.tier, color: '#6366f1', desc: '' };
    const isOpen = showAddForm === pool.tier;

    return (
      <div key={pool.tier} className={`tier-card-mesh tier-${pool.tier} animate-slideIn`}>
        <div className="tier-stripe bg-tier" />

        {/* Pool Header */}
        <div className="pool-header">
          <div className="pool-icon-cluster">
            <div className="pool-icon-wrap bg-tier-alpha text-tier">
              <i className={meta.icon} />
            </div>
            <div>
              <h4>{meta.label}</h4>
              <span className="pool-desc">{meta.desc}</span>
              <span className="pool-badge">
                {pool.identities.length} {pool.identities.length === 1 ? 'Identity' : 'Identities'} Vaulted
              </span>
            </div>
          </div>
          <button className="btn-icon-plus" onClick={() => {
            setShowAddForm(isOpen ? null : pool.tier);
            setFormPulse({ status: 'idle', msg: '' });
            setNewIdent({ provider: pool.tier === 'local' ? 'Ollama' : 'Groq', url: '', key: '', model: '' });
          }} title="Add identity">
            <i className={isOpen ? 'ti-close' : 'ti-plus'} />
          </button>
        </div>

        {/* Identity Cards */}
        <div className="identity-stack">
          {pool.identities.map(ident => renderIdentityCard(ident, pool))}
          {pool.identities.length === 0 && (
            <div className="empty-pool-card">
              <i className="ti-lock" />
              <span>No identities vaulted - this tier is bypassed in the failover chain.</span>
              <button className="btn-add-first" onClick={() => {
                setShowAddForm(pool.tier);
                setFormPulse({ status: 'idle', msg: '' });
                setNewIdent({ provider: pool.tier === 'local' ? 'Ollama' : 'Groq', url: '', key: '', model: '' });
              }}>
                <i className="ti-plus" /> Add Identity
              </button>
            </div>
          )}
        </div>

        {/* Add Form */}
        {isOpen && (
          <div className="add-identity-overlay animate-fadeIn">
            <h5><i className="ti-lock" /> Vault New Identity → <strong>{meta.label}</strong></h5>
            <div className="mesh-form-grid">
              <select
                id="ai-provider-select"
                title="Select AI Provider"
                aria-label="Select AI Provider"
                value={newIdent.provider}
                onChange={e => setNewIdent({ ...newIdent, provider: e.target.value })}
              >
                <option value="Groq">Groq Cloud</option>
                <option value="OpenAI">OpenAI</option>
                <option value="OpenRouter">OpenRouter</option>
                <option value="Gemini">Google Gemini</option>
                <option value="Ollama">Ollama (Local)</option>
              </select>

              <input
                type="text"
                list="model-options"
                title="Enter model name"
                placeholder="Model (e.g. llama-3.3-70b-versatile)"
                value={newIdent.model}
                onChange={e => setNewIdent({ ...newIdent, model: e.target.value })}
              />
              <datalist id="model-options">
                <option value="llama-3.3-70b-versatile">Groq: LLaMA 3.3 70B</option>
                <option value="llama-3.1-8b-instant">Groq: LLaMA 3.1 8B</option>
                <option value="mixtral-8x7b-32768">Groq: Mixtral 8x7B</option>
                <option value="gpt-4o">OpenAI: GPT-4o</option>
                <option value="gpt-4-turbo">OpenAI: GPT-4 Turbo</option>
                <option value="gpt-3.5-turbo">OpenAI: GPT-3.5 Turbo</option>
                <option value="gemini-1.5-pro">Gemini: 1.5 Pro</option>
                <option value="gemini-1.5-flash">Gemini: 1.5 Flash</option>
                <option value="anthropic/claude-3.5-sonnet">OpenRouter: Claude 3.5 Sonnet</option>
                <option value="anthropic/claude-3-opus">OpenRouter: Claude 3 Opus</option>
                <option value="meta-llama/llama-3-70b-instruct">OpenRouter: LLaMA 3 70B</option>
                <option value="llama3">Ollama: Llama 3</option>
                <option value="mistral">Ollama: Mistral</option>
              </datalist>
              {newIdent.provider.toLowerCase() !== 'ollama' && (
                <input type="password" placeholder="API Key" value={newIdent.key} onChange={e => setNewIdent({ ...newIdent, key: e.target.value })} />
              )}
              {newIdent.provider.toLowerCase() !== 'groq' && (
                <input type="text" placeholder={newIdent.provider.toLowerCase() === 'ollama' ? "Base URL (e.g. http://localhost:11434)" : "Proxy URL (e.g. https://openrouter.ai/api/v1)"} value={newIdent.url} onChange={e => setNewIdent({ ...newIdent, url: e.target.value })} />
              )}
            </div>
            <div className="form-test-row">
              <button className={`btn-test-conn ${formPulse.status}`} onClick={testNewIdentity} disabled={formPulse.status === 'testing'}>
                {formPulse.status === 'testing' && <span className="spin-dot" />}
                {formPulse.status !== 'testing' && <i className="ti-wifi" />}
                {formPulse.status === 'idle' && ' Test Connection First'}
                {formPulse.status === 'testing' && ' Testing...'}
                {formPulse.status === 'online' && ' Connection OK ✓'}
                {formPulse.status === 'fault' && ' Test Failed - Retry'}
              </button>
              {formPulse.msg && formPulse.status !== 'idle' && (
                <span className={`form-pulse-msg ${formPulse.status}`}>{formPulse.msg}</span>
              )}
            </div>
            <div className="mesh-form-actions">
              <button className="btn-primary-mini" onClick={() => addIdentity(pool.tier)}>
                <i className="ti-lock" /> Vault Identity
              </button>
              <button className="btn-outline-mini" onClick={() => { setShowAddForm(null); setFormPulse({ status: 'idle', msg: '' }); }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-overlay">
      <span className="spin-dot large" />
      Synchronizing Identity Mesh...
    </div>
  );

  return (
    <div className="card animate-fadeIn">
      <div className="card-header border-none">
        <h2 className="title-gradient">Resilient Identity Mesh</h2>
        <p>Encrypted LLM key pools with automated failover and rotation.</p>
      </div>

      <div className="operational-banner">
        <i className="ti-info-alt" aria-hidden="true" />
        <span>Operational Guide: Manage your <strong>Resilient Identity Mesh</strong> and Platform Linkage. Identities are group-vaulted into four strategic tiers for automated, fail-safe reasoning.</span>
      </div>

      <div className="card-body">
        {/* ── Transparency Panel ── */}
        <div className="transparency-panel animate-fadeIn" aria-label="Identity Failover Status">
          <div className="tp-header">
            <i className="ti-eye" aria-hidden="true" />
            <span>Active Inference Chain</span>
            <span className="tp-badge" aria-label="System online">LIVE</span>
          </div>
          <div className="tp-chain" role="list">
            {activeChain.map(({ tier, meta, active }, idx) => (
              <React.Fragment key={tier}>
                {idx > 0 && <div className="tp-arrow" aria-hidden="true">→</div>}
                <div role="listitem" className={`tp-node ${active ? 'tp-active' : 'tp-empty'} ${active && tier === primaryActive?.tier ? 'tp-primary' : ''} tier-${tier}`}>
                  <i className={`${meta.icon} text-tier`} aria-hidden="true" />
                  <div>
                    <span className="tp-tier">{meta.label}</span>
                    {active
                      ? <span className="tp-model">{active.provider} · {active.model}</span>
                      : <span className="tp-empty-label">No identity</span>}
                  </div>
                  {active && tier === primaryActive?.tier && <span className="tp-current-badge">IN USE</span>}
                </div>
              </React.Fragment>
            ))}
          </div>
          <p className="tp-note" aria-live="polite">
            {primaryActive
              ? `Active inference: ${primaryActive.active?.provider} / ${primaryActive.active?.model} (${primaryActive.meta.label})`
              : 'No active identities - vault at least one key to enable AI reasoning.'}
          </p>
        </div>

        {/* ── Tabs ── */}
        <div className="workflow-tabs-settings" role="tablist" aria-label="Security and identity management">
          <button className={activeTab === 'ai' ? 'active' : ''} onClick={() => setActiveTab('ai')} role="tab" aria-selected={activeTab === 'ai'}>
            <i className="ti-bolt" aria-hidden="true" /> Identity Vaults
          </button>
          <button className={activeTab === 'platform' ? 'active' : ''} onClick={() => setActiveTab('platform')} role="tab" aria-selected={activeTab === 'platform'}>
            <i className="ti-shield" aria-hidden="true" /> Platform Linkage
          </button>
        </div>

        <div className="settings-content-pane" aria-live="polite">
          {activeTab === 'ai' && (
            <div className="tiered-mesh-container" id="panel-ai" role="tabpanel">
              <div className="mesh-grid">
                {FALLBACK_CHAIN.map(tier => {
                  const pool = pools.find(p => p.tier === tier) || { id: -1, tier, identities: [], policy: { mode: 'auto', token_threshold: 500000 } };
                  return renderPoolCard(pool as LLMTierPool);
                })}
              </div>
              <div className="operational-banner mt-6 animate-fadeIn">
                <i className="ti-info-alt" aria-hidden="true" />
                <p><strong>Adaptive Mesh Fallback:</strong> The agent retries within a tier (Intra-Tier) before downgrading: Strategic → Primary → Economy → Privacy Shield. All keys are encrypted at rest.</p>
              </div>
            </div>
          )}

          {activeTab === 'platform' && (
            <div className="animate-slideIn" id="panel-platform" role="tabpanel">
              {['ALM & DevOps', 'Strategic Repositories', 'Ad-Hoc & Conversational'].map(cat => {
                const catPlatforms = platforms.filter(p => p.category === cat);
                if (catPlatforms.length === 0) return null;
                return (
                  <div key={cat} style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.2rem' }}>
                      <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{cat}</h3>
                      <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
                      <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700 }}>{catPlatforms.length} Nodes</span>
                    </div>
                    <div role="list" className="vault-grid">
                      {catPlatforms.map(p => (
                        <div key={p.id} className={`vault-card ${(p.requires_credentials === false || connectedPlatforms[p.id]) ? 'connected' : 'idle'}`} role="listitem">
                          <div className="vault-header">
                            <div className={`vault-icon-circle ${(p.requires_credentials === false || connectedPlatforms[p.id]) ? 'vault-icon-connected' : 'vault-icon-idle'}`}>
                              <i className={p.icon} aria-hidden="true" />
                            </div>
                            {(() => {
                              if (p.requires_credentials === false) {
                                return (
                                  <span className="vault-status-badge active" title="Local/Ad-hoc source ready">
                                    AVAILABLE
                                  </span>
                                );
                              }
                              const ps = getPlatStatus(p.id);
                              const label =
                                ps.type === 'testing' ? 'TESTING…' :
                                  ps.type === 'success' ? 'VERIFIED' :
                                    ps.type === 'error' ? 'FAILED' :
                                      (connectedPlatforms[p.id] ? 'SECURE IDENTITY' : 'UNAUTHORIZED');
                              const active = ps.type === 'success' || connectedPlatforms[p.id];
                              return (
                                <span className={`vault-status-badge ${active ? 'active' : ''}`} title={ps.message || ''}>
                                  {label}
                                </span>
                              );
                            })()}
                          </div>
                          <div className="vault-body">
                            <h4>{p.name}</h4>
                            <span className="vault-category-tag">{p.category}</span>
                            <p>{p.desc}</p>
                            {(() => {
                              const ps = getPlatStatus(p.id);
                              if (!ps.message || ps.type === 'idle') return null;
                              const statusClass = 
                                ps.type === 'testing' ? 'link-testing' :
                                  ps.type === 'success' ? 'link-success' :
                                    ps.type === 'error' ? 'link-error' : 'link-idle';
                              return (
                                <div className={`vault-link-preview mt-2-5 ${statusClass}`}>
                                  <i className={ps.type === 'success' ? 'ti-check' : ps.type === 'error' ? 'ti-alert' : 'ti-time'} aria-hidden="true" /> {ps.message}
                                </div>
                              );
                            })()}
                            {connectedPlatforms[p.id] && (
                              <div className="vault-link-preview">
                                <i className="ti-link" aria-hidden="true" /> {connectedPlatforms[p.id].url ? (connectedPlatforms[p.id].url.length > 25 ? connectedPlatforms[p.id].url.substring(0, 25) + '...' : connectedPlatforms[p.id].url) : 'Instance Connected'}
                              </div>
                            )}
                          </div>
                          <div className="vault-footer">
                            {p.requires_credentials === false ? (
                              <button
                                className="btn-configured"
                                aria-label={`${p.name} ready`}
                                disabled
                              >
                                <i className="ti-check mr-1-5" /> Local Source
                              </button>
                            ) : (
                              <button
                                className={connectedPlatforms[p.id] || getPlatStatus(p.id).type === 'success' ? 'btn-configured' : 'btn-primary-mini'}
                                onClick={() => onOpenConfig(p.id)}
                                aria-label={`${connectedPlatforms[p.id] ? 'Update' : 'Configure'} access for ${p.name}`}
                              >
                                {(() => {
                                  const ps = getPlatStatus(p.id);
                                  if (ps.type === 'testing') return <><span className="spin-dot mr-2" /> Testing…</>;
                                  if (connectedPlatforms[p.id] || ps.type === 'success') return <><i className="ti-check mr-1-5" /> Configured</>;
                                  return <><i className="ti-wifi mr-1-5" /> Test Connection</>;
                                })()}
                              </button>
                            )}
                            {(connectedPlatforms[p.id] || p.requires_credentials === false) && <i className="ti-check-box text-success ml-2-5" aria-hidden="true" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
