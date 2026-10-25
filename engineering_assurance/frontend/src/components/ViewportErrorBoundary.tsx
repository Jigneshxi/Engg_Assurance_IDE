import React from 'react';

type ViewportErrorBoundaryProps = {
  children: React.ReactNode;
  onReset?: () => void;
  activeView?: string;
};

type ViewportErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string;
};

class ViewportErrorBoundary extends React.Component<
  ViewportErrorBoundaryProps,
  ViewportErrorBoundaryState
> {
  constructor(props: ViewportErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ViewportErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unknown viewport failure',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ViewportErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '55vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px',
            textAlign: 'center',
            borderRadius: '24px',
            background: 'linear-gradient(135deg, rgba(15,23,42,0.92), rgba(30,41,59,0.92))',
            border: '1px solid rgba(148,163,184,0.18)',
            color: '#e2e8f0',
          }}
        >
          <div style={{ maxWidth: '560px' }}>
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🛟</div>
            <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', fontWeight: 900 }}>
              Phase 2 viewport recovered
            </h2>
            <p style={{ margin: '0 0 18px', color: '#94a3b8', lineHeight: 1.6 }}>
              A workspace panel threw while rendering. The mission state is preserved, and we can safely return to a stable view.
            </p>
            <div style={{ fontSize: '0.78rem', color: '#fca5a5', marginBottom: '18px', wordBreak: 'break-word' }}>
              {this.state.errorMessage}
            </div>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                border: 'none',
                background: '#6366f1',
                color: 'white',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Restore Mission View
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ViewportErrorBoundary;
