import React from 'react';

interface Pillar5PanelProps {
  traceabilityAudit: Record<string, any>;
  cryptographicPassport: Record<string, any>;
}

const Pillar5Panel: React.FC<Pillar5PanelProps> = ({ traceabilityAudit, cryptographicPassport }) => {
  if (!traceabilityAudit && !cryptographicPassport) return null;

  // Derive the hash entries from passport fields for display
  const hashEntries: Record<string, string> = {};
  if (cryptographicPassport) {
    if (cryptographicPassport.signatures) {
      // Legacy format
      Object.assign(hashEntries, cryptographicPassport.signatures);
    } else {
      // V2 format from Phase 5 passport_generation_node
      if (cryptographicPassport.phase1_hash) hashEntries['Phase 1 (Requirements)'] = cryptographicPassport.phase1_hash;
      if (cryptographicPassport.api_spec_hash) hashEntries['Phase 2 (API Spec)'] = cryptographicPassport.api_spec_hash;
      if (cryptographicPassport.forge_code_hash) hashEntries['Phase 3 (Forge Code)'] = cryptographicPassport.forge_code_hash;
      if (cryptographicPassport.phase4_hash) hashEntries['Phase 4 (NFR Audits)'] = cryptographicPassport.phase4_hash;
      if (cryptographicPassport.signature) hashEntries['Passport Signature'] = cryptographicPassport.signature;
    }
  }

  const isCleared = cryptographicPassport?.compliance_checks_passed || cryptographicPassport?.cleared_for_release || false;

  return (
    <div style={{ background: '#1e293b', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid #334155' }}>
      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '16px' }}>Pillar 5: Traceability & Cryptographic Passport</h3>
      
      {/* Traceability Audit */}
      {traceabilityAudit && (
        <div style={{ background: '#0f172a', borderRadius: '6px', padding: '12px', border: '1px solid #1e293b', marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ fontWeight: 500, color: '#cbd5e1', margin: 0 }}>End-to-End Traceability Audit</h4>
            <span style={{
              padding: '4px 8px', fontSize: '12px', fontWeight: 700, color: 'white', borderRadius: '4px',
              background: traceabilityAudit.passed || traceabilityAudit.complete ? '#059669' : '#dc2626'
            }}>
              {traceabilityAudit.passed || traceabilityAudit.complete ? 'PASSED' : 'GAPS DETECTED'}
            </span>
          </div>
          {traceabilityAudit.traced !== undefined && (
            <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>
              {traceabilityAudit.traced}/{traceabilityAudit.total_capabilities} capabilities traced
            </div>
          )}
          {!(traceabilityAudit.passed || traceabilityAudit.complete) && traceabilityAudit.gaps && traceabilityAudit.gaps.length > 0 && (
            <div style={{ marginTop: '8px', fontSize: '13px', color: '#fca5a5' }}>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {traceabilityAudit.gaps.map((gap: string, idx: number) => (
                  <li key={idx}>{gap}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Cryptographic Passport */}
      {cryptographicPassport && (
        <div style={{ background: '#0f172a', borderRadius: '6px', padding: '12px', border: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ fontWeight: 500, color: '#cbd5e1', margin: 0 }}>Cryptographic Passport</h4>
            <span style={{
              padding: '4px 8px', fontSize: '12px', fontWeight: 700, color: 'white', borderRadius: '4px',
              background: isCleared ? '#059669' : '#dc2626'
            }}>
              {isCleared ? 'CLEARED FOR RELEASE' : 'BLOCKED'}
            </span>
          </div>
          
          <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>
            <strong>Passport ID:</strong> {cryptographicPassport.passport_id || 'N/A'} &nbsp;|&nbsp;
            <strong>Issued At:</strong> {cryptographicPassport.issued_at ? new Date(cryptographicPassport.issued_at).toLocaleString() : 'N/A'}
          </div>

          {Object.keys(hashEntries).length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '13px', textAlign: 'left', color: '#94a3b8' }}>
                <thead>
                  <tr style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', background: '#1e293b' }}>
                    <th style={{ padding: '4px 8px' }}>Artifact</th>
                    <th style={{ padding: '4px 8px' }}>SHA-256 Hash Signature</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(hashEntries).map(([key, hash], idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '4px 8px', fontFamily: 'monospace', fontSize: '12px' }}>{key}</td>
                      <td style={{ padding: '4px 8px', fontFamily: 'monospace', fontSize: '12px', color: '#6ee7b7', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={hash as string}>
                        {hash as string}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Pillar5Panel;
