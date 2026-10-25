import React, { useState } from 'react';

interface TddReportEntry {
  taskId: string;
  title: string;
  status: 'GREEN' | 'RED' | 'PENDING';
}

interface TDDStatusIndicatorProps {
  tddReport: Record<string, string>;  // task_id → "GREEN" | "RED"
  tasks: Array<{ task_id?: string; id?: string; title?: string; name?: string }>;
}

const TDDStatusIndicator: React.FC<TDDStatusIndicatorProps> = ({ tddReport, tasks }) => {
  // If no report data yet, show waiting state
  const reportEntries = Object.keys(tddReport || {});
  const hasData = reportEntries.length > 0;
  
  // Build display entries by mapping task_ids to titles
  const entries: TddReportEntry[] = reportEntries.map(taskId => {
    const matchingTask = (tasks || []).find(
      (t: any) => (t.task_id || t.id) === taskId
    );
    return {
      taskId,
      title: matchingTask?.title || matchingTask?.name || taskId,
      status: (tddReport[taskId] === 'GREEN' ? 'GREEN' : tddReport[taskId] === 'RED' ? 'RED' : 'PENDING') as 'GREEN' | 'RED' | 'PENDING',
    };
  });
  
  const greenCount = entries.filter(e => e.status === 'GREEN').length;
  const redCount = entries.filter(e => e.status === 'RED').length;
  const total = entries.length;
  const allGreen = total > 0 && greenCount === total;
  const allRed = total > 0 && redCount === total;

  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'GREEN': return '#10b981';
      case 'RED': return '#ef4444';
      default: return '#475569';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'GREEN': return 'ti-check';
      case 'RED': return 'ti-close';
      default: return 'ti-time';
    }
  };

  return (
    <div style={{ marginBottom: '32px', border: '1px solid #1e293b', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#0f172a' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <i className="ti-shield" style={{ color: allGreen ? '#10b981' : (redCount > 0 ? '#ef4444' : '#475569'), fontSize: '1.2rem' }}></i>
          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Phase 4: TDD Verification Suite
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {!hasData && (
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, padding: '4px 12px', backgroundColor: 'rgba(100,116,139,0.1)', borderRadius: '12px' }}>
              Awaiting Execution...
            </span>
          )}
          {hasData && allGreen && (
            <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700, padding: '4px 12px', backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: '12px' }}>
              All Tests Passed ({greenCount}/{total})
            </span>
          )}
          {hasData && !allGreen && (
            <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 700, padding: '4px 12px', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: '12px' }}>
              {greenCount}/{total} Passed — {redCount} Failed
            </span>
          )}
        </div>
      </div>
      
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {hasData && allRed && (
            <div style={{
                padding: '12px 16px',
                background: '#1a1a00',
                border: '1px solid #ca8a04',
                borderRadius: '8px',
                marginBottom: '4px',
                fontSize: '0.8rem',
                color: '#fcd34d'
            }}>
                ⚠️ All tests failing — this usually means the implementation server 
                is not running. Connect your server in Phase 3 and re-run.
            </div>
        )}
        {!hasData ? (
          <div style={{ color: '#64748b', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px' }}>
            <i className="ti-time"></i> TDD contracts will be executed when forge writes complete.
          </div>
        ) : (
          entries.map(entry => {
            const matchingTask = (tasks || []).find((t: any) => (t.task_id || t.id) === entry.taskId);
            return (
            <div key={entry.taskId}>
              <div 
                onClick={() => setExpandedTask(expandedTask === entry.taskId ? null : entry.taskId)}
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '12px 16px',
                  backgroundColor: entry.status === 'GREEN' ? 'rgba(16,185,129,0.05)' : entry.status === 'RED' ? 'rgba(239,68,68,0.05)' : '#020617',
                  border: `1px solid ${entry.status === 'GREEN' ? 'rgba(16,185,129,0.2)' : entry.status === 'RED' ? 'rgba(239,68,68,0.2)' : '#0f172a'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ 
                    width: '28px', height: '28px', borderRadius: '50%', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: `${getStatusColor(entry.status)}20`,
                    color: getStatusColor(entry.status)
                  }}>
                    <i className={getStatusIcon(entry.status)}></i>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>{entry.taskId}</span>
                    <span style={{ fontSize: '0.85rem', color: entry.status === 'GREEN' ? '#e2e8f0' : entry.status === 'RED' ? '#fca5a5' : '#cbd5e1', fontWeight: 500 }}>
                      {entry.title.length > 80 ? entry.title.substring(0, 80) + '...' : entry.title}
                    </span>
                  </div>
                </div>
                
                <div style={{ 
                  fontSize: '0.7rem', 
                  fontWeight: 800, 
                  padding: '4px 10px', 
                  borderRadius: '6px',
                  backgroundColor: `${getStatusColor(entry.status)}20`,
                  color: getStatusColor(entry.status),
                  textTransform: 'uppercase'
                }}>
                  {entry.status}
                </div>
              </div>
              {expandedTask === entry.taskId && matchingTask?.failure_reason && (
                <div style={{
                    padding: '12px 16px',
                    background: '#1a0000',
                    borderLeft: '3px solid #ef4444',
                    borderRight: '1px solid #ef4444',
                    borderBottom: '1px solid #ef4444',
                    borderBottomLeftRadius: '8px',
                    borderBottomRightRadius: '8px',
                    marginTop: '-4px', // Connect to the row above
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    color: '#fca5a5',
                    whiteSpace: 'pre-wrap'
                }}>
                    {matchingTask.failure_reason}
                </div>
              )}
            </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default TDDStatusIndicator;
