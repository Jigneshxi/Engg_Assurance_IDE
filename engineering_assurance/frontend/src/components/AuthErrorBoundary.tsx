import React, { Component, ErrorInfo } from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class AuthErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Authentication Error Caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          width: '100%',
          minHeight: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'var(--bg-app, #0f172a)',
          color: 'var(--text-primary, #f8fafc)',
          fontFamily: "'Inter', sans-serif"
        }}>
          <div style={{
            background: 'var(--card-bg, rgba(30, 41, 59, 0.7))',
            backdropFilter: 'blur(20px)',
            borderRadius: '24px',
            padding: '40px',
            border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.1))',
            textAlign: 'center',
            maxWidth: '400px'
          }}>
            <h2 style={{ color: '#ef4444', marginBottom: '16px' }}>Authentication Service Unavailable</h2>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', marginBottom: '24px' }}>
              We could not connect to the authentication server. Please ensure the backend is running.
            </p>
            <button 
              onClick={() => window.location.reload()}
              style={{
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Retry Connection
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AuthErrorBoundary;
