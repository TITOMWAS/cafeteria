const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const getToken = () => localStorage.getItem('cafeteria_token');
const getRefreshToken = () => localStorage.getItem('cafeteria_refresh_token');

const headers = (extra = {}) => ({
  'Content-Type': 'application/json',
  ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
  ...extra,
});

// Wraps fetch and converts TypeError (network down) into a recognizable error
const safeFetchRaw = async (url, options) => {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error('Network error: Unable to connect to the server');
    }
    throw err;
  }
};

const handleResponse = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || 'Request failed');
    error.status = res.status;
    error.code = data.code;
    throw error;
  }
  return data;
};

// Single-flight refresh: concurrent 401s share one refresh call
let refreshPromise = null;

const refreshAccessToken = async () => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const rt = getRefreshToken();
      if (!rt) throw new Error('No session');
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Session expired');
      localStorage.setItem('cafeteria_token', data.token);
      return data.token;
    })().finally(() => { setTimeout(() => { refreshPromise = null; }, 0); });
  }
  return refreshPromise;
};

// Core request wrapper with transparent access-token refresh on 401
const request = async (url, options = {}, retried = false) => {
  let res = await safeFetchRaw(url, options);
  if (res.status === 401 && !retried && getRefreshToken()) {
    try {
      await refreshAccessToken();
      // rebuild headers with the fresh token
      const retryOptions = { ...options };
      if (retryOptions.headers?.Authorization?.startsWith('Bearer ')) {
        retryOptions.headers = { ...retryOptions.headers, Authorization: `Bearer ${getToken()}` };
      }
      res = await safeFetchRaw(url, retryOptions);
    } catch {
      localStorage.removeItem('cafeteria_token');
      localStorage.removeItem('cafeteria_refresh_token');
      localStorage.removeItem('cafeteria_user');
      if (!['/', '/secure-access'].includes(window.location.pathname)) {
        window.location.href = '/';
      }
      throw new Error('Your session has expired. Please sign in again.');
    }
  }
  return handleResponse(res);
};

const safeFetch = (url, options) => request(url, options);

// AUTH
export const loginStudent = (student_id, password, turnstile_token) =>
  safeFetch(`${BASE_URL}/auth/login`, { method: 'POST', headers: headers(), body: JSON.stringify({ student_id, password, turnstile_token }) });

export const loginStaff = (email, password, token, turnstile_token) =>
  safeFetch(`${BASE_URL}/auth/staff-login`, { method: 'POST', headers: headers(), body: JSON.stringify({ email, password, token, turnstile_token }) });

export const forgotPassword = (identifier, turnstile_token) =>
  safeFetch(`${BASE_URL}/auth/forgot-password`, { method: 'POST', headers: headers(), body: JSON.stringify({ identifier, turnstile_token }) });

export const resetPassword = (token, new_password) =>
  safeFetch(`${BASE_URL}/auth/reset-password`, { method: 'POST', headers: headers(), body: JSON.stringify({ token, new_password }) });

// TOTP (authenticator app) enrollment for staff/admin
export const setupTotp = (email, password, turnstile_token) =>
  safeFetch(`${BASE_URL}/auth/totp/setup`, { method: 'POST', headers: headers(), body: JSON.stringify({ email, password, turnstile_token }) });

export const resetTotp = (email) =>
  safeFetch(`${BASE_URL}/auth/totp/reset`, { method: 'POST', headers: headers(), body: JSON.stringify({ email }) });

// MEALS
export const fetchMeals = (category) => {
  const url = category ? `${BASE_URL}/meals?category=${category}` : `${BASE_URL}/meals`;
  return safeFetch(url, { headers: headers() });
};

export const createMeal = (mealData) =>
  safeFetch(`${BASE_URL}/meals`, { method: 'POST', headers: headers(), body: JSON.stringify(mealData) });

export const updateMeal = (id, mealData) =>
  safeFetch(`${BASE_URL}/meals/${id}`, { method: 'PUT', headers: headers(), body: JSON.stringify(mealData) });

export const toggleMealAvailability = (id, availability) =>
  safeFetch(`${BASE_URL}/meals/${id}`, { method: 'PUT', headers: headers(), body: JSON.stringify({ availability }) });

export const uploadMealImage = async (file) => {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`${BASE_URL}/meals/upload`, {
    method: 'POST',
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    body: formData,
  });
  return handleResponse(res);
};

// RATINGS
export const rateMeal = (mealId, rating) =>
  safeFetch(`${BASE_URL}/meals/${mealId}/rating`, { method: 'POST', headers: headers(), body: JSON.stringify({ rating }) });

export const fetchMyRatings = () =>
  safeFetch(`${BASE_URL}/meals/my-ratings`, { headers: headers() });

// FAVOURITES
export const fetchFavourites = () =>
  safeFetch(`${BASE_URL}/favourites`, { headers: headers() });

export const addFavourite = (mealId) =>
  safeFetch(`${BASE_URL}/favourites/${mealId}`, { method: 'POST', headers: headers() });

