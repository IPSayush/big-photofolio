/**
 * API Client — Axios instance with auth interceptors.
 * 
 * Handles:
 * - Automatic Authorization header injection
 * - Token refresh on 401 (TOKEN_EXPIRED)
 * - Error normalization
 */

import axios from 'axios';

const API_BASE = '/api';

const client = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000, // 60s default; uploads use longer timeout
});

// --- Request interceptor: attach access token ---
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- Response interceptor: handle token refresh ---
let isRefreshing = false;
let failedQueue = [];

function processQueue(error, token = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Token expired — attempt refresh
    if (
      error.response?.status === 401 &&
      error.response?.data?.code === 'TOKEN_EXPIRED' &&
      !originalRequest._retry
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return client(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });

        const newAccessToken = data.data.tokens.accessToken;
        const newRefreshToken = data.data.tokens.refreshToken;

        localStorage.setItem('accessToken', newAccessToken);
        localStorage.setItem('refreshToken', newRefreshToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        processQueue(null, newAccessToken);

        return client(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// --- Convenience methods ---
export const api = {
  get: (url, config) => client.get(url, config).then((r) => r.data),
  post: (url, data, config) => client.post(url, data, config).then((r) => r.data),
  patch: (url, data, config) => client.patch(url, data, config).then((r) => r.data),
  put: (url, data, config) => client.put(url, data, config).then((r) => r.data),
  delete: (url, config) => client.delete(url, config).then((r) => r.data),
  // Raw axios instance for when you need full response
  raw: client,
};

export default api;
