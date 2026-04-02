import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import {
    UsersIcon,
    ArrowPathIcon,
    MagnifyingGlassIcon,
    LockClosedIcon,
    LockOpenIcon,
    TrashIcon,
    ArrowLeftOnRectangleIcon,
    PlusCircleIcon,
} from '@heroicons/react/24/outline';
import { listIndividualUsers, deleteIndividualUser, impersonateUser, blockUser } from '../utils/superAdminApi';
import { listPlans, assignPlanToUser, addCredits } from '../utils/adminApi';

const SuperAdminIndividualUsersPage: React.FC = () => {
    const navigate = useNavigate();
    const [users, setUsers] = useState<any[]>([]);
    const [plans, setPlans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });

    // Plan assignment state
    const [assigningPlan, setAssigningPlan] = useState<string | null>(null);
    const [selectedPlan, setSelectedPlan] = useState<Record<string, string>>({});

    // Add credits state
    const [creditModal, setCreditModal] = useState<{ userId: string; email: string } | null>(null);
    const [creditAmount, setCreditAmount] = useState('');
    const [creditLoading, setCreditLoading] = useState(false);

    const userStr = localStorage.getItem('ziya-user');
    const currentUser = userStr ? JSON.parse(userStr) : null;

    useEffect(() => {
        if (!currentUser || currentUser.role !== 'super_admin') { navigate('/login'); return; }
        fetchAll();
    }, []);

    const fetchAll = async (page = 1) => {
        setLoading(true);
        setError('');
        try {
            const [userData, planData] = await Promise.all([
                listIndividualUsers(page, 50, search),
                listPlans(),
            ]);
            setUsers(userData.users);
            setPagination(userData.pagination);
            setPlans(planData);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const showSuccess = (msg: string) => {
        setSuccess(msg);
        setTimeout(() => setSuccess(''), 3000);
    };

    const handleBlock = async (userId: string, currentStatus: string) => {
        const newStatus = currentStatus === 'active' ? 'locked' : 'active';
        if (!window.confirm(`${newStatus === 'locked' ? 'Block' : 'Unblock'} this user?`)) return;
        try {
            await blockUser(userId, newStatus as 'active' | 'locked');
            showSuccess(`User ${newStatus === 'locked' ? 'blocked' : 'unblocked'} successfully.`);
            fetchAll(pagination.page);
        } catch (err: any) { setError(err.message); }
    };

    const handleDelete = async (user: any) => {
        if (!window.confirm(`Permanently delete ${user.email}? This cannot be undone.`)) return;
        try {
            await deleteIndividualUser(user.id);
            showSuccess(`User ${user.email} deleted.`);
            fetchAll(pagination.page);
        } catch (err: any) { setError(err.message); }
    };

    const handleAssignPlan = async (userId: string) => {
        const planId = selectedPlan[userId];
        if (!planId) { alert('Please select a plan first.'); return; }
        setAssigningPlan(userId);
        try {
            await assignPlanToUser(userId, planId, currentUser?.id || 'superadmin');
            showSuccess('Plan assigned successfully.');
            fetchAll(pagination.page);
        } catch (err: any) { setError(err.message); }
        finally { setAssigningPlan(null); }
    };

    const handleImpersonate = async (userId: string) => {
        try {
            const user = await impersonateUser(userId);
            const currentUserStr = localStorage.getItem('ziya-user');
            localStorage.setItem('ziya-original-superadmin', currentUserStr!);
            localStorage.setItem('ziya-user', JSON.stringify(user));
            window.location.href = '/dashboard';
        } catch (err: any) { alert(err.message); }
    };

    const handleAddCredits = async () => {
        if (!creditModal || !creditAmount || parseFloat(creditAmount) <= 0) return;
        setCreditLoading(true);
        try {
            await addCredits(creditModal.userId, parseFloat(creditAmount), 'Super Admin credit top-up', currentUser?.id || '');
            showSuccess(`Added ${creditAmount} credits to ${creditModal.email}.`);
            setCreditModal(null);
            setCreditAmount('');
            fetchAll(pagination.page);
        } catch (err: any) { setError(err.message); }
        finally { setCreditLoading(false); }
    };

    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Super Admin', path: '/superadmin/dashboard' },
                { label: 'Individual Users' },
            ]}
            pageTitle="Individual Users"
            pageDescription="Manage all individual signup users. Block, delete, assign plans, add credits, or impersonate."
            primaryAction={
                <button onClick={() => fetchAll(1)} className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 font-bold text-sm hover:bg-slate-50 transition-all">
                    <ArrowPathIcon className="w-4 h-4 mr-2" /> Refresh
                </button>
            }
        >
            <div className="space-y-6 animate-in fade-in duration-500">

                {/* Alerts */}
                {error && <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl text-red-700 dark:text-red-400 text-sm font-medium">{error}</div>}
                {success && <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-emerald-700 dark:text-emerald-400 text-sm font-medium">{success}</div>}

                {/* Search */}
                <form onSubmit={(e) => { e.preventDefault(); fetchAll(1); }} className="flex gap-3 max-w-lg">
                    <div className="relative flex-1">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by email or username..."
                            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-violet-500 outline-none text-sm font-medium text-slate-900 dark:text-white"
                        />
                    </div>
                    <button type="submit" className="px-4 py-2.5 bg-violet-500 text-white rounded-xl font-bold text-sm hover:bg-violet-600 transition-all">Search</button>
                </form>

                <div className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                    {pagination.total} individual user{pagination.total !== 1 ? 's' : ''} found
                </div>

                {/* Table */}
                <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="p-8 space-y-4">
                            {[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-slate-100 dark:bg-slate-700/50 rounded-xl animate-pulse" />)}
                        </div>
                    ) : users.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <UsersIcon className="w-12 h-12 mb-4 text-slate-300 dark:text-slate-600" />
                            <p className="font-bold text-slate-500 dark:text-slate-400">No individual users found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-100 dark:border-slate-800">
                                        <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">User</th>
                                        <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Credits</th>
                                        <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Plan</th>
                                        <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                                        <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Assign Plan</th>
                                        <th className="text-right px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {users.map((user) => (
                                        <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400 font-black text-sm flex-shrink-0">
                                                        {(user.username || user.email).charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-slate-900 dark:text-white text-sm">{user.username}</p>
                                                        <p className="text-xs text-slate-400">{user.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{(user.credits_balance || 0).toLocaleString()} CR</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-lg">
                                                    {user.plan_type || 'None'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${user.status === 'active' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                                    {user.status || 'active'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        value={selectedPlan[user.id] || ''}
                                                        onChange={(e) => setSelectedPlan(p => ({ ...p, [user.id]: e.target.value }))}
                                                        className="px-2 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none font-medium text-slate-900 dark:text-white"
                                                    >
                                                        <option value="">Select plan</option>
                                                        {plans.map(p => <option key={p.id} value={p.id}>{p.plan_name}</option>)}
                                                    </select>
                                                    <button
                                                        onClick={() => handleAssignPlan(user.id)}
                                                        disabled={assigningPlan === user.id || !selectedPlan[user.id]}
                                                        className="px-2.5 py-1.5 bg-violet-500 hover:bg-violet-600 text-white rounded-lg text-xs font-bold disabled:opacity-50 transition-all"
                                                    >
                                                        {assigningPlan === user.id ? '...' : 'Assign'}
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex justify-end gap-1">
                                                    {/* Add Credits */}
                                                    <button
                                                        onClick={() => { setCreditModal({ userId: user.id, email: user.email }); setCreditAmount(''); }}
                                                        className="p-2 rounded-xl text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all"
                                                        title="Add Credits"
                                                    >
                                                        <PlusCircleIcon className="w-4 h-4" />
                                                    </button>
                                                    {/* Block/Unblock */}
                                                    <button
                                                        onClick={() => handleBlock(user.id, user.status || 'active')}
                                                        className={`p-2 rounded-xl transition-all ${user.status === 'locked' ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20' : 'text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20'}`}
                                                        title={user.status === 'locked' ? 'Unblock' : 'Block'}
                                                    >
                                                        {user.status === 'locked' ? <LockOpenIcon className="w-4 h-4" /> : <LockClosedIcon className="w-4 h-4" />}
                                                    </button>
                                                    {/* Impersonate */}
                                                    <button
                                                        onClick={() => handleImpersonate(user.id)}
                                                        className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
                                                        title="Login as User"
                                                    >
                                                        <ArrowLeftOnRectangleIcon className="w-4 h-4" />
                                                    </button>
                                                    {/* Delete */}
                                                    <button
                                                        onClick={() => handleDelete(user)}
                                                        className="p-2 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                                        title="Delete User"
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                    <div className="flex justify-between items-center pt-2">
                        <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                            Page {pagination.page} of {pagination.totalPages} ({pagination.total} users)
                        </span>
                        <div className="flex gap-2">
                            <button onClick={() => fetchAll(pagination.page - 1)} disabled={pagination.page === 1} className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm text-slate-700 dark:text-slate-200 disabled:opacity-50 hover:bg-slate-50 transition-all">Previous</button>
                            <button onClick={() => fetchAll(pagination.page + 1)} disabled={pagination.page === pagination.totalPages} className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm text-slate-700 dark:text-slate-200 disabled:opacity-50 hover:bg-slate-50 transition-all">Next</button>
                        </div>
                    </div>
                )}
            </div>

            {/* Add Credits Modal */}
            {creditModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-8 w-full max-w-sm mx-4 border border-slate-200 dark:border-slate-700">
                        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">Add Credits</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Adding credits to <strong>{creditModal.email}</strong></p>
                        <input
                            type="number"
                            min="1"
                            value={creditAmount}
                            onChange={(e) => setCreditAmount(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-medium text-slate-900 dark:text-white mb-6"
                            placeholder="Credits amount (e.g. 500)"
                            autoFocus
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setCreditModal(null)} className="flex-1 py-3 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">Cancel</button>
                            <button onClick={handleAddCredits} disabled={creditLoading || !creditAmount} className="flex-1 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl font-black shadow-lg disabled:opacity-60 hover:shadow-xl transition-all">
                                {creditLoading ? 'Adding...' : 'Add Credits'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppLayout>
    );
};

export default SuperAdminIndividualUsersPage;
