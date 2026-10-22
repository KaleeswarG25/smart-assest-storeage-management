import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../api/authApi';
import { registerUnauthorizedHandler } from '../api/client';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Checks server session validity via GET /api/auth/me using HttpOnly cookies
  const checkAuth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const admin = await authApi.getMe();
      setUser(admin);
    } catch (err) {
      // 401 or network failure simply means unauthenticated, not an unhandled exception
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial server session verification on mount
    checkAuth();

    // Register 401 hook so background 401s automatically reset frontend auth state
    registerUnauthorizedHandler(() => {
      setUser(null);
    });
  }, [checkAuth]);

  const login = async (identifier, password) => {
    setError(null);
    try {
      const admin = await authApi.login(identifier, password);
      setUser(admin);
      return admin;
    } catch (err) {
      setError(err.message || 'Login failed');
      throw err;
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (err) {
      // Even if network failed, proceed with local session cleanup
      console.warn('Logout request completed with error or network offline:', err.message);
    } finally {
      setUser(null);
      setError(null);
    }
  };

  const value = {
    user,
    isAuthenticated: !!user,
    loading,
    error,
    login,
    logout,
    checkAuth
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
