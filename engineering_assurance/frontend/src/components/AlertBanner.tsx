import React from 'react';

export type AlertSeverity = 'high' | 'medium' | 'low' | 'info';

interface AlertBannerProps {
  severity: AlertSeverity;
  title: string;
  children: React.ReactNode;
}

const severityConfig: Record<AlertSeverity, { bg: string, border: string, icon: string, text: string }> = {
  high: {
    bg: 'rgba(239, 68, 68, 0.1)',
    border: '#ef4444',
    icon: '🚨',
    text: '#fca5a5'
  },
  medium: {
    bg: 'rgba(245, 158, 11, 0.1)',
    border: '#f59e0b',
    icon: '⚠️',
    text: '#fcd34d'
  },
  low: {
    bg: 'rgba(16, 185, 129, 0.1)',
    border: '#10b981',
    icon: '✅',
    text: '#6ee7b7'
  },
  info: {
    bg: 'rgba(59, 130, 246, 0.1)',
    border: '#3b82f6',
    icon: 'ℹ️',
    text: '#93c5fd'
  }
};

export const AlertBanner: React.FC<AlertBannerProps> = ({ severity, title, children }) => {
  const config = severityConfig[severity];

  return (
    <div style={{
      padding: '16px 20px',
      borderRadius: '12px',
      background: config.bg,
      border: `1px solid ${config.border}`,
      marginBottom: '16px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '8px'
      }}>
        <span style={{ fontSize: '1.2rem' }}>{config.icon}</span>
        <h4 style={{
          margin: 0,
          color: config.text,
          fontSize: '0.9rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          {title}
        </h4>
      </div>
      <div style={{
        fontSize: '0.85rem',
        color: '#e2e8f0',
        lineHeight: 1.5,
        fontFamily: 'monospace',
        whiteSpace: 'pre-wrap'
      }}>
        {children}
      </div>
    </div>
  );
};
