import React, { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../config';

interface ExecutionPanelProps {
    missionId?: string;
}

const ExecutionPanel: React.FC<ExecutionPanelProps> = ({ missionId }) => {
    const [commandKey, setCommandKey] = useState<string>('pytest');
    const [logs, setLogs] = useState<string[]>([]);
    const [isRunning, setIsRunning] = useState<boolean>(false);
    const [exitCode, setExitCode] = useState<number | null>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);

    const executeSandbox = async () => {
        setIsRunning(true);
        setLogs([]);
        setExitCode(null);

        try {
            const response = await fetch(`${API_BASE}/api/tools/execute-sandbox`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    command_key: commandKey,
                    mission_id: missionId || '',
                    test_paths: missionId
                        ? [`workspace/missions/${missionId}/handoff-bundle/tests/`]
                        : []
                }),
            });

            if (!response.body) {
                setLogs(prev => [...prev, '[ERROR] No response body.']);
                setIsRunning(false);
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data.startsWith('[PROCESS_EXIT_CODE]')) {
                            const code = parseInt(data.replace('[PROCESS_EXIT_CODE]', '').trim(), 10);
                            setExitCode(code);
                        } else {
                            setLogs(prev => [...prev, data]);
                        }
                    }
                }
            }
        } catch (err: any) {
            setLogs(prev => [...prev, `[ERROR] ${err.message}`]);
        } finally {
            setIsRunning(false);
        }
    };

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    return (
        <div style={{ marginBottom: '32px', border: '1px solid #1e293b', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ background: '#0f172a', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#e2e8f0', textTransform: 'uppercase' }}>
                    <i className="ti-server" style={{ color: '#10b981', marginRight: '8px' }}></i>
                    Sandbox Execution Environment
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                        value={commandKey}
                        onChange={(e) => setCommandKey(e.target.value)}
                        disabled={isRunning}
                        style={{ padding: '6px 12px', borderRadius: '6px', background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155' }}
                    >
                        <option value="pytest">Run PyTest</option>
                        <option value="npm_test">Run NPM Test</option>
                        <option value="playwright">Run Playwright E2E</option>
                        <option value="k6">Run k6 Load Test</option>
                    </select>
                    <button
                        onClick={executeSandbox}
                        disabled={isRunning}
                        style={{
                            padding: '8px 20px',
                            borderRadius: '8px',
                            background: isRunning ? '#334155' : 'linear-gradient(90deg, #10b981, #059669)',
                            color: 'white',
                            border: 'none',
                            cursor: isRunning ? 'not-allowed' : 'pointer',
                            fontWeight: 800,
                            position: 'relative',
                            overflow: 'hidden',
                            boxShadow: isRunning ? 'none' : '0 4px 14px 0 rgba(16, 185, 129, 0.39)',
                            transition: 'all 0.2s ease',
                            transform: isRunning ? 'scale(0.98)' : 'scale(1)'
                        }}
                        onMouseDown={(e) => { if (!isRunning) e.currentTarget.style.transform = 'scale(0.95)'; }}
                        onMouseUp={(e) => { if (!isRunning) e.currentTarget.style.transform = 'scale(1)'; }}
                        onMouseLeave={(e) => { if (!isRunning) e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                        {isRunning && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite linear' }}></div>}
                        <span style={{ position: 'relative', zIndex: 1 }}>{isRunning ? 'Executing...' : 'Run Sandbox'}</span>
                    </button>
                </div>
            </div>
            
            <div style={{ background: '#020617', padding: '16px', height: '300px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.8rem', color: '#34d399' }}>
                {logs.length === 0 && !isRunning && <span style={{ color: '#64748b' }}>Waiting for execution...</span>}
                {logs.map((log, i) => (
                    <div key={i} style={{ whiteSpace: 'pre-wrap', marginBottom: '2px' }}>{log}</div>
                ))}
                <div ref={logsEndRef} />
            </div>
            
            {exitCode !== null && (
                <div style={{ background: exitCode === 0 ? '#064e3b' : '#7f1d1d', padding: '12px 16px', fontSize: '0.8rem', color: 'white', fontWeight: 700 }}>
                    Process exited with code: {exitCode}
                </div>
            )}
            <style>{`
                @keyframes shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
            `}</style>
        </div>
    );
};

export default ExecutionPanel;
