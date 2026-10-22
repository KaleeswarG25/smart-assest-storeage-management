/**
 * Centralized API Client with standard JSON handling, credentials inclusion,
 * and sanitized user-friendly error formatting.
 *
 * Security Invariants:
 * - Always includes `credentials: 'include'` for secure HttpOnly cookie transfer.
 * - Never prints passwords, tokens, cookies, or sensitive secrets in logs.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

class ApiError extends Error {
  constructor(message, status = 500, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// Global hook to notify auth context on HTTP 401
let onUnauthorizedCallback = null;

export function registerUnauthorizedHandler(handler) {
  onUnauthorizedCallback = handler;
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  const headers = {
    'Accept': 'application/json',
    ...(options.headers || {})
  };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const config = {
    ...options,
    headers,
    credentials: 'include' // Always transmit cookies securely across all requests
  };

  let response;
  try {
    response = await fetch(url, config);
  } catch (netErr) {
    throw new ApiError(
      'Unable to connect to the backend server. Please verify the Express backend is running on port 5000.',
      0
    );
  }

  let responseData = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      responseData = await response.json();
    } catch {
      responseData = null;
    }
  }

  if (!response.ok) {
    const errorMsg =
      (responseData && (responseData.error || responseData.message)) ||
      getDefaultErrorMessage(response.status);

    if (response.status === 401 && onUnauthorizedCallback) {
      onUnauthorizedCallback();
    }

    throw new ApiError(errorMsg, response.status, responseData);
  }

  return responseData;
}

function getDefaultErrorMessage(status) {
  switch (status) {
    case 400:
      return 'The request was invalid. Please check your input.';
    case 401:
      return 'Authentication required. Your session may have expired.';
    case 403:
      return 'Access forbidden. Cross-site request or permission check failed.';
    case 404:
      return 'The requested resource was not found.';
    case 429:
      return 'Too many requests. Please wait a few moments before trying again.';
    case 503:
      return 'Service temporarily unavailable. Database or server health degraded.';
    case 500:
    default:
      return 'An unexpected server error occurred. Please try again later.';
  }
}

export function resolveAssetUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  return `${API_BASE_URL}${url}`;
}

export const apiClient = {
  get: (endpoint, options = {}) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'POST', body }),
  put: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'PUT', body }),
  delete: (endpoint, options = {}) => request(endpoint, { ...options, method: 'DELETE' }),
};

export { ApiError, API_BASE_URL };
