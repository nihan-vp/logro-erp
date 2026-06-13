import React, { useState } from 'react';
import { LogIn, Key, Mail, ShieldAlert } from 'lucide-react';
import { api, setAuthToken, setCurrentUser } from '../api/client';
import { notify } from '../utils/toast';

interface LoginProps {
  onLoginSuccess: (user: any) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Activation screen states
  const [showExpiryScreen, setShowExpiryScreen] = useState(false);
  const [productKey, setProductKey] = useState('');
  const [activationEmail, setActivationEmail] = useState('');
  const [activationLoading, setActivationLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      const message = 'Please fill in all fields';
      setError(message);
      notify.warning(message);
      return;
    }

    try {
      setError(null);
      setLoading(true);
      // Defaulting companyName as the UI field has been removed
      const res = await api.login({ email, password, companyName: 'DefaultCompany' });
      setAuthToken(res.token);
      setCurrentUser(res.user);
      onLoginSuccess(res.user);
      notify.success('Signed in successfully.');
    } catch (err: any) {
      const message = err?.message || 'Failed to authenticate';
      setError(message);
      notify.error(message);
      if (message.toLowerCase().includes('expired') || message.toLowerCase().includes('trial')) {
        setActivationEmail(email);
        setShowExpiryScreen(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationEmail || !productKey) {
      notify.warning('Please enter both your email address and product key');
      return;
    }

    try {
      setActivationLoading(true);
      setError(null);
      const res = await api.activate({ email: activationEmail, productKey });
      notify.success(res.message || 'Account activated successfully!');
      setProductKey('');
      setShowExpiryScreen(false);
      // Put email back to main login input so they can easily login now
      setEmail(activationEmail);
    } catch (err: any) {
      const message = err?.message || 'Activation failed';
      setError(message);
      notify.error(message);
    } finally {
      setActivationLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 bg-zinc-50 font-sans select-none">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-zinc-200/80 p-6 sm:p-8 relative overflow-hidden">
        {/* Top border decoration */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-zinc-950 via-zinc-800 to-zinc-900"></div>

        {showExpiryScreen ? (
          /* Trial / License Expiration Screen */
          <div className="animate-fade-in">
            {/* Header Section */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 mb-3 animate-pulse">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
                Trial Period Expired
              </h1>
              <p className="text-xs sm:text-sm text-zinc-500 mt-1">
                Enter a product key to restore access to your ERP database.
              </p>
            </div>

            {/* Validation Errors */}
            {error && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-3 text-xs sm:text-sm text-red-700 mb-4">
                <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            {/* Support Box */}
            <div className="bg-zinc-50 border border-zinc-150 p-3.5 rounded-xl text-center mb-4 text-xs font-semibold text-zinc-650">
              Need support? Contact system helpdesk at:
              <div className="text-sm font-black text-zinc-900 mt-1 select-text">
                +91 77367-08566
              </div>
            </div>

            {/* Activation Form */}
            <form onSubmit={handleActivate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                  Registered Email Address
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                    <Mail className="w-4 h-4" />
                  </span>
                  <input
                    type="email"
                    value={activationEmail}
                    onChange={(e) => setActivationEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full pl-9 pr-3 py-2.5 bg-white border border-zinc-300 rounded-xl text-zinc-950 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all"
                    disabled={activationLoading}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                  Product Key
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                    <Key className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    value={productKey}
                    onChange={(e) => setProductKey(e.target.value)}
                    placeholder="LOGRO-ACTIVE-COMPANY-9999"
                    className="w-full pl-9 pr-3 py-2.5 bg-white border border-zinc-300 rounded-xl text-zinc-950 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all uppercase font-mono tracking-wider"
                    disabled={activationLoading}
                    required
                  />
                </div>
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setShowExpiryScreen(false);
                  }}
                  className="flex-1 py-2.5 bg-zinc-50 border border-zinc-250 hover:bg-zinc-100 text-zinc-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                  disabled={activationLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs rounded-xl transition-colors focus:ring-2 focus:ring-zinc-950 flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-zinc-950/10"
                  disabled={activationLoading}
                >
                  {activationLoading ? (
                    <span className="w-4.5 h-4.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  ) : (
                    <span>Activate Plan</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Main Login Screen */
          <div className="animate-fade-in">
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
                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-sm rounded-xl transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-zinc-950 flex items-center justify-center gap-2 cursor-pointer shadow-md"
                disabled={loading}
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                ) : (
                  <span>Sign In</span>
                )}
              </button>

              <div className="flex justify-between items-center text-[10px] text-zinc-400 pt-1">
                <span>Security policy: Max 5 failed attempts</span>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setShowExpiryScreen(true);
                  }}
                  className="font-bold underline text-zinc-550 hover:text-zinc-700"
                >
                  Enter Product Key
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
      <div className="mt-6 text-center text-xs text-zinc-400 max-w-sm px-4">
        Construct ERP &copy; {new Date().getFullYear()}
      </div>
    </div>
  );
}
