import React, { useState } from 'react';
import { LogIn, Key, Mail, ShieldAlert, Briefcase, Wrench } from 'lucide-react';
import { api, setAuthToken, setCurrentUser } from '../api/client';

interface LoginProps {
  onLoginSuccess: (user: any) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    try {
      setError(null);
      setLoading(true);
      const res = await api.login({ email, password });
      setAuthToken(res.token);
      setCurrentUser(res.user);
      onLoginSuccess(res.user);
    } catch (err: any) {
      setError(err?.message || 'Failed to authenticate');
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (role: 'admin' | 'manager') => {
    if (role === 'admin') {
      setEmail('admin@construction.com');
      setPassword('password123');
    } else {
      setEmail('manager@construction.com');
      setPassword('password123');
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 bg-zinc-50 font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-zinc-200/80 p-6 sm:p-8">
        
        {/* Header Section */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-900 text-white mb-3">
            <LogIn className="w-6 h-6" />
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold text-zinc-900 tracking-tight">
            Construction Portal
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1">
            Construction Project Management ERP
          </p>
        </div>

        {/* Validation Errors */}
        {error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-3 text-xs sm:text-sm text-red-700 mb-4 animate-fade-in">
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
              Email Address / ID
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                <Mail className="w-4 h-4" />
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-zinc-300 rounded-xl text-zinc-950 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
              Access Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                <Key className="w-4 h-4" />
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-zinc-300 rounded-xl text-zinc-950 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all"
                disabled={loading}
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-sm rounded-xl transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-zinc-950 flex items-center justify-center gap-2"
            disabled={loading}
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            ) : (
              <>
                <span>Sign In</span>
              </>
            )}
          </button>
        </form>

        {/* Scaffold credentials helper for testing */}
        <div className="mt-8 border-t border-zinc-100 pt-6">
          <p className="text-center text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Demo Accounts
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => fillCredentials('admin')}
              className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200/60 rounded-xl text-xs font-semibold text-zinc-700 transition-colors flex items-center justify-center gap-1.5 text-center"
              type="button"
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Administrator</span>
            </button>
            <button
              onClick={() => fillCredentials('manager')}
              className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200/60 rounded-xl text-xs font-semibold text-zinc-700 transition-colors flex items-center justify-center gap-1.5 text-center"
              type="button"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Site Manager</span>
            </button>
          </div>
          <div className="mt-3 text-center">
            <p className="text-[11px] text-zinc-400 italic">
              Pre-filled credential passwords: <code className="font-mono font-bold bg-zinc-50 px-1 py-0.5 rounded text-zinc-600">password123</code>
            </p>
          </div>
        </div>

      </div>
      <div className="mt-6 text-center text-xs text-zinc-400 max-w-sm px-4">
        Construct ERP &copy; {new Date().getFullYear()}
      </div>
    </div>
  );
}
