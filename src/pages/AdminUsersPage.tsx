import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUsers, Admin, impersonateUser, addCredits, deleteUser, createAdminUser, updateUserStatus, getUserCompanies, loginAsUserCompany, Company } from '../utils/adminApi';
import AppLayout from '../components/AppLayout';
import Skeleton from '../components/Skeleton';
import {
  MagnifyingGlassIcon,
  ArrowPathIcon,
  UserGroupIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  PlusIcon,
  TrashIcon,
  BanknotesIcon,
  LockClosedIcon,
  LockOpenIcon,
  XMarkIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

const AdminUsersPage: React.FC = () => {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Credit modal
  const [editModal, setEditModal] = useState<{ userId: string; email: string } | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditDesc, setCreditDesc] = useState('');
  const [creditLoading, setCreditLoading] = useState(false);

  // Create user modal
  const [createModal, setCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', username: '', password: '' });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  // Companies modal
  const [companiesModal, setCompaniesModal] = useState<{ userId: string; email: string } | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);

  useEffect(() => {
    const adminData = localStorage.getItem('ziya-user');
    if (!adminData) { navigate('/login'); return; }
    const parsed = JSON.parse(adminData);
    if (parsed.role !== 'org_admin' && parsed.role !== 'super_admin') { navigate('/login'); return; }
    setAdmin(parsed);
  }, [navigate]);

  useEffect(() => {
    if (admin) fetchUsers();
  }, [pagination.page, search, admin]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const orgId = (admin?.role === 'org_admin' && (admin as any).organization_id) ? (admin as any).organization_id : null;
      const { users: data, pagination: pg } = await getUsers(pagination.page, pagination.limit, search, orgId);
      setUsers(data);
      setPagination(prev => ({ ...prev, ...pg }));
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3500);
  };

  const handleImpersonate = async (user: any) => {
    try {
      const result = await impersonateUser(user.id, admin?.id || '');
      if (result.success) {
        localStorage.setItem('ziya-impersonation-admin', JSON.stringify(admin));
        localStorage.setItem('ziya-user', JSON.stringify(result.user));
        showSuccess(`Logged in as ${result.user.email}. Redirecting...`);
        setTimeout(() => { window.location.href = '/dashboard'; }, 1000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to impersonate user');
    }
  };

  const handleAddCredits = async () => {
    if (!editModal || !creditAmount || parseFloat(creditAmount) <= 0) return;
    setCreditLoading(true);
    try {
      await addCredits(editModal.userId, parseFloat(creditAmount), creditDesc || 'Admin credit top-up', admin?.id || '');
      showSuccess(`Successfully added ${creditAmount} credits to ${editModal.email}`);
      setEditModal(null);
      setCreditAmount('');
      setCreditDesc('');
      fetchUsers(); // Refresh live data
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreditLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!createForm.email || !createForm.username || !createForm.password) {
      setCreateError('All fields are required');
      return;
    }
    setCreateLoading(true);
    setCreateError('');
    try {
      const orgId = (admin?.role === 'org_admin' && (admin as any).organization_id) ? (admin as any).organization_id : null;
      const result = await createAdminUser(createForm.email, createForm.username, createForm.password, orgId);
      if (result.success) {
        showSuccess(`User ${createForm.email} created successfully`);
        setCreateModal(false);
        setCreateForm({ email: '', username: '', password: '' });
        fetchUsers();
      }
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create user');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete ${email}? This cannot be undone.`)) return;
    try {
      await deleteUser(userId, admin?.id || '');
      showSuccess(`User ${email} has been deleted.`);
      fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to delete user');
    }
  };

  const handleToggleStatus = async (user: any) => {
    const newStatus = user.status === 'active' ? 'locked' : 'active';
    if (!window.confirm(`${newStatus === 'locked' ? 'Block' : 'Unblock'} ${user.email}?`)) return;
    try {
      await updateUserStatus(user.id, newStatus as any, admin?.id || '');
      showSuccess(`User ${user.email} is now ${newStatus}`);
      fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    }
  };

  const handleShowCompanies = async (user: any) => {
    try {
      setCompaniesLoading(true);
      setCompaniesModal({ userId: user.id, email: user.email });
      const userCompanies = await getUserCompanies(user.id);
      setCompanies(userCompanies);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch companies');
      setCompaniesModal(null);
    } finally {
      setCompaniesLoading(false);
    }
  };

  const handleLoginToCompany = async (companyId: string) => {
    if (!companiesModal) return;
    try {
      const result = await loginAsUserCompany(companiesModal.userId, companyId, admin?.id || '');
      if (result.success) {
        localStorage.setItem('ziya-impersonation-admin', JSON.stringify(admin));
        localStorage.setItem('ziya-user', JSON.stringify(result.user));
        showSuccess(`Logged in as ${result.user.email}. Redirecting...`);
        setTimeout(() => { window.location.href = '/dashboard'; }, 1000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to login to company');
    }
  };

  const formatCredits = (n: number) =>
    new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n || 0) + ' CR';
  const formatDate = (d: string) =>
    d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const toggleDropdown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setActiveDropdown(activeDropdown === id ? null : id);
  };

  if (!admin) return null;

  return (
    <AppLayout
      breadcrumbs={[{ label: 'Admin', path: '/admin/dashboard' }, { label: 'Customers' }]}
      pageTitle="Customers"
      pageDescription="Manage all your users, edit their credits, view details, and assist them."
      primaryAction={
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchUsers}
            className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-all font-bold text-sm shadow-sm"
          >
            <ArrowPathIcon className="w-4 h-4 mr-2" />
            Refresh
          </button>
          <button
            onClick={() => { setCreateForm({ email: '', username: '', password: '' }); setCreateError(''); setCreateModal(true); }}
            className="flex items-center px-5 py-2 bg-gradient-to-r from-primary to-blue-600 text-white rounded-xl font-black text-sm shadow-lg shadow-primary/20 hover:shadow-xl hover:scale-105 transition-all"
          >
            <PlusIcon className="w-4 h-4 mr-2" />
            Add Customer
          </button>
        </div>
      }
    >
      <div className="space-y-6 animate-in fade-in duration-500">
        {successMsg && (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30 rounded-2xl text-green-700 dark:text-green-400 text-sm font-medium flex items-center gap-2">
            <CheckIcon className="w-4 h-4" /> {successMsg}
          </div>
        )}
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-2xl text-red-700 dark:text-red-400 text-sm font-medium flex items-center gap-2">
            <XMarkIcon className="w-4 h-4" /> {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600"><XMarkIcon className="w-4 h-4" /></button>
          </div>
        )}

        <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-visible">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <UserGroupIcon className="w-6 h-6 text-primary" />
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">All Customers</h2>
              <span className="text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                {pagination.total} total
              </span>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); setPagination(prev => ({ ...prev, page: 1 })); }} className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
                <MagnifyingGlassIcon className="h-4 w-4" />
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by email or username..."
                className="pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all font-bold text-sm text-slate-900 dark:text-white w-full md:w-72 outline-none"
              />
            </form>
          </div>

          <div className="overflow-x-auto min-h-[400px]">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-900/50">
                  <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Name / Email</th>
                  <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Agents</th>
                  <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Companies</th>
                  <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Credits Left</th>
                  <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Credits Used</th>
                  <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Plan</th>
                  <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                  <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Joined</th>
                  <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 relative">
                {loading ? (
                  [...Array(6)].map((_, i) => (
                    <tr key={i}>
                      <td className="px-5 py-4"><Skeleton width={160} height={14} /></td>
                      <td className="px-5 py-4 text-center"><Skeleton width={40} height={14} className="mx-auto" /></td>
                      <td className="px-5 py-4 text-center"><Skeleton width={40} height={14} className="mx-auto" /></td>
                      <td className="px-5 py-4 text-center"><Skeleton width={80} height={14} className="mx-auto" /></td>
                      <td className="px-5 py-4 text-center"><Skeleton width={80} height={14} className="mx-auto" /></td>
                      <td className="px-5 py-4 text-center"><Skeleton width={60} height={20} className="mx-auto" /></td>
                      <td className="px-5 py-4 text-center"><Skeleton width={60} height={20} className="mx-auto" /></td>
                      <td className="px-5 py-4"><Skeleton width={90} height={14} /></td>
                      <td className="px-5 py-4 text-right"><Skeleton width={100} height={32} className="ml-auto" /></td>
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center text-slate-400 font-bold">
                      No customers found{search ? ` for "${search}"` : ''}
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors group">
                      {/* Name / Email */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-black text-sm flex-shrink-0">
                            {(user.username || user.email || '?').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">
                              {user.username || '—'}
                            </div>
                            <div className="text-[11px] text-slate-400 font-medium">{user.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Agents Count */}
                      <td className="px-5 py-4 whitespace-nowrap text-center text-sm font-bold text-slate-600 dark:text-slate-300">
                        {user.agents_count || 0}
                      </td>

                      {/* Companies Count */}
                      <td className="px-5 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => handleShowCompanies(user)}
                          className="px-3 py-1.5 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 rounded-lg font-bold text-sm transition-colors"
                        >
                          {user.companies_count || 0} {(user.companies_count || 0) === 1 ? 'Company' : 'Companies'}
                        </button>
                      </td>

                      {/* Credits Left */}
                      <td className="px-5 py-4 whitespace-nowrap text-center">
                        <span className="text-emerald-500 font-bold text-sm">
                          {formatCredits(parseFloat(user.credits_balance || '0'))}
                        </span>
                      </td>

                      {/* Credits Used */}
                      <td className="px-5 py-4 whitespace-nowrap text-center text-slate-400 font-bold text-sm">
                        {formatCredits(parseFloat(user.credits_used || '0'))}
                      </td>

                      {/* Plan */}
                      <td className="px-5 py-4 whitespace-nowrap text-center">
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-black bg-purple-500/20 text-purple-400 uppercase tracking-wider">
                          {user.plan_type || 'TRIAL'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4 whitespace-nowrap text-center">
                        <div className={`inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                          user.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                            : user.status === 'locked'
                            ? 'bg-red-500/10 text-red-500 border-red-500/20'
                            : 'bg-slate-500/10 text-slate-500 border-slate-500/20'
                        }`}>
                          <div className={`h-1.5 w-1.5 rounded-full mr-2 ${
                            user.status === 'active' ? 'bg-emerald-500' : user.status === 'locked' ? 'bg-red-500' : 'bg-slate-400'
                          }`} />
                          {user.status || 'active'}
                        </div>
                      </td>

                      {/* Joined */}
                      <td className="px-5 py-4 whitespace-nowrap text-sm font-bold text-slate-300">
                        {formatDate(user.created_at)}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* View Details button removed */}

                          {/* More Options Dropdown */}
                          <div className="relative">
                            <button
                              onClick={(e) => toggleDropdown(e, user.id)}
                              className={`p-1.5 rounded-lg transition-all border ${activeDropdown === user.id ? 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white' : 'bg-slate-50 dark:bg-slate-900/50 text-slate-400 border-slate-100 dark:border-slate-800 hover:text-slate-600 dark:hover:text-slate-300'}`}
                            >
                              <EllipsisVerticalIcon className="w-4 h-4" />
                            </button>

                            {activeDropdown === user.id && (
                              <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="py-1">
                                  {/* View Details dropdown item removed */}
                                  <button
                                    onClick={() => { handleImpersonate(user); setActiveDropdown(null); }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                  >
                                    <ArrowPathIcon className="w-4 h-4 text-indigo-500" />
                                    <span>Login as User</span>
                                  </button>
                                  {(user.companies_count || 0) > 0 && (
                                    <button
                                      onClick={() => { handleShowCompanies(user); setActiveDropdown(null); }}
                                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                    >
                                      <EyeIcon className="w-4 h-4 text-blue-500" />
                                      <span>Login to Company</span>
                                    </button>
                                  )}
                                  <button
                                    onClick={() => { setEditModal({ userId: user.id, email: user.email }); setActiveDropdown(null); }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                  >
                                    <BanknotesIcon className="w-4 h-4 text-emerald-500" />
                                    <span>Assign Credits</span>
                                  </button>
                                  <button
                                    onClick={() => { handleToggleStatus(user); setActiveDropdown(null); }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                  >
                                    {user.status === 'active'
                                      ? <><LockClosedIcon className="w-4 h-4 text-amber-500" /><span>Block User</span></>
                                      : <><LockOpenIcon className="w-4 h-4 text-emerald-500" /><span>Unblock User</span></>
                                    }
                                  </button>
                                  <div className="h-px bg-slate-100 dark:bg-slate-700 my-1" />
                                  <button
                                    onClick={() => { handleDeleteUser(user.id, user.email); setActiveDropdown(null); }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                  >
                                    <TrashIcon className="w-4 h-4" />
                                    <span>Delete Account</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pagination.totalPages > 1 && (
            <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} users)
              </p>
              <div className="flex space-x-2">
                <button
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                  disabled={pagination.page === 1}
                  className="px-4 py-2 bg-slate-50 dark:bg-slate-900 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 disabled:opacity-50 hover:bg-slate-100 transition-all border border-slate-100 dark:border-slate-800"
                >Prev</button>
                <button
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                  disabled={pagination.page === pagination.totalPages}
                  className="px-4 py-2 bg-slate-50 dark:bg-slate-900 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 disabled:opacity-50 hover:bg-slate-100 transition-all border border-slate-100 dark:border-slate-800"
                >Next</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Assign Credits Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-8 relative">
            <button onClick={() => setEditModal(null)} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition-all">
              <XMarkIcon className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">Assign Credits</h3>
            <p className="text-sm text-slate-500 mb-6 font-medium">To <strong className="text-slate-800 dark:text-slate-200">{editModal.email}</strong></p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 block">Amount (Credits)</label>
                <input type="number" min="1" step="1" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)}
                  placeholder="e.g. 1500"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white font-bold text-sm focus:ring-2 focus:ring-primary/40 outline-none transition-all" />
              </div>
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 block">Description (Optional)</label>
                <input type="text" value={creditDesc} onChange={(e) => setCreditDesc(e.target.value)} placeholder="Reason for credit assignment..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white font-bold text-sm focus:ring-2 focus:ring-primary/40 outline-none transition-all" />
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={() => setEditModal(null)} className="flex-1 py-3 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">Cancel</button>
              <button onClick={handleAddCredits} disabled={creditLoading || !creditAmount || parseFloat(creditAmount) <= 0}
                className="flex-1 py-3 bg-gradient-to-r from-primary to-blue-600 text-white rounded-2xl font-black text-sm shadow-lg shadow-primary/20 hover:shadow-xl disabled:opacity-50 transition-all">
                {creditLoading ? 'Assigning...' : 'Assign Credits'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {createModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-8 w-full max-w-md mx-4 border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black text-slate-900 dark:text-white">Add New Customer</h3>
              <button onClick={() => setCreateModal(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            {createError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm font-medium">{createError}</div>
            )}
            <div className="space-y-4">
              {[
                { key: 'email', label: 'Email Address', type: 'email', placeholder: 'user@company.com' },
                { key: 'username', label: 'Username', type: 'text', placeholder: 'john_doe' },
                { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
              ].map((field) => (
                <div key={field.key}>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{field.label}</label>
                  <input type={field.type} value={(createForm as any)[field.key]}
                    onChange={(e) => setCreateForm(f => ({ ...f, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary outline-none font-medium text-slate-900 dark:text-white placeholder-slate-400 transition-all" />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setCreateModal(false)} disabled={createLoading}
                className="flex-1 py-3 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleCreateUser} disabled={createLoading}
                className="flex-1 py-3 bg-gradient-to-r from-primary to-blue-600 text-white rounded-xl font-black shadow-lg shadow-primary/30 hover:shadow-xl transition-all disabled:opacity-60">
                {createLoading ? 'Creating...' : 'Add Customer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Companies Modal */}
      {companiesModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-8 relative">
            <button onClick={() => setCompaniesModal(null)} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition-all">
              <XMarkIcon className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">Select Company</h3>
            <p className="text-sm text-slate-500 mb-6 font-medium">Login as <strong className="text-slate-800 dark:text-slate-200">{companiesModal.email}</strong></p>
            
            {companiesLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} width="100%" height={40} className="rounded-lg" />
                ))}
              </div>
            ) : companies.length === 0 ? (
              <p className="text-center text-slate-400 py-8">No companies found for this user</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {companies.map((company) => (
                  <button
                    key={company.id}
                    onClick={() => handleLoginToCompany(company.id)}
                    className="w-full p-3 text-left bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-lg transition-all font-bold text-slate-900 dark:text-white text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span>{company.name}</span>
                      <span className="text-[10px] text-slate-400">ID: {company.id.substring(0, 8)}...</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default AdminUsersPage;
