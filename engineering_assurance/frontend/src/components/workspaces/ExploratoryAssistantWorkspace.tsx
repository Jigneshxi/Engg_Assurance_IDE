import React from 'react';
import WorkspaceShell, { WorkspaceEmptyState } from './WorkspaceShell';

interface ExploratoryAssistantWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const ExploratoryAssistantWorkspace: React.FC<ExploratoryAssistantWorkspaceProps> = ({ onInvoke, loading, telemetry }) => {
  const hasData = !!telemetry;

  return (
    <WorkspaceShell
      agentId="#48"
      agentName="Exploratory Test Assistant"
      agentModel="Llama-3.3-70b"
      agentIcon="ti-signal"
      invokeLabel="Refresh Analysis"
      loadingLabel="Processing..."
      onInvoke={() => onInvoke('Execute Exploratory Test Assistant analysis using the current mesh execution state.')}
      loading={loading}
      hasData={hasData}
      emptyStateMessage="Refresh Analysis to populate exploratory test data"
    >
      <div className="animate-fadeIn">
        {hasData ? (
          <pre style={{ margin: 0, padding: '20px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.8rem', color: '#334155', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {typeof telemetry === 'string' ? telemetry : JSON.stringify(telemetry, null, 2)}
          </pre>
        ) : (
          <WorkspaceEmptyState message="Refresh Analysis to populate exploratory test data" />
        )}
      </div>
    </WorkspaceShell>
  );
};

export default ExploratoryAssistantWorkspace;
