import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';
import { clearMissionState } from '../utils/sessionCleanup';

interface User {
  id: number;
  username: string;
  email: string;
  is_superuser: boolean;
  is_active: boolean;
}

interface AuthState {
  token: string | null;
  refresh_token?: string;
  user: User | null;
  auth_version: number;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (token: string, refreshToken: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CURRENT_AUTH_VERSION = 2; // Bump version to clear old cache

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // --- AUTH BYPASS INJECTION ---
  const MOCK_USER: User = {
    id: 1,
    username: 'Admin_Bypass',
    email: 'admin@local.host',
    is_superuser: true,
    is_active: true
  };
  const [user, setUser] = useState<User | null>(MOCK_USER);
  const [token, setToken] = useState<string | null>('mock-token-123');
  const [loading, setLoading] = useState<boolean>(false);

  // ORIGINAL CODE (Commented out for bypass):
  // const [user, setUser] = useState<User | null>(null);
  // const [token, setToken] = useState<string | null>(null);
  // const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const bootstrapAuth = async () => {
      // --- AUTH BYPASS ---
      // We are skipping the local storage check and API call to keep the MOCK_USER active.
      /*
      const stored = localStorage.getItem('auth_payload');
      if (stored) {
        try {
          const parsed: AuthState = JSON.parse(stored);
          if (parsed.auth_version === CURRENT_AUTH_VERSION && parsed.token && parsed.user) {
            // Optimistically load user to prevent flash
            setToken(parsed.token);
            setUser(parsed.user);
            setLoading(false); // UI can immediately render the dashboard
            
            // Background validation
            try {
              const freshUser = await apiClient.get('/auth/me');
              setUser(freshUser);
              
              // Refresh cache
              const newState: AuthState = {
                token: parsed.token,
                refresh_token: parsed.refresh_token,
                user: freshUser,
                auth_version: CURRENT_AUTH_VERSION
              };
              localStorage.setItem('auth_payload', JSON.stringify(newState));
            } catch (err) {
              // The apiClient interceptor already handles 401 (clears cache and reloads)
              console.error("Background auth validation failed", err);
            }
          } else {
            // Stale schema or missing fields, clear it out
            localStorage.removeItem('auth_payload');
            clearMissionState();
            setLoading(false);
          }
        } catch (e) {
          localStorage.removeItem('auth_payload');
          clearMissionState();
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
      */
    };
    
    bootstrapAuth();
  }, []);

  const login = (newToken: string, newRefreshToken: string, newUser: User) => {
    const payload: AuthState = {
      token: newToken,
      refresh_token: newRefreshToken,
      user: newUser,
      auth_version: CURRENT_AUTH_VERSION
    };
    localStorage.setItem('auth_payload', JSON.stringify(payload));
    setToken(newToken);
    setUser(newUser);
  };

  const logout = async () => {
    try {
      // Optional: notify backend
      const stored = localStorage.getItem('auth_payload');
      if (stored) {
        const parsed: AuthState = JSON.parse(stored);
        if (parsed.refresh_token) {
          await apiClient.post('/auth/logout', { refresh_token: parsed.refresh_token }).catch(() => {});
        }
      }
    } finally {
      localStorage.removeItem('auth_payload');
      clearMissionState();
      // --- AUTH BYPASS: Prevent logout from redirecting to login ---
      // setToken(null);
      // setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
