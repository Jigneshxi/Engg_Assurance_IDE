/**
 * ================================================================================
 * SeQuor AGENT MESH — API CODER SPECIALIST WORKSPACE
 * ================================================================================
 */

import React, { useState } from 'react';
import WorkspaceShell, { WorkspaceEmptyState } from './WorkspaceShell';

interface ApiCoderWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const ApiCoderWorkspace: React.FC<ApiCoderWorkspaceProps> = ({ onInvoke, loading, telemetry }) => {
  const [activeTab, setActiveTab] = useState<'snippets' | 'assertions' | 'payloads'>('snippets');

  const liveData = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      return parsed.code || parsed.script || parsed.snippet || (typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2));
    } catch {
      return String(telemetry);
    }
  }, [telemetry]);

  const liveSnippets = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const list = parsed.scripts || parsed.snippets || parsed.code_files || (Array.isArray(parsed) ? parsed : null);
      if (Array.isArray(list)) return list;
      return null;
    } catch { return null; }
  }, [telemetry]);

  const TABS = [
    { id: 'snippets',   label: 'API Snippets',    icon: 'ti-server' },
    { id: 'assertions', label: 'Assertions Map',  icon: 'ti-check-box' },
    { id: 'payloads',   label: 'Dynamic Payloads', icon: 'ti-package' },
  ];

  return (
    <WorkspaceShell
      nodeKey="api_coder"
      loading={loading}
      onInvoke={onInvoke}
    >
      <div className="ac-content">
          {activeTab === 'snippets' && (
            <div className="ac-snippets-panel">
              <div className="ac-section-header">
                <h3>Synthesized Script View</h3>
                <div className="ac-lang-badge">TypeScript / RestAssured</div>
              </div>
              <div className="ac-editor-window">
                <div className="ac-editor-sidebar">
                  {liveSnippets ? liveSnippets.map((s: any, i: number) => (
                    <div key={i} className={`item ${i === 0 ? 'active' : ''}`}>{s.name || s.title || `Snippet ${i+1}`}</div>
                  )) : (
                    <>
                      <div className="item active">Auth Contract Test</div>
                      <div className="item">Read Resource</div>
                      <div className="item">Submit Payload</div>
                    </>
                  )}
                </div>
                <div className="ac-editor-main">
                  <pre className="ac-code">
{liveData ? liveData : `import { test, expect } from '@playwright/test';

test('verify api token generation', async ({ request }) => {
  const response = await request.post('/api/v1/auth/token', {
    data: {
      username: '<redacted-user>',
      password: '<redacted-password>'
    }
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.token).toBeDefined();
});`}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'assertions' && (
            <div className="ac-assertions-grid">
              <div className="ac-assertion-card">
                <span className="type">Schema Validation</span>
                <p>Ensure JSON response matches the required API schema contract</p>
                <div className="toggle on"></div>
              </div>
              <div className="ac-assertion-card">
                <span className="type">Latency Guard</span>
                <p>Assert response time is &lt; 500ms</p>
                <div className="toggle on"></div>
              </div>
              <div className="ac-assertion-card">
                <span className="type">HATEOAS Linkage</span>
                <p>Verify presence of next-page links in pagination</p>
                <div className="toggle off"></div>
              </div>
            </div>
          )}

          {activeTab === 'payloads' && (
            <div className="ac-payloads-panel">
              <div className="ac-payload-item">
                <div className="info">
                  <span className="name">Token Request Payload</span>
                  <span className="method">POST</span>
                </div>
                <div className="preview"><code>{"{ \"user\": \"{{RAND_USER}}\", \"pass\": \"***\" }"}</code></div>
              </div>
              <div className="ac-payload-item">
                <div className="info">
                  <span className="name">Product Filter</span>
                  <span className="method">GET</span>
                </div>
                <div className="preview"><code>{"?search={{RAND_PRODUCT}}&limit=10"}</code></div>
              </div>
            </div>
          )}
        </div>

        <style>{`
          .ac-content { flex: 1; padding: 10px 0; }
          .ac-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
          .ac-section-header h3 { font-size: 1rem; color: #1e293b; margin: 0; }
          .ac-lang-badge { font-size: 0.75rem; font-weight: 700; color: #6366f1; background: rgba(99, 102, 241, 0.1); padding: 4px 12px; border-radius: 20px; }
          .ac-editor-window { display: flex; height: 350px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
          .ac-editor-sidebar { width: 180px; background: #f8fafc; border-right: 1px solid #e2e8f0; }
          .ac-editor-sidebar .item { padding: 12px 15px; font-size: 0.8rem; font-weight: 500; color: #64748b; border-bottom: 1px solid #f1f5f9; cursor: pointer; }
          .ac-editor-sidebar .item.active { background: #fff; color: #6366f1; border-left: 3px solid #6366f1; font-weight: 700; }
          .ac-editor-main { flex: 1; background: #fafafa; overflow: auto; }
          .ac-code { margin: 0; padding: 20px; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; color: #1e293b; }
          .ac-assertions-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
          .ac-assertion-card { padding: 15px; border-radius: 10px; border: 1px solid #e2e8f0; background: #fff; position: relative; }
          .ac-assertion-card .type { font-size: 0.7rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; display: block; margin-bottom: 5px; }
          .ac-assertion-card p { font-size: 0.85rem; font-weight: 500; color: #334155; margin: 0; }
          .ac-assertion-card .toggle { position: absolute; top: 15px; right: 15px; width: 30px; height: 16px; border-radius: 10px; cursor: pointer; }
          .ac-assertion-card .toggle.on { background: #10b981; }
          .ac-assertion-card .toggle.off { background: #cbd5e1; }
          .ac-payloads-panel { display: flex; flex-direction: column; gap: 15px; }
          .ac-payload-item { padding: 15px; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0; }
          .ac-payload-item .info { display: flex; justify-content: space-between; margin-bottom: 10px; }
          .ac-payload-item .name { font-size: 0.85rem; font-weight: 700; color: #1e293b; }
          .ac-payload-item .method { font-size: 0.7rem; font-weight: 900; color: #15803d; background: #dcfce7; padding: 2px 6px; border-radius: 4px; }
          .ac-payload-item .preview { font-family: monospace; font-size: 0.8rem; color: #64748b; background: #fff; padding: 8px; border-radius: 4px; border: 1px solid #e2e8f0; }
        `}</style>
    </WorkspaceShell>
  );
};

export default ApiCoderWorkspace;
