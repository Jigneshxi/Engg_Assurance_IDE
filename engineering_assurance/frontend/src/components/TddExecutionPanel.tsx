import React, { useEffect, useState, useRef } from 'react';
import { API_BASE } from '../config';

interface TddExecutionPanelProps {
    missionId: string;
}

const FileTree = ({ missionId }: { missionId: string }) => {
    const [files, setFiles] = useState<string[]>([]);
    
    useEffect(() => {
        if (!missionId) return;
        fetch(`${API_BASE}/api/missions/${missionId}/codebase-files`)
            .then(r => r.json())
            .then(data => setFiles(data.files || []))
            .catch(e => console.error("Failed to fetch codebase files:", e));
    }, [missionId]);
    
    if (files.length === 0) return null;

    return (
        <div style={{
            padding: '12px 16px',
            background: '#0f172a',
            borderBottom: '1px solid #1e293b',
            fontSize: '0.75rem',
            fontFamily: 'monospace',
            maxHeight: '150px',
            overflowY: 'auto'
        }}>
            <div style={{color: '#6366f1', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px'}}>
                <i className="ti-folder"></i> Codebase Files Generated
            </div>
            {files.map(f => (
                <div key={f} style={{color: '#94a3b8', padding: '2px 0', paddingLeft: '16px'}}>
                    <i className="ti-file" style={{marginRight: '6px', fontSize: '0.7rem'}}></i>
                    {f}
                </div>
            ))}
        </div>
    );
};

const TddExecutionPanel: React.FC<TddExecutionPanelProps> = ({ missionId }) => {
    const [logs, setLogs] = useState<string[]>([]);
    const logsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!missionId) return;

        const eventSource = new EventSource(`${API_BASE}/api/tools/mission/${missionId}/test-stream`);
        
        eventSource.onmessage = (event) => {
            const data = event.data;
            setLogs(prev => [...prev, data]);
        };

        eventSource.onerror = (err) => {
            console.error("SSE Error:", err);
            // Optionally set a log indicating connection error or just let it auto-reconnect
        };

        return () => {
            eventSource.close();
        };
    }, [missionId]);

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    return (
        <div style={{ marginTop: '24px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #1e293b' }}>
            <div style={{ background: '#0f172a', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <i className="ti-pulse" style={{ marginRight: '6px' }}></i>
                    TDD Execution Stream
                </span>
                <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700 }}>
                    Listening for watchdog events...
                </span>
            </div>
            
            <FileTree missionId={missionId} />

            <div style={{ 
                background: '#020617', 
                padding: '16px', 
                height: '240px', 
                overflowY: 'auto', 
                fontFamily: 'monospace', 
                fontSize: '0.8rem', 
                color: '#cbd5e1' 
            }}>
                {logs.length === 0 ? (
                    <div style={{ color: '#64748b', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="ti-eye"></i> Watchdog active. Save a file to trigger TDD pipeline.
                    </div>
                ) : (
                    logs.map((log, i) => {
                        let color = '#cbd5e1';
                        if (log.includes('[ERROR]') || log.includes('failed')) color = '#ef4444';
                        if (log.includes('[INFO]')) color = '#60a5fa';
                        if (log.includes('[PROCESS_EXIT_CODE] 0') || log.includes('verified')) color = '#10b981';
                        if (log.includes('Process exited with code: 1')) color = '#ef4444';
                        
                        return (
                            <div key={i} style={{ whiteSpace: 'pre-wrap', marginBottom: '4px', color }}>
                                {log}
                            </div>
                        );
                    })
                )}
                <div ref={logsEndRef} />
            </div>
        </div>
    );
};

export default TddExecutionPanel;
