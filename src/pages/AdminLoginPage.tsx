import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin } from '../utils/adminApi';
import {
  EnvelopeIcon,
  KeyIcon,
  LockClosedIcon,
  ArrowLeftIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';

const AdminLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const admin = await adminLogin(email, password);
      // Store in 'ziya-user' key — this is what all admin pages read from
      localStorage.setItem('ziya-user', JSON.stringify(admin));
      // Also keep 'admin' for backward-compat sidebar check
      localStorage.setItem('admin', JSON.stringify(admin));
      navigate('/admin/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-darkbg flex flex-col md:flex-row font-sans overflow-hidden">
      {/* Left Side - Illustration/Branding */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-primary to-blue-700 relative p-12 flex-col justify-between">
        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-10">
            <img src="/assets/ziya-logo.png" alt="Ziya Logo" className="w-12 h-10 brightness-0 invert" />
            <h1 className="text-3xl font-black text-white italic tracking-tighter">Ziya Voice</h1>
          </div>
          <div className="max-w-lg">
            <h2 className="text-4xl lg:text-5xl font-black text-white leading-tight mb-6">
              Advanced Administrative Control.
            </h2>
            <p className="text-blue-100 text-lg font-medium opacity-90 leading-relaxed italic">
              Monitor system performance, manage users, and control service limits from one powerful interface.
            </p>
          </div>
        </div>

        <div className="relative z-10">
          <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/20 inline-block">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-white/20 rounded-2xl">
                <ShieldCheckIcon className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-white font-black uppercase text-[10px] tracking-widest opacity-70">Security Status</p>
                <p className="text-white font-bold text-sm">Authorized Personnel Only</p>
              </div>
            </div>
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute top-0 right-0 w-full h-full opacity-10 pointer-events-none">
          <svg width="100%" height="100%" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
            <circle cx="400" cy="400" r="300" stroke="white" strokeWidth="2" fill="none" strokeDasharray="20 20" />
            <circle cx="400" cy="400" r="200" stroke="white" strokeWidth="2" fill="none" strokeDasharray="10 10" />
            <path d="M100 400 L700 400 M400 100 L400 700" stroke="white" strokeWidth="1" />
          </svg>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 bg-white dark:bg-darkbg-surface">
        <div className="w-full max-w-md animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="mb-10 text-center md:text-left">
            <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-2">Admin Portal</h1>
            <p className="text-slate-500 font-medium italic">Secure login for system administrators</p>
          </div>

          {error && (
            <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-2xl flex items-center text-red-700 dark:text-red-400 text-sm font-black animate-in shake duration-300">
              <LockClosedIcon className="h-5 w-5 mr-3 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Admin Email</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-14 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
                  <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-4" />
                </div>
                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
                  <EnvelopeIcon className="h-5 w-5" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-16 pr-5 py-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all font-bold text-slate-900 dark:text-white"
                  placeholder="admin@ziyavoice.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">System Password</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-14 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
                  <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-4" />
                </div>
                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
                  <KeyIcon className="h-5 w-5" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-16 pr-5 py-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all font-bold text-slate-900 dark:text-white"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary-dark text-white font-black py-4 px-6 rounded-2xl shadow-xl shadow-primary/20 transition-all transform active:scale-[0.98] flex items-center justify-center disabled:opacity-50 disabled:active:scale-100"
            >
              {loading ? (
                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Identify & Sign In"
              )}
            </button>
          </form>

          <div className="mt-12 pt-8 border-t border-slate-100 dark:border-slate-800 text-center">
            <button
              onClick={() => navigate('/login')}
              className="group flex items-center justify-center mx-auto text-[11px] font-black text-slate-500 hover:text-primary uppercase tracking-widest transition-colors"
            >
              <ArrowLeftIcon className="h-3 w-3 mr-2 group-hover:-translate-x-1 transition-transform" />
              Return to User Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginPage;
