/**
 * ================================================================================
 * DEBUG WINDOW — Raw Backend Log Viewer
 * ================================================================================
 * Shows the complete, unfiltered backend log stream for the current mesh run.
 * Every log entry exactly as stored — timestamp, agent, level, message.
 * Auto-refreshes every 2s while the task is running.
 */

import { apiClient } from '../utils/apiClient';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE } from '../config';

interface DebugWindowProps {
  taskId: string | null;
  isVisible: boolean;
  onClose: () => void;
}

interface RawLogEntry {
  timestamp: string;
  agent: string;
  message: string;
  level?: string;
}

interface DebugData {
  task_id: string;
  status: string;
  mission_intent: string;
  created_at: string | null;
  updated_at: string | null;
  error: string | null;
  active_agents_count: number;
  bypassed_agents_count: number;
  total_log_entries: number;
  level_summary: Record<string, number>;
  agents_seen: string[];
  logs: RawLogEntry[];
}

const LEVEL_COLORS: Record<string, string> = {
  TRACE:    '#475569',
  DEBUG:    '#6366f1',
  INFO:     '#10b981',
  WARN:     '#f59e0b',
  WARNING:  '#f59e0b',
  ERROR:    '#ef4444',
  CRITICAL: '#dc2626',
};

const LEVEL_BG: Record<string, string> = {
  TRACE:    'rgba(71,85,105,0.08)',
  DEBUG:    'rgba(99,102,241,0.08)',
  INFO:     'rgba(16,185,129,0.06)',
  WARN:     'rgba(245,158,11,0.08)',
  WARNING:  'rgba(245,158,11,0.08)',
  ERROR:    'rgba(239,68,68,0.08)',
  CRITICAL: 'rgba(220,38,38,0.12)',
};

const getLevelColor = (level?: string) => LEVEL_COLORS[(level || 'INFO').toUpperCase()] || '#94a3b8';
const getLevelBg = (level?: string) => LEVEL_BG[(level || 'INFO').toUpperCase()] || 'transparent';

