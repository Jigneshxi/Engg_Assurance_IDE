import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Global Fetch Interceptor Fallback
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  let [resource, config] = args;
  
  if (typeof resource === 'string' && resource.includes('/api/')) {
    config = config || {};
    config.headers = config.headers || {};
    
    const authData = localStorage.getItem('auth_payload');
    if (authData) {
      try {
        const parsed = JSON.parse(authData);
        if (parsed.token) {
          (config.headers as any)['Authorization'] = 'Bearer ' + parsed.token;
        }
      } catch (e) {}
    }
  }
  
  const response = await originalFetch(resource, config);
  if (response.status === 401 && localStorage.getItem('auth_payload')) {
    localStorage.removeItem('auth_payload');
    window.location.reload();
  }
  return response;
};
