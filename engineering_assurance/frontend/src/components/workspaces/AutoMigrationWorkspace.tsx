import React from 'react';
import MigrationWorkspace from '../MigrationWorkspace';

interface AutoMigrationWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const AutoMigrationWorkspace: React.FC<AutoMigrationWorkspaceProps> = ({ onInvoke, loading, telemetry, fullMeshState }) => {
  return (
    <MigrationWorkspace
      taskId={fullMeshState?.task_id || null}
      demoMode={!fullMeshState}
      migrationData={telemetry}
    />
  );
};

export default AutoMigrationWorkspace;
