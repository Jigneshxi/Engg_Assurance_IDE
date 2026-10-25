import React from 'react';
import { useAssetResolver } from '../hooks/useAssetResolver';
import {
  TelemetryResolution,
  getTelemetryAliases,
  hasTelemetryContent,
  normalizeMeshKey,
} from '../utils/meshTelemetry';

interface LiveMeshReportPanelProps {
  nodeKey: string;
  resolution: TelemetryResolution;
  fullMeshState?: any;
}

const labelize = (value: string) =>
  value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatScalar = (value: any) => {
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === 'string') return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  return String(value);
};

const LiveMeshReportPanel: React.FC<LiveMeshReportPanelProps> = ({
  nodeKey,
  resolution,
  fullMeshState,
}) => {
  const assets = useAssetResolver(fullMeshState);
  const telemetry = resolution.data;

  const primitiveEntries = React.useMemo(() => {
    if (!telemetry || typeof telemetry !== 'object' || Array.isArray(telemetry)) return [];

    return Object.entries(telemetry)
      .filter(([, value]) => {
        const valueType = typeof value;
        return value !== null && !Array.isArray(value) && valueType !== 'object';
      })
      .slice(0, 8);
  }, [telemetry]);

  const structuredEntries = React.useMemo(() => {
    if (!telemetry || typeof telemetry !== 'object' || Array.isArray(telemetry)) return [];

    return Object.entries(telemetry)
      .filter(([, value]) => value && (Array.isArray(value) || typeof value === 'object'))
      .slice(0, 6)
      .map(([key, value]) => ({
        key,
        descriptor: Array.isArray(value)
          ? `${value.length} item${value.length === 1 ? '' : 's'}`
          : `${Object.keys(value || {}).length} field${Object.keys(value || {}).length === 1 ? '' : 's'}`,
      }));
  }, [telemetry]);

  const relatedAssets = React.useMemo(() => {
    const allAssets = Object.entries(assets);
    if (allAssets.length === 0) return [];

    const aliases = getTelemetryAliases(nodeKey).map(normalizeMeshKey);
    const matchingAssets = allAssets.filter(([name]) => {
      const normalizedName = normalizeMeshKey(name);
      return aliases.some(
        (alias) =>
          normalizedName.includes(alias) ||
          alias.includes(normalizedName)
      );
    });

    return (matchingAssets.length > 0 ? matchingAssets : allAssets).slice(0, 4);
  }, [assets, nodeKey]);

  const rawPayload = React.useMemo(() => {
    if (!hasTelemetryContent(telemetry)) return null;

    if (typeof telemetry === 'string') return telemetry;

    try {
      return JSON.stringify(telemetry, null, 2);
    } catch {
      return String(telemetry);
    }
  }, [telemetry]);

  return (
    <div
      style={{
        marginTop: '18px',
        borderRadius: '12px',
        border: '1px solid #dbe4f0',
        background: '#ffffff',
        boxShadow: '0 8px 30px rgba(15, 23, 42, 0.04)',
      }}
    >
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '0.72rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 800,
              color: '#4338ca',
            }}
          >
            Live Mesh Report Parameters
          </div>
          <div style={{ marginTop: '4px', fontSize: '0.82rem', color: '#475569' }}>
            {hasTelemetryContent(telemetry)
              ? `${labelize(nodeKey)} is bound to ${resolution.sourcePath || resolution.source}.`
              : `${labelize(nodeKey)} has no resolved live payload yet.`}
          </div>
        </div>
        <div
          style={{
            padding: '5px 10px',
            borderRadius: '999px',
            fontSize: '0.68rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            color: hasTelemetryContent(telemetry) ? '#047857' : '#b45309',
            background: hasTelemetryContent(telemetry)
              ? 'rgba(16, 185, 129, 0.1)'
              : 'rgba(245, 158, 11, 0.12)',
            border: `1px solid ${
              hasTelemetryContent(telemetry)
                ? 'rgba(16, 185, 129, 0.2)'
                : 'rgba(245, 158, 11, 0.2)'
            }`,
          }}
        >
          {hasTelemetryContent(telemetry) ? 'Live Mesh Bound' : 'Awaiting Live Data'}
        </div>
      </div>

      <div style={{ padding: '16px' }}>
        {primitiveEntries.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{
                fontSize: '0.72rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#64748b',
                fontWeight: 800,
                marginBottom: '10px',
              }}
            >
              Parameter Snapshot
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '10px',
              }}
            >
              {primitiveEntries.map(([key, value]) => (
                <div
                  key={key}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.68rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: '#64748b',
                      fontWeight: 800,
                      marginBottom: '6px',
                    }}
                  >
                    {labelize(key)}
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                    {formatScalar(value)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {structuredEntries.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{
                fontSize: '0.72rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#64748b',
                fontWeight: 800,
                marginBottom: '10px',
              }}
            >
              Structured Sections
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {structuredEntries.map(({ key, descriptor }) => (
                <span
                  key={key}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '999px',
                    background: '#eef2ff',
                    color: '#4338ca',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    border: '1px solid #c7d2fe',
                  }}
                >
                  {labelize(key)}: {descriptor}
                </span>
              ))}
            </div>
          </div>
        )}

        {relatedAssets.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{
                fontSize: '0.72rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#64748b',
                fontWeight: 800,
                marginBottom: '10px',
              }}
            >
              Related Artifacts
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {relatedAssets.map(([name, url]) => (
                <a
                  key={name}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: '7px 11px',
                    borderRadius: '999px',
                    background: '#ecfeff',
                    color: '#0f766e',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    border: '1px solid #99f6e4',
                  }}
                >
                  {name}
                </a>
              ))}
            </div>
          </div>
        )}

        <div>
          {rawPayload && (
            <div
              style={{
                fontSize: '0.72rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#64748b',
                fontWeight: 800,
                marginBottom: '10px',
              }}
            >
              Raw Payload
            </div>
          )}
          <pre
            style={{
              margin: 0,
              padding: '14px',
              borderRadius: '10px',
              background: '#0f172a',
              color: rawPayload ? '#e2e8f0' : '#334155',
              fontSize: '0.74rem',
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '280px',
              overflow: 'auto',
            }}
          >
            {rawPayload || '// No live mesh payload resolved for this node yet.'}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default LiveMeshReportPanel;
