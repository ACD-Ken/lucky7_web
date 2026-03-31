import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

// Enforce HTTPS in production to prevent accidental plaintext credential transmission
if (import.meta.env.PROD && !BASE_URL.startsWith('https://')) {
  throw new Error(`[Lucky7] VITE_API_URL must use HTTPS in production. Got: ${BASE_URL}`);
}

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // send httpOnly auth cookie on every request
});

// On 401, clear local user state so the router redirects to onboarding
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Lazy import to avoid circular dependency
      import('../stores/userStore').then(({ useUserStore }) => {
        useUserStore.getState().logout();
      });
    }
    return Promise.reject(error);
  }
);

export const logoutUser = () => api.post('/users/logout');
export const getProfile = () => api.get('/users/profile');
export const getLatestDraw = () => api.get('/draws/latest');
export const getDrawHistory = (limit = 50) => api.get(`/draws/history?limit=${limit}`);
export const getUserPredictions = (userId: string) => api.get(`/predictions/${userId}`);
export const getAnalytics = (userId: string) => api.get(`/analytics/${userId}`);
export default api;
