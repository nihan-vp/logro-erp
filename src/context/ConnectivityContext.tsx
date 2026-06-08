import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface ConnectivityContextType {
  isOnline: boolean;
  refreshConnectivity: () => Promise<void>;
}

const ConnectivityContext = createContext<ConnectivityContextType | undefined>(undefined);

export const ConnectivityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const checkConnectivity = useCallback(async () => {
    if (!navigator.onLine) {
      setIsOnline(false);
      return;
    }

    try {
      // Use a small, frequently available resource with a cache-buster to verify actual internet access
      // Using a HEAD request to minimize data usage
      const response = await fetch('/favicon.ico', { 
        method: 'HEAD', 
        cache: 'no-store',
        mode: 'no-cors' 
      });
      setIsOnline(true);
    } catch (error) {
      console.warn('Connectivity check failed:', error);
      setIsOnline(false);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      checkConnectivity();
    };

    const handleOffline = () => {
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
