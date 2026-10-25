/**
 * ================================================================================
 * SeQuor AGENT MESH — AUTOMATION FORGE SPECIALIST WORKSPACE
 * ================================================================================
 */

import React, { useState } from 'react';
import WorkspaceShell, { WorkspaceEmptyState } from './WorkspaceShell';

interface AutomationForgeWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const AutomationForgeWorkspace: React.FC<AutomationForgeWorkspaceProps> = ({ onInvoke, loading, telemetry }) => {
  const [activeTab, setActiveTab] = useState<'scaffold' | 'framework' | 'config'>('config');

  const liveConfig = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      // Backend writes: config_files (array), bootstrap_commands (array), or raw string keys
      const raw = parsed.config ?? parsed.code ?? parsed.script ?? parsed.package_json ?? null;
      if (raw !== null) return typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
      // automation_bootstrap shape: config_files array + bootstrap_commands array
      const configFiles = parsed.config_files;
      const bootstrapCmds = parsed.bootstrap_commands;
      if (Array.isArray(configFiles) && configFiles.length > 0) {
        const lines = configFiles.map((f: any) =>
          `// ${f.filename ?? f.name ?? 'config'}\n${f.content_summary ?? f.content ?? ''}`
        );
        if (Array.isArray(bootstrapCmds) && bootstrapCmds.length > 0) {
          lines.push('\n// Bootstrap Commands:\n' + bootstrapCmds.join('\n'));
        }
        return lines.join('\n\n');
      }
      if (Array.isArray(bootstrapCmds) && bootstrapCmds.length > 0) {
        return '// Bootstrap Commands:\n' + bootstrapCmds.join('\n');
      }
      return null;
    } catch { return null; }
  }, [telemetry]);

  const liveScaffold = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const items = parsed.folder_hierarchy ?? parsed.scaffold ?? parsed.files ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(items) || items.length === 0) return null;
      return items.map((it: any) =>
        typeof it === 'string'
          ? { name: it, type: it.includes('.') ? 'file' : 'folder' }
          : { name: it.name ?? it.path ?? '—', type: it.type ?? (String(it.name ?? '').includes('.') ? 'file' : 'folder') }
      );
    } catch { return null; }
  }, [telemetry]);

  const liveFrameworks = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.frameworks ?? parsed.tools ?? (Array.isArray(parsed) ? parsed : null);
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.map((f: any) => ({
          name: f.name ?? f.framework ?? null,
          description: f.description ?? null,
          version: f.version ?? null,
          active: f.active ?? f.selected ?? true,
        }));
      }
      // automation_bootstrap shape: single "framework" string field
      if (parsed.framework && typeof parsed.framework === 'string') {
        return [{
          name: parsed.framework,
          description: parsed.bootstrap_commands
            ? `Bootstrap: ${(parsed.bootstrap_commands as string[]).join(' → ')}`
            : 'Automation framework configured',
          version: null,
          active: true,
        }];
      }
      return null;
    } catch { return null; }
  }, [telemetry]);

  const TABS = [
    { id: 'scaffold',  label: 'Project Scaffold',  icon: 'ti-folder' },
    { id: 'framework', label: 'Framework Config',  icon: 'ti-package' },
    { id: 'config',    label: 'Global Hooks',      icon: 'ti-settings' },
  ];

  return (
    <WorkspaceShell
      nodeKey="automation_forge"
      loading={loading}
      onInvoke={onInvoke}
    >
      <div className="af-content">
        {/* Tab navigation */}
        <div className="af-tab-bar">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`af-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
            >
              <i className={tab.icon}></i>
              {tab.label}
            </button>
          ))}
        </div>
          {activeTab === 'scaffold' && (
            <div className="af-scaffold-panel">
              <div className="af-section-header">
                <h3>Target Project Hierarchy</h3>
                <select className="af-lang-select">
                  <option>Playwright (TypeScript)</option>
                  <option>Cypress (JavaScript)</option>
                  <option>Selenium (C# / .NET)</option>
                  <option>PyTest (Python)</option>
                </select>
              </div>
              {liveScaffold ? (
                <div className="af-tree-viewer">
                  {liveScaffold.map((item, idx) => (
                    <div key={idx} className={`tree-item ${item.type}`}>
                      <i className={item.type === 'folder' ? 'ti-folder' : 'ti-file'}></i>
                      <span>{item.name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <WorkspaceEmptyState message="Forge a Project Scaffold to populate the file tree" icon="ti-folder" />
              )}
            </div>
          )}

          {activeTab === 'framework' && (
            <div className="af-framework-grid">
              {liveFrameworks ? (
                liveFrameworks.map((f, idx) => (
                  <div key={idx} className={`framework-card ${f.active ? 'active' : 'disabled'}`}>
                    <i className="ti-bolt"></i>
                    <h5>{f.name ?? '—'}</h5>
                    <p>{f.description ?? '—'}</p>
                    {f.version && <span className="version">{f.version}</span>}
                  </div>
                ))
              ) : (
                <div style={{ gridColumn: '1 / -1' }}>
                  <WorkspaceEmptyState message="Forge a Project Scaffold to populate framework data" icon="ti-package" />
                </div>
              )}
            </div>
          )}

          {activeTab === 'config' && (
            <div className="af-config-editor">
              <div className="af-editor-header">
                <span>Generated Configuration Output</span>
                <button>Edit Manual</button>
              </div>
              {liveConfig ? (
                <pre className="af-code">{liveConfig}</pre>
              ) : (
                <WorkspaceEmptyState message="Forge a Project Scaffold to generate configuration" icon="ti-settings" />
              )}
            </div>
          )}
        </div>

        <style>{`
          .af-content { flex: 1; padding: 10px 0; }
          .af-tab-bar { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 0; }
          .af-tab-btn { display: flex; align-items: center; gap: 6px; padding: 8px 16px; background: none; border: none; border-bottom: 2px solid transparent; font-size: 0.82rem; font-weight: 600; color: #64748b; cursor: pointer; transition: all 0.15s; margin-bottom: -1px; }
          .af-tab-btn:hover { color: #6366f1; }
          .af-tab-btn.active { color: #6366f1; border-bottom-color: #6366f1; }
          .af-tab-btn i { font-size: 0.9rem; }
          .af-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
          .af-section-header h3 { font-size: 1rem; color: #1e293b; margin: 0; }
          .af-lang-select { background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 6px; font-size: 0.85rem; color: #1e293b; font-weight: 600; outline: none; }
          .af-tree-viewer { background: #f1f5f9; padding: 25px; border-radius: 12px; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; color: #334155; }
          .tree-item { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
          .tree-item.root { font-weight: 800; color: #1e293b; }
          .tree-item.folder { margin-left: 20px; }
          .tree-item.file { margin-left: 40px; color: #6366f1; }
          .tree-item i { color: #94a3b8; }
          .af-framework-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; min-height: 120px; }
          .framework-card { padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; background: #fff; transition: all 0.2s; position: relative; }
          .framework-card.active { border-color: #6366f1; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.1); }
          .framework-card.disabled { opacity: 0.5; background: #f8fafc; cursor: not-allowed; }
          .framework-card i { font-size: 2rem; color: #6366f1; margin-bottom: 15px; display: block; }
          .framework-card h5 { margin: 0 0 5px; font-size: 1rem; color: #1e293b; }
          .framework-card p { font-size: 0.8rem; color: #64748b; margin: 0; line-height: 1.4; }
          .framework-card .version { position: absolute; top: 15px; right: 15px; font-size: 0.7rem; color: #94a3b8; font-weight: 700; }
          .af-config-editor { display: flex; flex-direction: column; background: #fafafa; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; min-height: 200px; }
          .af-editor-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; border-bottom: 1px solid #e2e8f0; background: #fff; }
          .af-editor-header span { font-size: 0.75rem; font-weight: 700; color: #94a3b8; }
          .af-editor-header button { background: none; border: 1px solid #e2e8f0; padding: 4px 10px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; color: #64748b; cursor: pointer; }
          .af-code { margin: 0; padding: 20px; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; color: #1e293b; overflow-y: auto; white-space: pre-wrap; word-break: break-word; }
        `}</style>
    </WorkspaceShell>
  );
};

export default AutomationForgeWorkspace;