const DebugWindow: React.FC<DebugWindowProps> = ({ taskId, isVisible, onClose }) => {
  const [data, setData] = useState<DebugData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copyDone, setCopyDone] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDebugData = useCallback(async () => {
    if (!taskId) return;
    try {
      const json: DebugData = await apiClient.get(`/api/tasks/debug/${taskId}`);
      setData(json);
      setError(null);
    } catch (e: any) {
      if (e.status && e.data) {
        setError(`HTTP ${e.status}: ${e.data.detail || 'Error'}`);
      } else {
        setError(`Fetch failed: ${e.message}`);
      }
    }
  }, [taskId]);

  // Initial load + polling while task is running
  useEffect(() => {
    if (!isVisible || !taskId) return;
    setLoading(true);
    fetchDebugData().finally(() => setLoading(false));

    pollRef.current = setInterval(() => {
      if (data?.status === 'PROCESSING' || data?.status === 'PENDING' || !data) {
        fetchDebugData();
      }
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isVisible, taskId, fetchDebugData]);

  // Stop polling when task reaches terminal state
  useEffect(() => {
    if (data?.status === 'COMPLETED' || data?.status === 'FAILED') {
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [data?.status]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [data?.logs?.length, autoScroll]);

  if (!isVisible) return null;

  const allLogs = data?.logs || [];
  const levels = ['ALL', ...Object.keys(data?.level_summary || {}).sort()];

  const filteredLogs = allLogs.filter(log => {
    const lvl = (log.level || 'INFO').toUpperCase();
    const matchLevel = filter === 'ALL' || lvl === filter;
    const matchSearch = !searchTerm || 
      log.message?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.agent?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchLevel && matchSearch;
  });

  const copyAllLogs = () => {
    const text = filteredLogs.map(l =>
      `[${l.timestamp}] [${(l.level || 'INFO').padEnd(5)}] [${l.agent}] ${l.message}`
    ).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    });
  };

  const statusColor = data?.status === 'COMPLETED' ? '#10b981'
    : data?.status === 'FAILED' ? '#ef4444'
    : data?.status === 'PROCESSING' ? '#6366f1'
    : '#94a3b8';

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(2,6,23,0.92)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: '100%', maxWidth: '1100px', height: '90vh',
        background: '#0a0f1e',
        border: '1px solid #1e293b',
        borderRadius: '16px',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 40px 80px -20px rgba(0,0,0,0.8)',
      }}>

        {/* ── HEADER ── */}
        <div style={{
          padding: '14px 20px',
          background: '#020617',
          borderBottom: '1px solid #1e293b',
          display: 'flex', alignItems: 'center', gap: '12px',
          flexShrink: 0,
        }}>
          {/* Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: data?.status === 'PROCESSING' ? '#6366f1' : statusColor,
              boxShadow: data?.status === 'PROCESSING' ? '0 0 10px #6366f1' : 'none',
              animation: data?.status === 'PROCESSING' ? 'pulse 1.5s infinite' : 'none',
            }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 900, color: '#f1f5f9', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Debug Window
            </span>
            {taskId && (
              <span style={{ fontSize: '0.65rem', color: '#475569', fontFamily: 'monospace' }}>
                {taskId.substring(0, 8).toUpperCase()}
              </span>
            )}
            {data && (
              <span style={{
                fontSize: '0.6rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px',
                background: `${statusColor}20`, color: statusColor, textTransform: 'uppercase',
              }}>
                {data.status}
              </span>
            )}
            {data && (
              <span style={{ fontSize: '0.6rem', color: '#475569', fontWeight: 700 }}>
                {data.mission_intent} · {data.active_agents_count} active · {data.bypassed_agents_count} bypassed
              </span>
            )}
          </div>

          {/* Stats */}
          {data && (
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              {Object.entries(data.level_summary).map(([lvl, count]) => (
                <span key={lvl} style={{ fontSize: '0.62rem', fontWeight: 800, color: getLevelColor(lvl) }}>
                  {lvl}: {count}
                </span>
              ))}
              <span style={{ fontSize: '0.62rem', color: '#334155', fontWeight: 700 }}>
                TOTAL: {data.total_log_entries}
              </span>
            </div>
          )}

          {/* Controls */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={fetchDebugData}
              title="Refresh"
              style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700 }}
            >
              <i className="ti-reload" /> Refresh
            </button>
            <button
              onClick={copyAllLogs}
              title="Copy all logs"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700 }}
            >
              {copyDone ? '✓ Copied' : <><i className="ti-clipboard" /> Copy</>}
            </button>
            <button
              onClick={onClose}
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700 }}
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* ── TOOLBAR ── */}
        <div style={{
          padding: '8px 20px',
          background: '#020617',
          borderBottom: '1px solid #0f172a',
          display: 'flex', gap: '10px', alignItems: 'center',
          flexShrink: 0,
        }}>
          {/* Level filter */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {levels.map(lvl => (
              <button
                key={lvl}
                onClick={() => setFilter(lvl)}
                style={{
                  padding: '3px 10px', borderRadius: '4px', cursor: 'pointer',
                  fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase',
                  border: `1px solid ${filter === lvl ? getLevelColor(lvl) : '#1e293b'}`,
                  background: filter === lvl ? `${getLevelColor(lvl)}20` : 'transparent',
                  color: filter === lvl ? getLevelColor(lvl) : '#475569',
                  transition: 'all 0.15s',
                }}
              >
                {lvl} {lvl !== 'ALL' && data?.level_summary[lvl] ? `(${data.level_summary[lvl]})` : ''}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ flex: 1, position: 'relative' }}>
            <i className="ti-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#334155', fontSize: '0.75rem' }} />
            <input
              type="text"
              placeholder="Filter by message or agent..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%', padding: '5px 10px 5px 28px',
                background: '#0f172a', border: '1px solid #1e293b',
                borderRadius: '6px', color: '#94a3b8', fontSize: '0.75rem',
                outline: 'none', fontFamily: 'monospace',
              }}
            />
          </div>

          {/* Auto-scroll toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.65rem', color: '#475569', fontWeight: 700, userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)}
              style={{ accentColor: '#6366f1' }}
            />
            Auto-scroll
          </label>

          <span style={{ fontSize: '0.62rem', color: '#334155', fontWeight: 700 }}>
            {filteredLogs.length} / {allLogs.length} entries
          </span>
        </div>

        {/* ── LOG BODY ── */}
        <div style={{
          flex: 1, overflowY: 'auto',
          fontFamily: 'JetBrains Mono, Consolas, monospace',
          fontSize: '0.75rem',
          lineHeight: '1.6',
          padding: '8px 0',
        }}>
          {loading && !data && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#334155' }}>
              <i className="ti-reload spin-animation" style={{ fontSize: '1.5rem', marginBottom: '12px', display: 'block', color: '#6366f1' }} />
              Loading debug logs...
            </div>
          )}

          {error && (
            <div style={{ padding: '20px', color: '#ef4444', background: 'rgba(239,68,68,0.06)', margin: '12px 20px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.8rem' }}>
              <i className="ti-alert-circle" style={{ marginRight: '8px' }} />
              {error}
            </div>
          )}

          {!taskId && (
            <div style={{ padding: '60px', textAlign: 'center', color: '#334155' }}>
              <i className="ti-pulse" style={{ fontSize: '2rem', marginBottom: '12px', display: 'block' }} />
              <div style={{ fontWeight: 700, marginBottom: '6px' }}>No active mission</div>
              <div style={{ fontSize: '0.7rem', color: '#1e293b' }}>Start a Phase 1 or Phase 2 run to see debug logs here.</div>
            </div>
          )}

          {filteredLogs.length === 0 && taskId && !loading && !error && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#334155', fontSize: '0.75rem' }}>
              No log entries match the current filter.
            </div>
          )}

          {filteredLogs.map((log, i) => {
            const lvl = (log.level || 'INFO').toUpperCase();
            const color = getLevelColor(lvl);
            const bg = getLevelBg(lvl);
            return (
              <div
                key={i}
                style={{
                  display: 'flex', gap: '0',
                  padding: '2px 20px',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                  borderLeft: lvl === 'ERROR' || lvl === 'CRITICAL' ? `3px solid ${color}` : '3px solid transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}
              >
                {/* Timestamp */}
                <span style={{ color: '#334155', minWidth: '72px', flexShrink: 0, paddingRight: '12px' }}>
                  {log.timestamp}
                </span>

                {/* Level badge */}
                <span style={{
                  color, minWidth: '52px', flexShrink: 0, paddingRight: '12px',
                  fontWeight: 800, fontSize: '0.65rem',
                }}>
                  [{lvl.padEnd(5)}]
                </span>

                {/* Agent */}
                <span style={{
                  color: '#6366f1', minWidth: '120px', flexShrink: 0, paddingRight: '12px',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontSize: '0.7rem',
                }}>
                  {log.agent || 'System'}
                </span>

                {/* Message */}
                <span style={{ color: lvl === 'ERROR' || lvl === 'CRITICAL' ? '#fca5a5' : '#94a3b8', flex: 1, wordBreak: 'break-word' }}>
                  {log.message}
                </span>
              </div>
            );
          })}

          <div ref={logEndRef} />
        </div>

        {/* ── FOOTER ── */}
        {data?.error && (
          <div style={{
            padding: '10px 20px', background: 'rgba(239,68,68,0.08)',
            borderTop: '1px solid rgba(239,68,68,0.2)',
            fontSize: '0.75rem', color: '#fca5a5', flexShrink: 0,
          }}>
            <i className="ti-alert-circle" style={{ marginRight: '8px' }} />
            <strong>Task Error:</strong> {data.error}
          </div>
        )}

        <div style={{
          padding: '8px 20px',
          background: '#020617',
          borderTop: '1px solid #0f172a',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '0.6rem', color: '#1e293b', fontFamily: 'monospace' }}>
            {data?.created_at ? `Started: ${new Date(data.created_at).toLocaleTimeString()}` : ''}
            {data?.updated_at ? `  ·  Last update: ${new Date(data.updated_at).toLocaleTimeString()}` : ''}
          </span>
          <span style={{ fontSize: '0.6rem', color: '#1e293b', fontFamily: 'monospace' }}>
            {data?.agents_seen?.length ? `Agents: ${data.agents_seen.join(', ')}` : ''}
          </span>
        </div>

        <style>{`
          @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.5)} }
        `}</style>
      </div>
    </div>
  );
};

export default DebugWindow;
