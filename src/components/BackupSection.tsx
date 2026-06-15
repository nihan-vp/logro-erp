import React, { useEffect, useState } from 'react';
import { Database, Download, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';
import { api, getAuthToken } from '../api/client';
import { notify } from '../utils/toast';

export default function BackupSection() {
  const [databases, setDatabases] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState<string | null>(null); // name of DB currently backing up, or 'all'

  const fetchDatabases = async () => {
    try {
      setLoading(true);
      const res = await api.getBackupDatabases();
      setDatabases(res || []);
    } catch (err: any) {
      notify.error(err.message || 'Failed to fetch databases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDatabases();
  }, []);

  const handleBackup = async (dbName?: string) => {
    const identifier = dbName || 'all';
    setBackingUp(identifier);
    notify.info(`Generating backup zip for ${dbName ? `database "${dbName}"` : 'all databases'}...`);

    try {
      const token = getAuthToken();
      const response = await fetch('/api/superadmin/backup', {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ database: dbName }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to download backup');
      }

      // Read as blob
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Create temporary download link to trigger native File Explorer save dialog
      const a = document.createElement('a');
      a.href = url;
      a.download = dbName ? `backup-${dbName}-${Date.now()}.zip` : `backup-all-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      notify.success(`${dbName ? `Database "${dbName}"` : 'All databases'} backed up successfully!`);
    } catch (err: any) {
      console.error(err);
      notify.error(err.message || 'Backup execution failed');
    } finally {
      setBackingUp(null);
    }
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-100 pb-5">
        <div>
          <h2 className="text-base font-black text-zinc-950 flex items-center gap-2">
            <Database className="w-5 h-5 text-zinc-500" />
            MongoDB System Backups
          </h2>
          <p className="text-xs text-zinc-450 mt-1">
            Generate and download zipped bson snapshots of your live databases. You will be prompted to select a save location.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={fetchDatabases}
            disabled={loading || backingUp !== null}
            className="p-2.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-xl transition-all text-zinc-650 active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Refresh database list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => handleBackup()}
            disabled={backingUp !== null}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-zinc-950 hover:bg-zinc-900 text-white rounded-xl text-xs font-black shadow-sm active:scale-95 disabled:opacity-50 transition-all cursor-pointer border border-transparent"
          >
            {backingUp === 'all' ? (
              <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : (
              <Download className="w-3.5 h-3.5 stroke-[3]" />
            )}
            Backup All Databases
          </button>
        </div>
      </div>

      {loading && databases.length === 0 ? (
        <div className="py-12 text-center flex flex-col items-center">
          <div className="w-8 h-8 border-3 border-zinc-900/10 border-t-zinc-900 rounded-full animate-spin"></div>
          <p className="text-zinc-500 text-xs mt-3 font-semibold">Querying cluster database list...</p>
        </div>
      ) : databases.length === 0 ? (
        <div className="p-8 text-center bg-zinc-50/50 rounded-2xl border border-zinc-150">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
          <p className="text-zinc-800 text-xs font-bold">No active databases detected</p>
          <p className="text-zinc-450 text-[10px] mt-0.5">Please check your MongoDB network configuration.</p>
        </div>
      ) : (
        <div className="border border-zinc-200/80 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs font-medium bg-white">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-450 font-black uppercase text-[8px] tracking-widest select-none">
              <tr>
                <th className="p-4 pl-6">Database Name</th>
                <th className="p-4 text-center">Type</th>
                <th className="p-4 text-right pr-6 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-150">
              {databases.map((dbName) => {
                const isRegistry = dbName === 'logro_registry';
                const isTenant = dbName.startsWith('logro_tenant_');
                
                return (
                  <tr key={dbName} className="hover:bg-zinc-50/40 transition-colors">
                    <td className="p-4 pl-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-zinc-50 border border-zinc-200/60 text-zinc-700 rounded-lg flex items-center justify-center shrink-0">
                          <Database className="w-4 h-4 text-zinc-550" />
                        </div>
                        <div>
                          <span className="font-extrabold text-zinc-900 text-xs block">{dbName}</span>
                          <span className="text-[9px] text-zinc-400 font-mono mt-0.5 block">
                            {isRegistry ? 'System registry database' : isTenant ? 'Isolated tenant database' : 'Standard database'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border tracking-wider ${
                          isRegistry ? 'bg-zinc-900 text-white border-zinc-950' :
                          isTenant ? 'bg-blue-50 text-blue-700 border-blue-100' :
                          'bg-zinc-100 text-zinc-650 border-zinc-200'
                        }`}>
                          {isRegistry ? 'registry' : isTenant ? 'tenant' : 'other'}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-right pr-6">
                      <button
                        onClick={() => handleBackup(dbName)}
                        disabled={backingUp !== null}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200/80 hover:text-zinc-900 text-[10px] font-black rounded-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
                      >
                        {backingUp === dbName ? (
                          <div className="w-3 h-3 border-2 border-zinc-900/20 border-t-zinc-900 rounded-full animate-spin"></div>
                        ) : (
                          <Download className="w-3 h-3 text-zinc-500 stroke-[2.5]" />
                        )}
                        Backup
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      
      <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl flex items-start gap-2.5">
        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <span className="text-xs font-extrabold text-zinc-900 block">Security & Performance Information</span>
          <span className="text-[10px] text-zinc-500 block mt-0.5">
            Backups are generated on the server using standard binary dumps and then streamed back directly to your local file system. 
            Because this operation creates temporary system resources, please avoid running multiple backup jobs concurrently.
          </span>
        </div>
      </div>
    </div>
  );
}
