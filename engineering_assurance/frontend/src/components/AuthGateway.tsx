import React, { useState } from 'react';
import Login from './Login';
import Register from './Register';

const AuthGateway: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  return (
    <div style={{
      width: '100%',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      color: 'var(--text-primary, #f8fafc)',
      fontFamily: "'Outfit', sans-serif",
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: '#020617',
    }}>
      {/* Background mesh — fixed behind all content, blur stays here */}
      <div className="mesh-bg-gradient" />

      {/* Background decorations matching the AI Mesh styling */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        left: '-10%',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(15,23,42,0) 70%)',
        borderRadius: '50%',
        pointerEvents: 'none'
      }}></div>
      
      <div style={{
        position: 'absolute',
        bottom: '-10%',
        right: '-5%',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, rgba(15,23,42,0) 70%)',
        borderRadius: '50%',
        pointerEvents: 'none'
      }}></div>

      <div style={{ textAlign: 'center', marginBottom: '32px', zIndex: 10 }}>
        <h1 style={{ margin: 0, fontSize: '32px', fontWeight: 700, letterSpacing: '1px', background: 'linear-gradient(90deg, #60a5fa, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          A.N.T PROTOCOL
        </h1>
        <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: '15px' }}>
          Intelligent Test Orchestration Mesh
        </p>
      </div>

      <div className="shadow-glass" style={{
        borderRadius: '24px',
        padding: '40px',
        zIndex: 10,
        display: 'flex',
        justifyContent: 'center',
        width: '100%',
        maxWidth: '400px',
        boxSizing: 'border-box'
      }}>
        {mode === 'login' ? (
          <Login onSwitchMode={() => setMode('register')} />
        ) : (
          <Register onSwitchMode={() => setMode('login')} />
        )}
      </div>
    </div>
  );
};

export default AuthGateway;
