import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
    this.setState({ error, errorInfo });
    try {
      fetch('http://localhost:3001/api/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack
        })
      }).catch(() => {});
    } catch (_) {}
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: '#0f172a',
          color: '#f8fafc',
          padding: '40px',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            maxWidth: '800px',
            margin: '0 auto',
            background: '#1e293b',
            border: '1px solid #ef4444',
            borderRadius: '8px',
            padding: '24px'
          }}>
            <h1 style={{ color: '#ef4444', fontSize: '20px', marginBottom: '16px' }}>
              ⚠️ Application Render Error
            </h1>
            <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
              The application encountered an error while rendering:
            </p>
            <pre style={{
              background: '#090d16',
              padding: '16px',
              borderRadius: '6px',
              color: '#fca5a5',
              overflowX: 'auto',
              fontSize: '13px'
            }}>
              {this.state.error?.toString()}
              {'\n\n'}
              {this.state.error?.stack}
            </pre>
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              style={{
                marginTop: '20px',
                padding: '10px 20px',
                background: '#6366f1',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Clear Local Storage & Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
