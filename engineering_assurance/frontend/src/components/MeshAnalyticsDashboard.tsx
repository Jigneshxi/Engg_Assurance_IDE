import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';

interface ToolMetric {
  tool_name: string;
  runs: number;
  availability: number;
  pass_rate: number;
  fail_rate: number;
  skipped: number;
}

interface AgentMetric {
  agent_name: string;
  missions_run: number;
  tools_executed: number;
  success_rate: number;
  avg_duration_ms: number;
}

interface MissionAnalytics {
  missions_today: number;
  completed: number;
  failed: number;
  running: number;
  average_duration: string;
}

const AnimatedCounter: React.FC<{ value: number }> = ({ value }) => {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    let start = 0;
    const end = value;
    if (start === end) {
      setCount(end);
      return;
    }
    
    let totalMiliseconds = 1000;
    let incrementTime = (totalMiliseconds / end);
    
    let timer = setInterval(() => {
      start += 1;
      setCount(start);
      if (start === end) clearInterval(timer);
    }, incrementTime);
    
    return () => clearInterval(timer);
  }, [value]);
  
  return <span>{count}</span>;
};

const MeshAnalyticsDashboard: React.FC = () => {
  const [tools, setTools] = useState<ToolMetric[]>([]);
  const [agents, setAgents] = useState<AgentMetric[]>([]);
  const [missionStats, setMissionStats] = useState<MissionAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [toolsData, agentsData, missionData] = await Promise.all([
          apiClient.get('/api/missions/metrics/tools'),
          apiClient.get('/api/missions/metrics/agents'),
          apiClient.get('/api/missions/metrics/analytics')
        ]);
        setTools(toolsData || []);
        setAgents(agentsData || []);
        setMissionStats(missionData || null);
      } catch (e) {
        console.error("Failed to fetch analytics", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    // Poll every 10 seconds
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !missionStats) {
    return <div style={{ color: '#94a3b8', padding: '20px' }}>Loading analytics...</div>;
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    return `${s}s`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* 1. Mission Analytics */}
      <div style={{ background: 'rgba(15,23,42,0.3)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#f1f5f9', fontSize: '1.1rem' }}><i className="ti-bar-chart" /> Mission Analytics</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
          {[
            { label: 'Missions Today', value: missionStats?.missions_today || 0, color: '#3b82f6' },
            { label: 'Completed', value: missionStats?.completed || 0, color: '#10b981' },
            { label: 'Failed', value: missionStats?.failed || 0, color: '#ef4444' },
            { label: 'Running', value: missionStats?.running || 0, color: '#f59e0b' },
            { label: 'Avg Duration', value: missionStats?.average_duration || '0s', color: '#8b5cf6' }
          ].map((stat, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.03)' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>{stat.label}</div>
              <div style={{ color: stat.color, fontSize: '1.8rem', fontWeight: 900 }}>
                {typeof stat.value === 'number' ? <AnimatedCounter value={stat.value} /> : stat.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* 2. Agent Analytics */}
        <div style={{ background: 'rgba(15,23,42,0.3)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 style={{ margin: '0 0 16px 0', color: '#f1f5f9', fontSize: '1.1rem' }}><i className="ti-crown" /> Agent Analytics (Health & Utilization)</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                <th style={{ padding: '8px 4px' }}>Agent</th>
                <th style={{ padding: '8px 4px' }}>Health Score</th>
                <th style={{ padding: '8px 4px' }}>Runs</th>
                <th style={{ padding: '8px 4px' }}>Success %</th>
                <th style={{ padding: '8px 4px' }}>Avg Duration</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                  <td style={{ padding: '12px 4px', color: '#f1f5f9', fontWeight: 600 }}>{a.agent_name}</td>
                  <td style={{ padding: '12px 4px', color: (a as any).health_score >= 90 ? '#10b981' : (a as any).health_score >= 80 ? '#f59e0b' : '#ef4444', fontWeight: 900 }}>{(a as any).health_score || 'N/A'}</td>
                  <td style={{ padding: '12px 4px', color: '#3b82f6' }}>{a.missions_run}</td>
                  <td style={{ padding: '12px 4px', color: a.success_rate >= 90 ? '#10b981' : '#f59e0b' }}>{a.success_rate.toFixed(1)}%</td>
                  <td style={{ padding: '12px 4px', color: '#94a3b8' }}>{formatDuration(a.avg_duration_ms)}</td>
                </tr>
              ))}
              {agents.length === 0 && <tr><td colSpan={5} style={{ padding: '16px 4px', color: '#64748b' }}>No agent metrics available.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* 3. Tool Analytics */}
        <div style={{ background: 'rgba(15,23,42,0.3)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 style={{ margin: '0 0 16px 0', color: '#f1f5f9', fontSize: '1.1rem' }}><i className="ti-settings" /> Tool Analytics (Failure Attribution)</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                <th style={{ padding: '8px 4px' }}>Agent</th>
                <th style={{ padding: '8px 4px' }}>Tool</th>
                <th style={{ padding: '8px 4px' }}>Runs</th>
                <th style={{ padding: '8px 4px' }}>Pass / Fail</th>
                <th style={{ padding: '8px 4px' }}>Availability</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((t, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                  <td style={{ padding: '12px 4px', color: '#818cf8', fontWeight: 600 }}>{(t as any).agent_name || 'System'}</td>
                  <td style={{ padding: '12px 4px', color: '#f1f5f9', fontWeight: 600 }}>{t.tool_name}</td>
                  <td style={{ padding: '12px 4px', color: '#3b82f6' }}>{t.runs}</td>
                  <td style={{ padding: '12px 4px' }}>
                    <span style={{ color: '#10b981' }}>{t.pass_rate}%</span>
                    <span style={{ color: '#475569', margin: '0 4px' }}>/</span>
                    <span style={{ color: '#ef4444' }}>{t.fail_rate}%</span>
                  </td>
                  <td style={{ padding: '12px 4px', color: '#10b981' }}>{t.availability}%</td>
                </tr>
              ))}
              {tools.length === 0 && <tr><td colSpan={5} style={{ padding: '16px 4px', color: '#64748b' }}>No tool metrics available.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MeshAnalyticsDashboard;
