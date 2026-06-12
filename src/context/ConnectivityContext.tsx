import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { notify } from '../utils/toast';

interface ConnectivityContextType {
  isOnline: boolean;
  refreshConnectivity: () => Promise<void>;
}

const ConnectivityContext = createContext<ConnectivityContextType | undefined>(undefined);

export const ConnectivityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const wasOnlineRef = useRef(navigator.onLine);

  const checkConnectivity = useCallback(async () => {
    if (!navigator.onLine) {
      if (wasOnlineRef.current) {
        notify.warning('You are offline.');
      }
      wasOnlineRef.current = false;
      setIsOnline(false);
      return;
    }

    try {
      await fetch('/favicon.ico', {
        method: 'HEAD',
        cache: 'no-store',
        mode: 'no-cors',
      });
      if (!wasOnlineRef.current) {
        notify.success('Connection restored.');
      }
      wasOnlineRef.current = true;
      setIsOnline(true);
    } catch {
      if (wasOnlineRef.current) {
        notify.warning('You are offline.');
      }
      wasOnlineRef.current = false;
      setIsOnline(false);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      checkConnectivity();
    };

    const handleOffline = () => {
      if (wasOnlineRef.current) {
        notify.warning('You are offline.');
      }
      wasOnlineRef.current = false;
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check and periodic heartbeat (every 30 seconds)
    checkConnectivity();
    const interval = setInterval(checkConnectivity, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [checkConnectivity]);

  return (
    <ConnectivityContext.Provider value={{ isOnline, refreshConnectivity: checkConnectivity }}>
      {children}
    </ConnectivityContext.Provider>
  );
};

export const useConnectivity = () => {
  const context = useContext(ConnectivityContext);
  if (context === undefined) {
    throw new Error('useConnectivity must be used within a ConnectivityProvider');
  }
  return context;
};
