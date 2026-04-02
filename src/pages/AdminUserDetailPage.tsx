import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getUserDetails, setServiceLimit, updateBillingStatus, Admin, updateUserStatus, resetUserPassword, getUserResources, impersonateUser } from '../utils/adminApi';
import { getApiBaseUrl, getApiPath } from '../utils/api';
import AppLayout from '../components/AppLayout';
import KPICard from '../components/KPICard';
import Skeleton from '../components/Skeleton';
import {
  UserIcon,
  ArrowLeftIcon,
  CreditCardIcon,
  ShieldCheckIcon,
  ChartBarSquareIcon,
  ClockIcon,
  PlusIcon,
  BanknotesIcon,
  LockClosedIcon,
  LockOpenIcon,
  KeyIcon,
  CpuChipIcon,
  SignalIcon,
  RectangleStackIcon,
  PencilSquareIcon,
  CheckIcon,
  XMarkIcon,
  EyeIcon
} from '@heroicons/react/24/outline';

const AdminUserDetailPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [user, setUser] = useState<any>(null);
  const [limits, setLimits] = useState<any>({});
  const [usage, setUsage] = useState<any[]>([]);
  const [billing, setBilling] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditDescription, setCreditDescription] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isAdminResetting, setIsAdminResetting] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'resources' | 'billing'>('details');
  const [userAgents, setUserAgents] = useState<any[]>([]);
  const [userCampaigns, setUserCampaigns] = useState<any[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);

  // Form states for service limits
  const [editingService, setEditingService] = useState<string | null>(null);
  const [limitForm, setLimitForm] = useState({
    monthlyLimit: '',
    dailyLimit: '',
    isEnabled: true
  });

  useEffect(() => {
    const adminData = localStorage.getItem('ziya-user');
    if (!adminData) {
      navigate('/login');
      return;
    }
    const parsed = JSON.parse(adminData);
    if (parsed.role !== 'org_admin' && parsed.role !== 'super_admin') {
      navigate('/login');
      return;
    }

    setAdmin(parsed);
    fetchUserDetails();
  }, [userId, navigate]);

  const fetchUserDetails = async () => {
    try {
      setLoading(true);
      const data = await getUserDetails(userId!);
      setUser(data.user);
      setLimits(data.limits);
      setUsage(data.usage);
      setBilling(data.billing);

      // Fetch resources in background
      fetchResources();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchResources = async () => {
    try {
      setLoadingResources(true);
      const data = await getUserResources(userId!);
      setUserAgents(data.agents);
      setUserCampaigns(data.campaigns);
    } catch (err: any) {
      console.error('Error fetching resources:', err);
    } finally {
      setLoadingResources(false);
    }
  };

  const handleEditService = (serviceName: string) => {
    setEditingService(serviceName);
    const limit = limits[serviceName];
    setLimitForm({
      monthlyLimit: limit?.monthly_limit?.toString() ?? '',
      dailyLimit: limit?.daily_limit?.toString() ?? '',
      isEnabled: limit?.is_enabled ?? true
    });
  };

  const handleSaveLimit = async (serviceName: string) => {
    try {
      await setServiceLimit(
        userId!,
        serviceName,
        limitForm.monthlyLimit ? parseFloat(limitForm.monthlyLimit) : null,
        limitForm.dailyLimit ? parseFloat(limitForm.dailyLimit) : null,
        limitForm.isEnabled,
        admin!.id
      );

      setSuccessMessage(`${serviceName} limits updated successfully`);
      setTimeout(() => setSuccessMessage(''), 3000);
      setEditingService(null);
      await fetchUserDetails();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateBillingStatus = async (billingId: string, status: string) => {
    try {
      await updateBillingStatus(billingId, status, '', admin!.id);
      setSuccessMessage('Billing status updated successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
      await fetchUserDetails();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleStatus = async () => {
    const newStatus = user.status === 'active' ? 'locked' : 'active';
    const confirmMsg = `Are you sure you want to ${newStatus === 'locked' ? 'LOCK' : 'UNLOCK'} access for ${user.email}?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setLoading(true);
      await updateUserStatus(user.id, newStatus, admin!.id);
      setSuccessMessage(`User status successfully updated to ${newStatus}`);
      setTimeout(() => setSuccessMessage(''), 3000);
      await fetchUserDetails();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      setIsAdminResetting(true);
      await resetUserPassword(user.id, newPassword, admin!.id);
      setSuccessMessage('User password has been administratively reset');
      setNewPassword('');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAdminResetting(false);
    }
  };

  const formatCredits = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount) + ' CR';
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getServiceUsage = (serviceName: string) => {
    const serviceUsage = usage.find(u => u.service_name === serviceName);
    return serviceUsage ? serviceUsage.total_usage : 0;
  };

  const handleAddCredits = async () => {
    try {
      const apiUrl = getApiBaseUrl();
      const response = await fetch(`${apiUrl}${getApiPath()}/admin/wallet/add-credits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          amount: parseFloat(creditAmount),
          description: creditDescription,
          adminId: admin!.id
        })
      });

      const result = await response.json();
      if (result.success) {
        setSuccessMessage(`Successfully added ${creditAmount} CR to user wallet`);
        setTimeout(() => setSuccessMessage(''), 3000);
        fetchUserDetails();
        setCreditAmount('');
        setCreditDescription('');
      }
    } catch (error) {
      console.error('Error adding credits:', error);
      setError('Failed to add credits');
    }
  };

  const handleImpersonate = async () => {
    if (!window.confirm(`Log in as ${user.email}? This will start an impersonation session.`)) return;
    try {
      const result = await impersonateUser(user.id, admin!.id);
      if (result.success) {
        // Store original admin session for return
        localStorage.setItem('ziya-impersonation-admin', JSON.stringify(admin));
        localStorage.setItem('ziya-user', JSON.stringify(result.user));
        window.location.href = '/dashboard';
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start impersonation session');
    }
  };

  if (loading && !user) {
    return (
      <AppLayout
        breadcrumbs={[{ label: 'Admin', path: '/admin/dashboard' }, { label: 'User Details' }]}
        pageTitle="User Details"
        pageDescription="Loading user profile..."
      >
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="bg-white dark:bg-slate-800/50 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton width={80} height={12} />
                  <Skeleton width={180} height={20} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!user) {
    return (
      <AppLayout
        breadcrumbs={[{ label: 'Admin', path: '/admin/dashboard' }, { label: 'User Details' }]}
        pageTitle="User Not Found"
        pageDescription="The requested user could not be located."
      >
        <div className="text-center py-20 bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <UserIcon className="h-16 w-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-bold">User with ID {userId} does not exist.</p>
          <button onClick={() => navigate('/admin/dashboard')} className="mt-6 text-primary font-black hover:underline uppercase tracking-widest text-sm">
            Back to Dashboard
          </button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      breadcrumbs={[
        { label: 'Admin', path: '/admin/dashboard' },
        { label: 'User Management', path: '/admin/dashboard' },
        { label: user.email }
      ]}
      pageTitle="User Details"
      pageDescription={`Comprehensive profile for ${user.username || user.email}`}
      primaryAction={
        <button
          onClick={() => navigate('/admin/dashboard')}
          className="flex items-center px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-all font-bold text-sm"
        >
          <ArrowLeftIcon className="w-4 h-4 mr-2" />
          Back
        </button>
      }
    >
      <div className="space-y-8 animate-in fade-in duration-500">
        {/* Status Messages */}
        {successMessage && (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30 rounded-2xl text-green-700 dark:text-green-400 text-sm font-medium flex items-center">
            <CheckIcon className="h-4 w-4 mr-2" />
            {successMessage}
          </div>
        )}
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-2xl text-red-700 dark:text-red-400 text-sm font-medium flex items-center">
            <XMarkIcon className="h-4 w-4 mr-2" />
            {error}
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-1">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-4 py-2 text-xs font-black uppercase tracking-widest transition-all rounded-t-xl ${activeTab === 'details' ? 'bg-primary/10 text-primary border-b-2 border-primary' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
          >
            Core Details & Limits
          </button>
          <button
            onClick={() => setActiveTab('resources')}
            className={`px-4 py-2 text-xs font-black uppercase tracking-widest transition-all rounded-t-xl ${activeTab === 'resources' ? 'bg-primary/10 text-primary border-b-2 border-primary' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
          >
            Resource Inventory
          </button>
          <button
            onClick={() => setActiveTab('billing')}
            className={`px-4 py-2 text-xs font-black uppercase tracking-widest transition-all rounded-t-xl ${activeTab === 'billing' ? 'bg-primary/10 text-primary border-b-2 border-primary' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
          >
            Financial History
          </button>
        </div>

        {activeTab === 'details' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* User Info & Wallet Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main Info */}
              <div className="lg:col-span-2 bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-all hover:shadow-md">
                <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Personal Details</h3>
                  <UserIcon className="h-5 w-5 text-slate-400" />
                </div>
                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Address</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white truncate">{user.email}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Username</p>
                    <div className="flex items-center space-x-2">
                      <p className="text-lg font-bold text-primary truncate">{user.username || 'N/A'}</p>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-500'}`}>
                        {user.role || 'user'}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">System Identifier</p>
                    <p className="text-xs font-mono font-medium text-slate-500 bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded-md inline-block">{user.id}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Joined Platform</p>
                    <div className="flex items-center text-slate-700 dark:text-slate-300 font-bold">
                      <ClockIcon className="h-4 w-4 mr-2 text-slate-400" />
                      {formatDate(user.created_at)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Balance */}
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-8 text-white shadow-xl shadow-emerald-500/20 flex flex-col justify-between overflow-hidden relative">
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-2 opacity-80">
                    <span className="text-[11px] font-black uppercase tracking-widest">Wallet Balance</span>
                    <CreditCardIcon className="h-6 w-6" />
                  </div>
                  <h2 className="text-4xl font-black">{formatCredits(parseFloat(user.wallet_balance || '0'))}</h2>
                </div>

                <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white/10 rounded-full blur-3xl"></div>

                <div className="mt-8 space-y-4 pt-8 border-t border-white/10 relative z-10">
                  <div className="relative group">
                    <input
                      type="number"
                      step="0.01"
                      value={creditAmount}
                      onChange={(e) => setCreditAmount(e.target.value)}
                      placeholder="Add Credits..."
                      className="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/40 transition-all font-bold text-sm"
                    />
                  </div>
                  <button
                    onClick={handleAddCredits}
                    className="w-full bg-white text-emerald-600 hover:bg-emerald-50 py-3 rounded-2xl transition-all font-black text-sm shadow-lg flex items-center justify-center gap-2"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Update Wallet
                  </button>
                </div>
              </div>
            </div>

            {/* Account Controls, Security & Impersonation */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Access Control */}
              <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-all hover:shadow-md">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Access Control</h3>
                  <ShieldCheckIcon className="h-5 w-5 text-slate-300" />
                </div>
                <div className="p-8">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <p className="text-sm font-bold text-slate-800 dark:text-white mb-1">Account Status</p>
                      <p className="text-xs text-slate-500">Enable or disable login permissions.</p>
                    </div>
                    {user.status === 'locked' ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 uppercase tracking-widest border border-red-100 dark:border-red-800/50">
                        <LockClosedIcon className="w-3 h-3 mr-1" /> Locked
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 uppercase tracking-widest border border-emerald-100 dark:border-emerald-800/50">
                        <CheckIcon className="w-3 h-3 mr-1" /> Active
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleToggleStatus}
                    className={`w-full py-4 rounded-2xl transition-all font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 ${user.status === 'active'
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100'
                      : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100'}`}
                  >
                    {user.status === 'active' ? (
                      <>
                        <LockClosedIcon className="h-4 w-4" />
                        Block Access
                      </>
                    ) : (
                      <>
                        <LockOpenIcon className="h-4 w-4" />
                        Restore Access
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Password Reset */}
              <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-all hover:shadow-md">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Administrative Reset</h3>
                  <KeyIcon className="h-5 w-5 text-slate-300" />
                </div>
                <div className="p-8">
                  <p className="text-sm font-bold text-slate-800 dark:text-white mb-1">Password Override</p>
                  <p className="text-xs text-slate-500 mb-6">Force a new secure password.</p>

                  <div className="space-y-4">
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New Secure Password..."
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 py-4 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all font-bold text-sm"
                    />
                    <button
                      onClick={handleResetPassword}
                      disabled={isAdminResetting || !newPassword}
                      className="w-full bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 py-4 rounded-2xl transition-all font-black text-xs uppercase tracking-widest hover:bg-slate-900 dark:hover:bg-white disabled:opacity-50 flex items-center justify-center gap-2 shadow-xl shadow-slate-900/20"
                    >
                      {isAdminResetting ? 'Processing...' : (
                        <>
                          <SignalIcon className="h-4 w-4" />
                          Apply New Password
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* User Impersonation */}
              <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-all hover:shadow-md">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Session Oversight</h3>
                  <EyeIcon className="h-5 w-5 text-slate-300" />
                </div>
                <div className="p-8">
                  <p className="text-sm font-bold text-slate-800 dark:text-white mb-1">Login as User</p>
                  <p className="text-xs text-slate-500 mb-6">Transition into this user's account session for technical assistance.</p>

                  <div className="mt-auto">
                    <button
                      onClick={handleImpersonate}
                      className="w-full bg-primary text-white py-4 rounded-2xl transition-all font-black text-xs uppercase tracking-widest hover:bg-primary-dark flex items-center justify-center gap-2 shadow-xl shadow-primary/20"
                    >
                      <EyeIcon className="h-4 w-4" />
                      Enter User Session
                    </button>
                    <p className="mt-4 text-[10px] text-center text-slate-400 font-bold uppercase tracking-tighter">Requires High-Level Clearance</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Service Limits */}
            <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center">
                  <RectangleStackIcon className="h-6 w-6 text-primary mr-3" />
                  <h2 className="text-lg font-bold text-slate-800 dark:text-white">API Service Controls</h2>
                </div>
              </div>

              <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                {['elevenlabs', 'gemini', 'deepgram'].map((serviceName) => {
                  const limit = limits[serviceName] || {};
                  const currentUsage = getServiceUsage(serviceName);
                  const isEditing = editingService === serviceName;

                  return (
                    <div key={serviceName} className={`relative rounded-3xl border-2 p-6 transition-all duration-300 ${isEditing ? 'border-primary bg-primary/5' : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'}`}>
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">{serviceName}</h3>
                          <div className="mt-1 flex items-center">
                            <span className={`h-2 w-2 rounded-full mr-2 ${limit.is_enabled !== false ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
                              {limit.is_enabled !== false ? 'Monitoring Active' : 'Enforcement Off'}
                            </span>
                          </div>
                        </div>
                        {!isEditing && (
                          <button onClick={() => handleEditService(serviceName)} className="p-2 text-slate-400 hover:text-primary transition-colors">
                            <PencilSquareIcon className="h-5 w-5" />
                          </button>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Monthly</label>
                            <input
                              type="number"
                              value={limitForm.monthlyLimit}
                              onChange={(e) => setLimitForm({ ...limitForm, monthlyLimit: e.target.value })}
                              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 text-sm font-bold"
                              placeholder="Unlimited"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Daily</label>
                            <input
                              type="number"
                              value={limitForm.dailyLimit}
                              onChange={(e) => setLimitForm({ ...limitForm, dailyLimit: e.target.value })}
                              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 text-sm font-bold"
                              placeholder="Unlimited"
                            />
                          </div>
                          <div className="flex items-center space-x-2 pt-2">
                            <input
                              type="checkbox"
                              id={`enabled-${serviceName}`}
                              checked={limitForm.isEnabled}
                              onChange={(e) => setLimitForm({ ...limitForm, isEnabled: e.target.checked })}
                              className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4"
                            />
                            <label htmlFor={`enabled-${serviceName}`} className="text-xs font-bold text-slate-600 dark:text-slate-400">Enforce limits</label>
                          </div>
                          <div className="flex space-x-2 pt-2">
                            <button onClick={() => handleSaveLimit(serviceName)} className="flex-1 bg-primary text-white py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary-dark shadow-lg shadow-primary/20 transition-all">Save</button>
                            <button onClick={() => setEditingService(null)} className="flex-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-300 transition-all">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          <div className="flex justify-between items-end border-b border-slate-100 dark:border-slate-800 pb-3">
                            <div>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Consumption</p>
                              <p className="text-xl font-black text-slate-900 dark:text-white">{formatNumber(currentUsage)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Monthly Peak</p>
                              <p className="text-[11px] font-black text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded-md">
                                {limit.monthly_limit ? formatNumber(limit.monthly_limit) : '∞'}
                              </p>
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Daily Cap</p>
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                              {limit.daily_limit ? formatNumber(limit.daily_limit) : 'Unlimited Allowances'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'resources' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Resource Inventory */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* User Agents */}
              <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-all hover:shadow-md">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center">
                    <CpuChipIcon className="h-5 w-5 text-primary mr-3" />
                    <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">User Agents</h3>
                  </div>
                  <span className="bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded text-[10px] font-black text-slate-500">{userAgents.length}</span>
                </div>
                <div className="p-0">
                  {loadingResources ? (
                    <div className="p-8 space-y-4">
                      {[...Array(3)].map((_, i) => <Skeleton key={i} width="100%" height={60} className="rounded-2xl" />)}
                    </div>
                  ) : userAgents.length === 0 ? (
                    <div className="p-12 text-center">
                      <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">No agents created yet</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50 dark:divide-slate-800">
                      {userAgents.map((agent) => (
                        <div key={agent.id} className="p-6 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">{agent.name}</h4>
                            <p className="text-[10px] text-slate-400 font-medium">Created {formatDate(agent.created_at)}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter ${agent.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {agent.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* User Campaigns */}
              <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-all hover:shadow-md">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center">
                    <SignalIcon className="h-5 w-5 text-primary mr-3" />
                    <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">Global Campaigns</h3>
                  </div>
                  <span className="bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded text-[10px] font-black text-slate-500">{userCampaigns.length}</span>
                </div>
                <div className="p-0">
                  {loadingResources ? (
                    <div className="p-8 space-y-4">
                      {[...Array(3)].map((_, i) => <Skeleton key={i} width="100%" height={60} className="rounded-2xl" />)}
                    </div>
                  ) : userCampaigns.length === 0 ? (
                    <div className="p-12 text-center">
                      <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">No campaigns launched</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50 dark:divide-slate-800">
                      {userCampaigns.map((camp) => (
                        <div key={camp.id} className="p-6 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">{camp.name}</h4>
                            <p className="text-[10px] text-slate-400 font-medium">Launched {formatDate(camp.created_at)}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter ${camp.status === 'running' ? 'bg-emerald-100 text-emerald-700' :
                            camp.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                              'bg-slate-100 text-slate-500'
                            }`}>
                            {camp.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'billing' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Billing History Section */}
            <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center">
                  <BanknotesIcon className="h-6 w-6 text-primary mr-3" />
                  <h2 className="text-lg font-bold text-slate-800 dark:text-white">Financial History</h2>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50">
                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoice Period</th>
                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Usage Breakdown (CR)</th>
                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Bill</th>
                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {billing.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-8 py-12 text-center text-slate-400 font-bold">No historical records available.</td>
                      </tr>
                    ) : (
                      billing.map((bill) => (
                        <tr key={bill.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                          <td className="px-8 py-6 whitespace-nowrap">
                            <div className="text-sm font-bold text-slate-900 dark:text-white">
                              {formatDate(bill.billing_period_start)}
                            </div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                              To {formatDate(bill.billing_period_end)}
                            </div>
                          </td>
                          <td className="px-8 py-6 whitespace-nowrap">
                            <div className="flex items-center space-x-3 text-[11px] font-bold text-slate-500">
                              <span title="ElevenLabs">11L: {formatCredits(bill.elevenlabs_usage)}</span>
                              <span className="text-slate-300">|</span>
                              <span title="Gemini">Gem: {formatCredits(bill.gemini_usage)}</span>
                              <span className="text-slate-300">|</span>
                              <span title="Deepgram">DG: {formatCredits(bill.deepgram_usage)}</span>
                            </div>
                          </td>
                          <td className="px-8 py-6 whitespace-nowrap">
                            <div className="text-lg font-black text-slate-900 dark:text-white">
                              {formatCredits(bill.total_amount)}
                            </div>
                          </td>
                          <td className="px-8 py-6 whitespace-nowrap text-sm">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${bill.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                              bill.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                              {bill.status}
                            </span>
                          </td>
                          <td className="px-8 py-6 whitespace-nowrap text-right">
                            {bill.status === 'pending' && (
                              <select
                                onChange={(e) => handleUpdateBillingStatus(bill.id, e.target.value)}
                                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-primary/40 transition-all cursor-pointer"
                                defaultValue=""
                              >
                                <option value="" disabled>Update Status</option>
                                <option value="paid">Mark Paid</option>
                                <option value="overdue">Mark Overdue</option>
                                <option value="cancelled">Cancel</option>
                              </select>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default AdminUserDetailPage;
