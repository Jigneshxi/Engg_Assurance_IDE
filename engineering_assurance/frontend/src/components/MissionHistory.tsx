import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';

interface Mission {
  id: number;
  correlation_id: string;
  mission_name: string;
  status: string;
  execution_depth: string;
  created_at: string;
  total_agents: number;
  completed_agents: number;
  failed_agents: number;
  total_executions: number;
  unique_agents: number;
  duration_ms?: number;
}

const MissionHistory: React.FC = () => {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [toolExecutions, setToolExecutions] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [page, setPage] = useState(1);

  const fetchMissions = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(`/missions?page=${page}&page_size=20`);
      setMissions(res.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch missions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMissions();
  }, [page]);

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this mission?')) return;
    try {
      await apiClient.delete(`/missions/${id}`);
      fetchMissions();
    } catch (err) {
      console.error(err);
      alert('Failed to delete mission');
    }
  };

  const openMissionDetails = async (mission: Mission) => {
    setSelectedMission(mission);
    setLoadingDetails(true);
    setArtifacts([]);
    setEvents([]);
    setToolExecutions([]);
    
    try {
      const [eventsRes, artifactsRes, toolsRes] = await Promise.all([
        apiClient.get(`/missions/${mission.id}/events`).catch(() => []),
        apiClient.get(`/missions/${mission.id}/artifacts`).catch(() => []),
        apiClient.get(`/missions/${mission.id}/tool-executions`).catch(() => [])
      ]);
      setEvents(eventsRes || []);
      setArtifacts(artifactsRes || []);
      setToolExecutions(toolsRes || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleDownloadArtifact = (artifact: any) => {
    const content = artifact.artifact_content || JSON.stringify(artifact.artifact_json, null, 2) || "{}";
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.artifact_type}_${artifact.agent_name}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RUNNING': return '#3b82f6';
      case 'COMPLETED': return '#10b981';
      case 'FAILED': return '#ef4444';
      case 'CANCELLED': return '#9ca3af';
      default: return '#eab308';
    }
  };

  return (
    <div className="mission-history" style={{ padding: '20px', color: '#f8fafc' }}>
      <h2>Mission History</h2>
      {error && <div style={{ color: '#ef4444', marginBottom: '16px' }}>{error}</div>}
      
      {loading ? (
        <div>Loading missions...</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #334155', textAlign: 'left' }}>
              <th style={{ padding: '12px 8px' }}>Mission Name</th>
              <th style={{ padding: '12px 8px' }}>Status</th>
              <th style={{ padding: '12px 8px' }}>Depth</th>
              <th style={{ padding: '12px 8px' }}>Agents Executed</th>
              <th style={{ padding: '12px 8px' }}>Created At</th>
              <th style={{ padding: '12px 8px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {missions.map((m) => (
              <tr key={m.id} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={{ padding: '12px 8px', fontWeight: 500 }}>{m.mission_name}</td>
                <td style={{ padding: '12px 8px' }}>
                  <span style={{ 
                    color: getStatusColor(m.status), 
                    padding: '4px 8px', 
                    borderRadius: '12px',
                    background: `${getStatusColor(m.status)}20`,
                    fontSize: '0.8rem',
                    fontWeight: 600
                  }}>
                    {m.status}
                  </span>
                </td>
                <td style={{ padding: '12px 8px' }}>{m.execution_depth}</td>
                <td style={{ padding: '12px 8px' }}>
                  {m.completed_agents} / {m.total_agents} completed
                </td>
                <td style={{ padding: '12px 8px' }}>{new Date(m.created_at).toLocaleString()}</td>
                <td style={{ padding: '12px 8px', display: 'flex', gap: '8px' }}>
                  <button onClick={() => openMissionDetails(m)} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>View</button>
                  <button onClick={() => handleDelete(m.id)} style={{ background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selectedMission && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#0f172a', width: '80%', height: '80%', borderRadius: '12px', padding: '24px', overflowY: 'auto', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2>{selectedMission.mission_name} - Details</h2>
              <button onClick={() => setSelectedMission(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px' }}>
              <div>
                <h3>Agent Timeline</h3>
                {loadingDetails ? (
                  <p>Loading events...</p>
                ) : (
                  <div style={{ maxHeight: '400px', overflowY: 'auto', background: '#1e293b', padding: '12px', borderRadius: '8px' }}>
                    {events.map((e, i) => (
                      <div key={i} style={{ marginBottom: '8px', fontSize: '0.9rem' }}>
                        <span style={{ color: e.severity === 'ERROR' ? '#ef4444' : e.severity === 'WARNING' ? '#eab308' : '#3b82f6', marginRight: '8px' }}>
                          [{new Date(e.created_at).toLocaleTimeString()}]
                        </span>
                        <span>{e.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3>Tool Executions</h3>
                {loadingDetails ? (
                  <p>Loading tools...</p>
                ) : (
                  <div style={{ maxHeight: '400px', overflowY: 'auto', background: '#1e293b', padding: '12px', borderRadius: '8px' }}>
                    {Object.entries(
                      toolExecutions.reduce((acc, t) => {
                        if (!acc[t.agent_name]) acc[t.agent_name] = [];
                        acc[t.agent_name].push(t);
                        return acc;
                      }, {} as Record<string, any[]>)
                    ).map(([agent, tools]: [string, any]) => {
                      const passed = tools.filter((t: any) => t.status === 'success').length;
                      const total = tools.length;
                      const score = total > 0 ? Math.round((passed / total) * 100) : 0;
                      return (
                        <div key={agent} style={{ marginBottom: '16px', background: '#0f172a', padding: '12px', borderRadius: '8px', border: '1px solid #334155' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <strong style={{ color: '#38bdf8' }}>{agent}</strong>
                            <span style={{ color: score === 100 ? '#10b981' : score >= 50 ? '#eab308' : '#ef4444', fontSize: '0.9rem', fontWeight: 'bold' }}>
                              Health: {score}% ({passed}/{total})
                            </span>
                          </div>
                          {tools.map((t: any, i: number) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: i < tools.length - 1 ? '1px solid #1e293b' : 'none', fontSize: '0.85rem' }}>
                              <span>
                                {t.status === 'success' ? '🟢 ' : '🔴 '}
                                {t.tool_name}
                              </span>
                              <span style={{ color: '#94a3b8' }}>
                                {t.status === 'success' ? 'PASS' : 'FAIL'} • {t.duration_ms}ms
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                    {toolExecutions.length === 0 && <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>No deterministic tools executed.</p>}
                  </div>
                )}
              </div>
              
              <div>
                <h3>Artifacts Generated</h3>
                {loadingDetails ? (
                  <p>Loading artifacts...</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {artifacts.map((a, i) => (
                      <div key={i} style={{ background: '#1e293b', padding: '12px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{a.artifact_type}</div>
                          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Agent: {a.agent_name} | Size: {(a.artifact_size / 1024).toFixed(2)} KB</div>
                        </div>
                        <button onClick={() => handleDownloadArtifact(a)} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>Download</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MissionHistory;
