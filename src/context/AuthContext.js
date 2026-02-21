import React, { createContext, useState, useEffect } from 'react';
import { getCurrentUser, createUser, getUserByUsername } from '../services/database';
import BluetoothService from '../services/bluetooth';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        await BluetoothService.initialize(currentUser.id);
        await BluetoothService.setDeviceName(currentUser.id, currentUser.username);
      }
    } catch (error) {
      console.error('Check user error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username, pin) => {
    try {
      const userData = await getUserByUsername(username);
      if (!userData) {
        throw new Error('User not found');
      }
      if (userData.pin !== pin) {
        throw new Error('Invalid PIN');
      }
      setUser(userData);
      await BluetoothService.initialize(userData.id);
      await BluetoothService.setDeviceName(userData.id, userData.username);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const register = async (username, displayName, pin) => {
    try {
      const existing = await getUserByUsername(username);
      if (existing) {
        throw new Error('Username already exists');
      }
      const userId = await createUser(username, displayName, pin);
      const userData = await getUserByUsername(username);
      setUser(userData);
      await BluetoothService.initialize(userData.id);
      await BluetoothService.setDeviceName(userData.id, userData.username);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const logout = () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};