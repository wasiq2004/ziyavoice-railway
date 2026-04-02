import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { signIn, signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setShowSuccess(false);

    try {
      if (isSignUp) {
        const { error } = await signUp(email, username, password);
        if (error) throw error;
        setShowSuccess(true);
        // Automatically switch to login mode after successful signup
        setTimeout(() => {
          setIsSignUp(false);
          setShowSuccess(false);
        }, 2000);
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
        setShowSuccess(true);
        // AuthContext already handles navigation on signIn, so we just wait for it.
        return;
      }
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate with Google');
      setLoading(false);
    }
  };

  // ==========================================
  // SHARED PURE CSS ANIMATIONS 
  // ==========================================
  const customAnimations = `
    @keyframes float-slow {
      0%, 100% { transform: translateY(0) rotate(0deg); }
      50% { transform: translateY(-20px) rotate(2deg); }
    }
    @keyframes float-delayed {
      0%, 100% { transform: translateY(0) rotate(0deg); }
      50% { transform: translateY(20px) rotate(-2deg); }
    }
    @keyframes slideUp {
      0% { opacity: 0; transform: translateY(30px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes slideRight {
      0% { opacity: 0; transform: translateX(-40px); }
      100% { opacity: 1; transform: translateX(0); }
    }
    @keyframes slideLeft {
      0% { opacity: 0; transform: translateX(40px); }
      100% { opacity: 1; transform: translateX(0); }
    }
    @keyframes scaleIn {
      0% { opacity: 0; transform: scale(0.95); }
      100% { opacity: 1; transform: scale(1); }
    }
    @keyframes shine {
      0% { left: -100%; transition-property: left; }
      100% { left: 100%; transition-property: left; }
    }
    @keyframes morph {
      0% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
      50% { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; }
      100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
    }
    @keyframes pulse-ring {
      0% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 25px rgba(16, 185, 129, 0); }
      100% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }
    @keyframes grid-move {
      0% { background-position: 0 0; }
      100% { background-position: 50px 50px; }
    }
    
    .animate-morph { animation: morph 8s ease-in-out infinite; }
    .animate-pulse-ring { animation: pulse-ring 3s cubic-bezier(0.215, 0.61, 0.355, 1) infinite; }
    .animate-float-slow { animation: float-slow 6s ease-in-out infinite; }
    .animate-float-delayed { animation: float-delayed 7s ease-in-out infinite; animation-delay: 1s; }
    
    .animate-slide-up { animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
    .animate-slide-right { animation: slideRight 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
    .animate-slide-left { animation: slideLeft 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
    .animate-scale-in { animation: scaleIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }

    .glass-panel-dark {
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .bg-grid-pattern {
      background-size: 50px 50px;
      background-image: 
        linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
      animation: grid-move 20s linear infinite;
    }
  `;

  return (
    <div className="min-h-screen flex w-full bg-[#0B1120] relative overflow-hidden font-sans">
      <style dangerouslySetInnerHTML={{ __html: customAnimations }} />

      {/* Animated Moving Grid Background */}
      <div className="absolute inset-0 z-0 bg-grid-pattern opacity-30"></div>

      {/* Glowing atmospheric background spheres */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/20 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-cyan-600/20 blur-[120px] pointer-events-none"></div>

      <div className="hidden lg:flex flex-col justify-center relative w-1/2 p-20 z-10 border-r border-white/5">
        
        {/* Floating Badges */}
        <div className="absolute top-[20%] right-[15%] glass-panel-dark px-4 py-2 rounded-2xl animate-float-slow shadow-xl flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <span className="text-slate-200 text-sm font-semibold">
            {isSignUp ? 'Neural Network Ready' : 'Welcome '}
          </span>
        </div>

        <div className="absolute bottom-[25%] left-[10%] glass-panel-dark px-4 py-2 rounded-2xl animate-float-delayed shadow-xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400">🔊</div>
          <div className="flex flex-col">
            <span className="text-slate-200 text-xs font-bold">Indian Voice</span>
            <span className="text-slate-400 text-[10px]">
              {isSignUp ? 'Awaiting Initialization...' : 'Processing...'}
            </span>
          </div>
        </div>

        {/* Central Morphing AI Orb */}
        <div className="relative w-80 h-80 mx-auto flex items-center justify-center animate-slide-right" style={{ animationDelay: '0.2s' }}>
          {/* Pulsing rings behind */}
          <div className="absolute inset-0 bg-primary/20 rounded-full animate-pulse-ring blur-xl"></div>
          {/* Main shape-shifting blob */}
          <div className="absolute inset-4 bg-gradient-to-tr from-primary via-emerald-400 to-cyan-500 animate-morph opacity-80 mix-blend-screen shadow-[0_0_80px_rgba(16,185,129,0.5)]"></div>
          {/* Inner dark core */}
          <div className="absolute inset-10 bg-slate-900 rounded-full z-10 animate-morph flex items-center justify-center border border-white/10 shadow-inner">
             <svg className="w-16 h-16 text-primary drop-shadow-[0_0_15px_rgba(16,185,129,0.8)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
        </div>

        {/* Dynamic Text Copy */}
        <div className="mt-16 text-center animate-slide-up" style={{ animationDelay: '0.4s' }}>
          <h1 className="text-4xl font-extrabold text-white mb-4 tracking-tight transition-all duration-500">
            {isSignUp ? 'Build Your ' : 'Command Your '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-cyan-400">
              {isSignUp ? 'AI Empire' : 'Agents'}
            </span>
          </h1>
          <p className="text-slate-400 text-lg max-w-sm mx-auto transition-all duration-500">
            {isSignUp 
              ? 'Deploy neural voice agents, automate workflows, and scale your operations in seconds.'
              : 'Log in to manage your AI workflows, analyze voice interactions, and scale your business.'}
          </p>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative z-10">
        
        {/* We use key={isSignUp} to re-trigger the entrance animations when switching modes */}
        <div key={isSignUp ? 'signup' : 'login'} className="w-full max-w-md animate-scale-in" style={{ animationDelay: '0.1s' }}>
          
          <div className="glass-panel-dark rounded-[2rem] shadow-2xl p-8 sm:p-10 border border-white/10 relative overflow-hidden">
            
            {/* Subtle highlight effect on the card edge */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>

            {/* Header */}
            <div className="animate-slide-left mb-10 text-center" style={{ animationDelay: '0.2s' }}>
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/20 text-primary mb-4 border border-primary/30 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                {isSignUp ? (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                )}
              </div>
              <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">
                {isSignUp ? 'Create Identity' : 'Welcome Back'}
              </h2>
              <p className="text-slate-400">
                {isSignUp ? 'Register your agent command center' : 'Access your voice intelligence dashboard'}
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              
              {/* Alerts */}
              {error && (
                <div className="animate-slide-up rounded-xl bg-red-500/10 p-4 border border-red-500/20 flex items-start gap-3 backdrop-blur">
                  <svg className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                  <div className="text-sm text-red-300">{error}</div>
                </div>
              )}
              {showSuccess && (
                <div className="animate-slide-up rounded-xl bg-emerald-500/10 p-4 border border-emerald-500/20 flex items-start gap-3 backdrop-blur">
                  <svg className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  <div className="text-sm text-emerald-300">
                    {isSignUp ? 'Identity created! Securing link...' : 'Login successful! Securing connection...'}
                  </div>
                </div>
              )}

              {/* Email Input */}
              <div className="animate-slide-left group" style={{ animationDelay: '0.3s' }}>
                <label className="block text-sm font-semibold text-slate-300 mb-2 ml-1">Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-primary transition-colors">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </div>
                  <input
                    name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 bg-slate-900/50 border border-slate-700/50 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-white transition-all outline-none placeholder-slate-500 shadow-inner"
                    placeholder="Enter your email"
                  />
                </div>
              </div>

              {/* Conditional Username Input (Only for Sign Up) */}
              {isSignUp && (
                <div className="animate-slide-left group" style={{ animationDelay: '0.4s' }}>
                  <label className="block text-sm font-semibold text-slate-300 mb-2 ml-1">Username</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-primary transition-colors">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </div>
                    <input
                      name="username" type="text" required value={username} onChange={(e) => setUsername(e.target.value)}
                      className="w-full pl-11 pr-4 py-3.5 bg-slate-900/50 border border-slate-700/50 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-white transition-all outline-none placeholder-slate-500 shadow-inner"
                      placeholder="Choose a username"
                    />
                  </div>
                </div>
              )}

              {/* Password Input */}
              <div className="animate-slide-left group" style={{ animationDelay: isSignUp ? '0.5s' : '0.4s' }}>
                <div className="flex justify-between items-center mb-2 ml-1">
                  <label className="block text-sm font-semibold text-slate-300">Password</label>
                  {!isSignUp && (
                    <span className="text-xs text-primary hover:text-emerald-400 cursor-pointer transition-colors">Forgot?</span>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-primary transition-colors">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  </div>
                  <input
                    name="password" type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-12 py-3.5 bg-slate-900/50 border border-slate-700/50 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-white transition-all outline-none placeholder-slate-500 shadow-inner"
                    placeholder={isSignUp ? "Create a strong password" : "Enter your password"}
                  />
                  <button
                    type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-white transition-colors outline-none"
                  >
                    {showPassword ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <div className="animate-slide-up pt-2" style={{ animationDelay: isSignUp ? '0.6s' : '0.5s' }}>
                <button
                  type="submit" disabled={loading}
                  className="group relative w-full flex justify-center items-center py-3.5 px-4 rounded-xl text-white font-bold bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90 focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-slate-900 transition-all duration-300 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] hover:-translate-y-0.5 overflow-hidden"
                >
                  <div className="absolute inset-0 w-1/4 h-full bg-white/20 skew-x-12 -translate-x-full group-hover:animate-[shine_1.5s_ease-in-out_infinite]"></div>
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      <span>{isSignUp ? 'Deploying...' : 'Authenticating...'}</span>
                    </div>
                  ) : (
                    isSignUp ? 'Create An Account' : 'Login'
                  )}
                </button>
              </div>


            </form>

            <div className="relative my-8 animate-slide-up" style={{ animationDelay: isSignUp ? '0.7s' : '0.6s' }}>
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
              <div className="relative flex justify-center text-sm"><span className="px-4 bg-[#0F172A] text-slate-500 font-medium rounded-full border border-white/5">Or connect with</span></div>
            </div>

            <div className="animate-slide-up" style={{ animationDelay: isSignUp ? '0.8s' : '0.7s' }}>
              <button
                onClick={handleGoogleSignIn} disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-3.5 px-4 border border-white/10 rounded-xl text-sm font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-all duration-300 focus:ring-2 focus:ring-primary outline-none"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                <span>Google</span>
              </button>
            </div>

            <div className="text-center mt-8 animate-slide-up" style={{ animationDelay: isSignUp ? '0.9s' : '0.8s' }}>
              <p className="text-sm text-slate-400">
                {isSignUp ? 'Already have access? ' : 'New to the platform? '}
                <button
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="font-bold text-primary hover:text-emerald-400 transition-colors outline-none border-b border-transparent hover:border-emerald-400 pb-0.5"
                >
                  {isSignUp ? 'Login' : 'Sign Up'}
                </button>
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;