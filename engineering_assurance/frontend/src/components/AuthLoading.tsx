import React from 'react';

const AuthLoading: React.FC = () => {
  return (
    <div style={{
      width: '100%',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'var(--bg-app, #0f172a)',
      color: 'var(--text-primary, #f8fafc)',
      fontFamily: "'Inter', sans-serif"
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px'
      }}>
        {/* Simple spinning neon ring */}
        <div style={{
          width: '50px',
          height: '50px',
          border: '3px solid rgba(59, 130, 246, 0.2)',
          borderTop: '3px solid #3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ margin: 0, fontWeight: 600, letterSpacing: '2px', color: '#3b82f6' }}>A.N.T PROTOCOL</h2>
          <p style={{ margin: '8px 0 0', color: 'var(--text-secondary, #94a3b8)', fontSize: '14px' }}>
            Initializing Authentication...
          </p>
        </div>
      </div>
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export default AuthLoading;