export const removeFavourite = (mealId) =>
  safeFetch(`${BASE_URL}/favourites/${mealId}`, { method: 'DELETE', headers: headers() });

// ORDERS
export const placeOrder = (orderData) =>
  safeFetch(`${BASE_URL}/orders`, { method: 'POST', headers: headers(), body: JSON.stringify(orderData) });

export const initiatePayment = (paymentData) =>
  safeFetch(`${BASE_URL}/orders/initiate-payment`, { method: 'POST', headers: headers(), body: JSON.stringify(paymentData) });

export const fetchOrders = (params = {}) => {
  // Accepts an object of filters or a legacy status string
  const q = typeof params === 'string' ? { status: params } : params;
  const usp = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, v]));
  const qs = usp.toString();
  return safeFetch(`${BASE_URL}/orders${qs ? `?${qs}` : ''}`, { headers: headers() });
};

export const fetchMyOrders = () =>
  safeFetch(`${BASE_URL}/orders/my-orders`, { headers: headers() });

export const updateOrderStatus = (id, status) =>
  safeFetch(`${BASE_URL}/orders/${id}/status`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ status }) });

export const fetchAnalytics = (range = {}) => {
  const usp = new URLSearchParams(Object.entries(range).filter(([, v]) => v).map(([k, v]) => [k, v]));
  const qs = usp.toString();
  return safeFetch(`${BASE_URL}/orders/analytics${qs ? `?${qs}` : ''}`, { headers: headers() });
};

export const exportOrdersCsv = async (range = {}) => {
  const usp = new URLSearchParams(Object.entries(range).filter(([, v]) => v).map(([k, v]) => [k, v]));
  const qs = usp.toString();
  const res = await fetch(`${BASE_URL}/orders/export${qs ? `?${qs}` : ''}`, { headers: headers() });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orders_${range.from || 'start'}_to_${range.to || 'today'}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// Live order stream (Server-Sent Events)
export const createOrderStream = (onMessage, onError) => {
  const token = getToken();
  if (!token || !window.EventSource) return null;
  const es = new EventSource(`${BASE_URL}/orders/stream?token=${encodeURIComponent(token)}`);
  es.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)); } catch { /* ignore malformed frames */ }
  };
  es.onerror = (err) => { if (onError) onError(err); };
  return es;
};

// MISSED MEAL CARRYOVERS
export const fetchMyCarryovers = () =>
  safeFetch(`${BASE_URL}/orders/carryovers/mine`, { headers: headers() });

export const fetchCarryovers = (search) =>
  safeFetch(`${BASE_URL}/orders/carryovers${search ? `?search=${encodeURIComponent(search)}` : ''}`, { headers: headers() });

export const redeemCarryover = (id) =>
  safeFetch(`${BASE_URL}/orders/carryovers/${id}/redeem`, { method: 'POST', headers: headers() });

// USER PROFILE
export const fetchProfile = () =>
  safeFetch(`${BASE_URL}/users/profile`, { headers: headers() });

export const updateProfile = (profileData) =>
  safeFetch(`${BASE_URL}/users/profile`, { method: 'PATCH', headers: headers(), body: JSON.stringify(profileData) });

export const changePassword = (current_password, new_password) =>
  safeFetch(`${BASE_URL}/users/profile/password`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ current_password, new_password }) });

// USER MANAGEMENT (admin)
export const fetchUsers = (params = {}) => {
  const usp = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, v]));
  const qs = usp.toString();
  return safeFetch(`${BASE_URL}/users${qs ? `?${qs}` : ''}`, { headers: headers() });
};

export const adminCreateUser = (userData) =>
  safeFetch(`${BASE_URL}/users`, { method: 'POST', headers: headers(), body: JSON.stringify(userData) });

export const adminUpdateUser = (id, userData) =>
  safeFetch(`${BASE_URL}/users/${id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(userData) });

export const adminDeleteUser = (id) =>
  safeFetch(`${BASE_URL}/users/${id}`, { method: 'DELETE', headers: headers() });

// AUDIT LOG (admin)
export const fetchAuditLogs = (params = {}) => {
  const usp = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, v]));
  const qs = usp.toString();
  return safeFetch(`${BASE_URL}/audit${qs ? `?${qs}` : ''}`, { headers: headers() });
};

// NOTIFICATIONS
export const fetchNotifications = (scopeAll = false) =>
  safeFetch(scopeAll ? `${BASE_URL}/notifications?scope=all` : `${BASE_URL}/notifications`, { headers: headers() });

export const sendNotification = (payload) =>
  safeFetch(`${BASE_URL}/notifications`, { method: 'POST', headers: headers(), body: JSON.stringify(payload) });

export const markNotificationRead = (id) =>
  safeFetch(`${BASE_URL}/notifications/${id}/read`, { method: 'PATCH', headers: headers() });

export const markAllNotificationsRead = () =>
  safeFetch(`${BASE_URL}/notifications/read-all`, { method: 'PATCH', headers: headers() });

export const deleteNotification = (id) =>
  safeFetch(`${BASE_URL}/notifications/${id}`, { method: 'DELETE', headers: headers() });
