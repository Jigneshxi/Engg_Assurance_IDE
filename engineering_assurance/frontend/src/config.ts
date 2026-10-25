/**
 * ================================================================================
 * AEIAP SYSTEM ARCHITECTURE — GLOBAL SERVER CONFIGURATION
 * ================================================================================
 * This file centralizes network resolution to support multi-user access
 * across the team.
 */

const getApiBase = () => {
  // If we are in a browser environment, resolve API host relative to current viewport
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // Standardize localhost/127.0.0.1 to allow internal development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8585';
    }
    // Accessing via Network IP (e.g. 192.168.x.x)
    return `http://${hostname}:8585`;
  }
  return 'http://localhost:8585';
};

export const API_BASE = getApiBase();
export const WS_BASE = API_BASE.replace('http', 'ws');

console.log(`[AEIAP-CORE] Initializing Gateway Matrix: ${API_BASE}`);
