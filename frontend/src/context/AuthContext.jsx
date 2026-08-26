import React, { createContext, useState, useEffect, useContext } from 'react';
import * as api from '../services/api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('cafeteria_user');
    const savedToken = localStorage.getItem('cafeteria_token');
    if (savedUser && savedToken) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const login = (userData, token, refreshToken) => {
    localStorage.setItem('cafeteria_user', JSON.stringify(userData));
    localStorage.setItem('cafeteria_token', token);
    if (refreshToken) localStorage.setItem('cafeteria_refresh_token', refreshToken);
    setUser(userData);
  };

  const loginAsGuest = () => {
    const guestUser = { id: null, name: 'Guest', role: 'guest' };
    setUser(guestUser);
  };

  const logout = () => {
    localStorage.removeItem('cafeteria_user');
    localStorage.removeItem('cafeteria_token');
    localStorage.removeItem('cafeteria_refresh_token');
    setUser(null);
  };

  const updateUser = (partial) => {
    const updated = { ...user, ...partial };
    localStorage.setItem('cafeteria_user', JSON.stringify(updated));
    setUser(updated);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginAsGuest, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
