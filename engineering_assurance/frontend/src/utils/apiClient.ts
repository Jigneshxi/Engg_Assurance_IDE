// apiClient.ts
import { API_BASE } from '../config';
import { clearMissionState } from './sessionCleanup';
const BASE_URL = API_BASE;

class ApiClient {
  private isRefreshing = false;
  private refreshSubscribers: ((token: string) => void)[] = [];

  private onRefreshed(token: string) {
    this.refreshSubscribers.forEach(cb => cb(token));
    this.refreshSubscribers = [];
  }

  private addRefreshSubscriber(cb: (token: string) => void) {
    this.refreshSubscribers.push(cb);
  }

  private getAuthPayload() {
    const data = localStorage.getItem('auth_payload');
    if (data) {
      try {
        return JSON.parse(data);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  private getCookie(name: string): string | null {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
  }

  private getHeaders(tokenOverride?: string, isFormData = false): HeadersInit {
    const headers: Record<string, string> = {};
    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }
    
    if (tokenOverride) {
      headers['Authorization'] = `Bearer ${tokenOverride}`;
    } else {
      const parsed = this.getAuthPayload();
      if (parsed?.token) {
        headers['Authorization'] = `Bearer ${parsed.token}`;
      } else {
        // --- AUTH BYPASS ---
        headers['Authorization'] = `Bearer mock-token-123`;
      }
    }
    
    const csrfToken = this.getCookie('csrf_token');
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
    
    return headers;
  }

  private normalizeUrl(endpoint: string): string {
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    if (path.startsWith('/api/')) {
      return `${BASE_URL}${path}`;
    }
    return `${BASE_URL}/api${path}`;
  }

  private async fetchWithAuth(url: string, options: RequestInit): Promise<any> {
    options.credentials = 'include';
    const res = await fetch(url, options);
    
    if (res.status === 401) {
      const parsed = this.getAuthPayload();
      if (parsed && parsed.refresh_token) {
        if (!this.isRefreshing) {
          this.isRefreshing = true;
          try {
            // Attempt to refresh
            const refreshRes = await fetch(this.normalizeUrl('/auth/refresh'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ refresh_token: parsed.refresh_token })
            });
            
            if (refreshRes.ok) {
              const refreshData = await refreshRes.json();
              // Update local storage
              parsed.token = refreshData.access_token;
              if (refreshData.refresh_token) {
                parsed.refresh_token = refreshData.refresh_token;
              }
              localStorage.setItem('auth_payload', JSON.stringify(parsed));
              
              this.isRefreshing = false;
              this.onRefreshed(refreshData.access_token);
              
              // Retry original request
              const newOptions = { ...options };
              newOptions.headers = this.getHeaders(refreshData.access_token, options.body instanceof FormData);
              const retryRes = await fetch(url, newOptions);
              return this.handleResponse(retryRes);
            } else {
              // Refresh failed, force logout
              this.isRefreshing = false;
              localStorage.removeItem('auth_payload');
              clearMissionState();
              // window.location.reload(); // AUTH BYPASS: Prevent infinite reload loop
              throw new Error('Session expired');
            }
          } catch (error) {
            this.isRefreshing = false;
            localStorage.removeItem('auth_payload');
            clearMissionState();
            // window.location.reload(); // AUTH BYPASS: Prevent infinite reload loop
            throw error;
          }
        } else {
          // Wait for the ongoing refresh to complete
          return new Promise(resolve => {
            this.addRefreshSubscriber(async (newToken: string) => {
              const newOptions = { ...options };
              newOptions.headers = this.getHeaders(newToken, options.body instanceof FormData);
              const retryRes = await fetch(url, newOptions);
              resolve(this.handleResponse(retryRes));
            });
          });
        }
      } else {
        // No refresh token, force logout
        localStorage.removeItem('auth_payload');
        clearMissionState();
        // window.location.reload(); // AUTH BYPASS: Prevent infinite reload loop
        throw new Error('Unauthorized');
      }
    }
    
    return this.handleResponse(res);
  }

  private async handleResponse(response: Response) {
    if (response.status === 401) {
       throw new Error('Unauthorized');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status >= 500) {
        throw { status: response.status, data: { detail: data.detail || 'Internal Server Error' } };
      }
      throw { status: response.status, data };
    }
    return data;
  }

  async get(endpoint: string, signal?: AbortSignal) {
    return this.fetchWithAuth(this.normalizeUrl(endpoint), {
      method: 'GET',
      headers: this.getHeaders(),
      signal
    });
  }

  async post(endpoint: string, body: any, signal?: AbortSignal) {
    const isFormData = body instanceof FormData;
    return this.fetchWithAuth(this.normalizeUrl(endpoint), {
      method: 'POST',
      headers: this.getHeaders(undefined, isFormData),
      body: isFormData ? body : JSON.stringify(body),
      signal
    });
  }

  async put(endpoint: string, body: any) {
    const isFormData = body instanceof FormData;
    return this.fetchWithAuth(this.normalizeUrl(endpoint), {
      method: 'PUT',
      headers: this.getHeaders(undefined, isFormData),
      body: isFormData ? body : JSON.stringify(body),
    });
  }

  async delete(endpoint: string) {
    return this.fetchWithAuth(this.normalizeUrl(endpoint), {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
  }
}

export const apiClient = new ApiClient();
