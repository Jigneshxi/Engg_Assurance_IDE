/**
 * ================================================================================
 * EVALUATIONS BY SeQuor - RUN HISTORY SIDEBAR PANEL
 * ================================================================================
 * Fetches all past generation runs from /api/history/list and displays them
 * as a browseable timeline. Clicking any run opens its logs in the ExecutionLog
 * panel and allows download of the generated artifact.
 */

import { apiClient } from '../utils/apiClient';
import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../config';
import './RunHistory.css';

interface HistoryRecord {
  id: number;
  summary: string;
  platform: string;
  ticket_id: string;
  download_url: string | null;
  created_at: string;
}

interface RunHistoryProps {
  isVisible: boolean;
  onClose: () => void;
  onOpenLog: (taskId: string) => void;
  apiBase?: string;
}

const PLATFORM_ICONS: Record<string, string> = {
  'jira': '🔵', 'ado': '💜', 'github': '⬜', 'gitlab': '🟠',
  'xray': '🟡', 'testrail': '🔴', 'multi': '🌐', 'manual': '✍️',
};

const STATUS_COLORS: Record<string, string> = {
  'COMPLETED': '#10b981', 'FAILED': '#ef4444', 'PROCESSING': '#f59e0b', 'PENDING': '#6366f1',
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

const truncate = (s: string, len = 58) => s.length > len ? s.slice(0, len) + '...' : s;

// Demo records when backend is offline
const DEMO_RECORDS: HistoryRecord[] = [
  {
    id: 3,
    summary: 'Swag Labs - E2E Checkout Validation (Simulated)',
    platform: 'multi',
    ticket_id: 'demo-swag-001',
    download_url: null,
    created_at: new Date(Date.now() - 5 * 60000).toISOString(),
  },
  {
    id: 2,
    summary: 'VVNT Payment Gateway - Security & Compliance Audit',
    platform: 'jira',
    ticket_id: 'VVNT-2891',
    download_url: '/outputs/VVNT_TestPlan_VVNT2891.docx',
    created_at: new Date(Date.now() - 3 * 3600000).toISOString(),
  },
  {
    id: 1,
    summary: 'Order Management API - Regression Priority Analysis',
    platform: 'ado',
    ticket_id: 'ADO-4401',
    download_url: '/outputs/VVNT_TestPlan_ADO4401.docx',
    created_at: new Date(Date.now() - 24 * 3600000).toISOString(),
  },
];

export const RunHistory: React.FC<RunHistoryProps> = ({ isVisible, onClose, onOpenLog, apiBase = API_BASE }) => {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDemo, setIsDemo] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get(`/history/list`);
      if (true) {
        setRecords(data.length > 0 ? data : DEMO_RECORDS);
        setIsDemo(data.length === 0);
      } else {
        setRecords(DEMO_RECORDS);
        setIsDemo(true);
      }
    } catch {
      setRecords(DEMO_RECORDS);
      setIsDemo(true);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    if (isVisible) fetchHistory();
  }, [isVisible, fetchHistory]);

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await apiClient.delete(`/history/${id}`);
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch {
      setRecords(prev => prev.filter(r => r.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  const handleReplay = (record: HistoryRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenLog(record.ticket_id);
  };

  const filtered = records.filter(r =>
    r.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.platform.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.ticket_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isVisible) return null;

  return (
    <div className="rh-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rh-panel">
        {/* ── HEADER ── */}
        <div className="rh-header">
          <div className="rh-header-left">
            <span className="rh-icon">📋</span>
            <div>
              <div className="rh-title">Run History</div>
              <div className="rh-subtitle">{records.length} execution{records.length !== 1 ? 's' : ''} logged{isDemo ? ' · Demo Mode' : ''}</div>
            </div>
          </div>
          <div className="rh-header-actions">
            <button className="rh-refresh-btn" onClick={fetchHistory} title="Refresh">
              ↻
            </button>
            <button className="rh-close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── SEARCH ── */}
        <div className="rh-search-row">
          <input
            className="rh-search"
            placeholder="🔍   Search runs by summary, platform, ticket ID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {/* ── STATS ROW ── */}
        <div className="rh-stats-row">
          <div className="rh-stat">
            <div className="rh-stat-num">{records.length}</div>
            <div className="rh-stat-label">Total Runs</div>
          </div>
          <div className="rh-stat">
            <div className="rh-stat-num" style={{ color: '#10b981' }}>
              {records.filter(r => r.download_url).length}
            </div>
            <div className="rh-stat-label">Artifacts</div>
          </div>
          <div className="rh-stat">
            <div className="rh-stat-num" style={{ color: '#6366f1' }}>
              {new Set(records.map(r => r.platform)).size}
            </div>
            <div className="rh-stat-label">Platforms</div>
          </div>
          <div className="rh-stat">
            <div className="rh-stat-num" style={{ color: '#f59e0b' }}>44</div>
            <div className="rh-stat-label">Agents</div>
          </div>
        </div>

        {/* ── LIST ── */}
        <div className="rh-list">
          {loading && (
            <div className="rh-loading">
              <div className="rh-spinner" />
              <span>Loading run history...</span>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="rh-empty">
              <div className="rh-empty-icon">🔍</div>
              <div>No runs match your search.</div>
            </div>
          )}

          {!loading && filtered.map(record => (
            <div
              key={record.id}
              className={`rh-card ${selectedId === record.id ? 'selected' : ''}`}
              onClick={() => setSelectedId(selectedId === record.id ? null : record.id)}
            >
              {/* Top row */}
              <div className="rh-card-top">
                <div className="rh-card-platform">
                  <span className="rh-platform-icon">{PLATFORM_ICONS[record.platform] || '🌐'}</span>
                  <span className="rh-platform-name">{record.platform.toUpperCase()}</span>
                </div>
                <div className="rh-card-date">{formatDate(record.created_at)}</div>
              </div>

              {/* Summary */}
              <div className="rh-card-summary">{truncate(record.summary)}</div>

              {/* Ticket */}
              <div className="rh-card-ticket">
                <span className="rh-ticket-badge">#{record.ticket_id}</span>
              </div>

              {/* Expanded actions */}
              {selectedId === record.id && (
                <div className="rh-card-actions" onClick={e => e.stopPropagation()}>
                  <button
                    className="rh-btn rh-btn-replay"
                    onClick={(e) => handleReplay(record, e)}
                    title="Replay agent thought log"
                  >
                    ▶ Replay Log
                  </button>
                  {record.download_url && (
                    <a
                      className="rh-btn rh-btn-download"
                      href={`${apiBase}${record.download_url}`}
                      download
                      onClick={e => e.stopPropagation()}
                    >
                      ⬇ Download
                    </a>
                  )}
                  <button
                    className="rh-btn rh-btn-delete"
                    onClick={(e) => handleDelete(record.id, e)}
                    disabled={deletingId === record.id}
                    title="Delete this run"
                  >
                    {deletingId === record.id ? '...' : '🗑️'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── FOOTER ── */}
        <div className="rh-footer">
          <span><i style={{ textTransform: 'none' }}>for SeQuor Evaluations</i> <span style={{ color: '#6366f1' }}>·</span> 44-Agent Mesh</span>
          {isDemo && <span className="rh-demo-badge">DEMO DATA</span>}
        </div>
      </div>
    </div>
  );
};

export default RunHistory;
