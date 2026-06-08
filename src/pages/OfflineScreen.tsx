import React from 'react';
import { WifiOff } from 'lucide-react';
import { useConnectivity } from '../context/ConnectivityContext';

const OfflineScreen: React.FC = () => {
  const { isOnline, refreshConnectivity } = useConnectivity();

  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-950 dark:text-zinc-100 p-4 backdrop-blur-sm">
      <div className="flex flex-col items-center p-8 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm max-w-sm text-center border border-zinc-200/80 dark:border-zinc-800 animate-in fade-in zoom-in duration-300">
        <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl mb-6">
          <WifiOff className="h-10 w-10 text-zinc-950 dark:text-zinc-100" />
        </div>
        <h1 className="text-xl font-bold mb-2 tracking-tight text-zinc-950 dark:text-zinc-100">No Internet Connection</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-8 leading-relaxed">
          It looks like you're offline. Please check your network connection to continue using the LOGRO ERP.
        </p>
        <button
          onClick={() => refreshConnectivity()}
          className="w-full px-6 py-3 bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 font-semibold text-xs uppercase tracking-wider rounded-xl shadow-sm hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all active:scale-95"
        >
          Try Again
        </button>
      </div>
    </div>
  );
};

export default OfflineScreen;