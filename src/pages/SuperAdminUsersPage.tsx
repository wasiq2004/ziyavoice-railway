import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import {
    UsersIcon,
    ArrowPathIcon,
    MagnifyingGlassIcon,
    LockClosedIcon,
    LockOpenIcon,
    BuildingOfficeIcon,
    TrashIcon,
} from '@heroicons/react/24/outline';
import { listAllUsers, blockUser, listOrganizations, impersonateUser, deleteSuperAdminUser } from '../utils/superAdminApi';
import { listPlans, assignPlanToUser } from '../utils/adminApi';
import { Organization } from '../types';
import { ArrowLeftOnRectangleIcon } from '@heroicons/react/24/outline';

const SuperAdminUsersPage: React.FC = () => {
    const navigate = useNavigate();
    const [users, setUsers] = useState<any[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [plans, setPlans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedOrg, setSelectedOrg] = useState('');
    const [error, setError] = useState('');
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
    const [assigningPlan, setAssigningPlan] = useState<string | null>(null);
    const [selectedPlan, setSelectedPlan] = useState<Record<string, string>>({});

    const userStr = localStorage.getItem('ziya-user');
    const currentUser = userStr ? JSON.parse(userStr) : null;

    useEffect(() => {
        if (!currentUser || currentUser.role !== 'super_admin') { navigate('/login'); return; }
        fetchAll();
    }, [navigate]);

    const fetchAll = async (page = 1, orgIdOverride?: string) => {
        setLoading(true);
        try {
            const orgIdToUse = orgIdOverride !== undefined ? orgIdOverride : selectedOrg;
            const orgId = orgIdToUse ? parseInt(orgIdToUse) : undefined;
            const [userData, orgs, planData] = await Promise.all([
                listAllUsers(page, 50, search, orgId),
                listOrganizations(),
                listPlans(),
            ]);
            setUsers(userData.users);
            setPagination(userData.pagination);
            setOrganizations(orgs);
            setPlans(planData);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Auto-refresh when org filter changes
    useEffect(() => {
        if (!currentUser || currentUser.role !== 'super_admin') return;
        fetchAll(1, selectedOrg);
    }, [selectedOrg]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchAll(1);
    };

    const handleBlock = async (userId: string, currentStatus: string) => {
        const newStatus = currentStatus === 'active' ? 'locked' : 'active';
        try {
            await blockUser(userId, newStatus);
            fetchAll(pagination.page);
        } catch (err: any) {
            alert('Failed: ' + err.message);
        }
    };

    const handleAssignPlan = async (userId: string) => {
        const planId = selectedPlan[userId];
        if (!planId) { alert('Please select a plan'); return; }
        setAssigningPlan(userId);
        try {
            await assignPlanToUser(userId, planId, currentUser?.id || 'superadmin');
            fetchAll(pagination.page);
        } catch (err: any) {
            alert('Failed: ' + err.message);
        } finally {
            setAssigningPlan(null);
        }
    };

    const handleImpersonate = async (targetUserId: string) => {
        try {
            const user = await impersonateUser(targetUserId);
            const currentUserStr = localStorage.getItem('ziya-user');
            localStorage.setItem('ziya-original-superadmin', currentUserStr!);
            localStorage.setItem('ziya-user', JSON.stringify(user));
            
            // Force reload to dashboard corresponding to user role
            if (user.role === 'org_admin') {
                window.location.href = '/admin/dashboard';
            } else {
                window.location.href = '/dashboard';
            }
        } catch(err: any) {
            alert(err.message);
        }
    };

    const handleDelete = async (user: any) => {
        if (!window.confirm(`Are you absolutely sure you want to PERMANENTLY delete user "${user.username}"??\n\nThis action CANNOT be undone and will erase all data.`)) return;
        try {
            await deleteSuperAdminUser(user.id);
            fetchAll(pagination.page);
        } catch (err: any) {
            alert('Failed: ' + err.message);
        }
    };

    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Super Admin', path: '/superadmin/dashboard' },
                { label: 'All Users' },
            ]}
            pageTitle="All Users"
            pageDescription="View, block, and manage users across all organizations."
            primaryAction={
                <button onClick={() => fetchAll(1)} className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 font-bold text-sm hover:bg-slate-50 transition-all">
                    <ArrowPathIcon className="w-4 h-4 mr-2" />Refresh
                </button>
            }
        >
            <div className="space-y-6 animate-in fade-in duration-500">
                {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl text-red-700 dark:text-red-400 text-sm">{error}</div>
                )}

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-4">
                    <form onSubmit={handleSearch} className="flex-1 flex gap-3">
                        <div className="relative flex-1">
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by email or username..."
                                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-medium text-slate-900 dark:text-white"
                            />
                        </div>
                        <button type="submit" className="px-4 py-2.5 bg-emerald-500 text-white rounded-xl font-bold text-sm hover:bg-emerald-600 transition-all">
                            Search
                        </button>
                    </form>
                    <select
                        value={selectedOrg}
                        onChange={(e) => setSelectedOrg(e.target.value)}
                        className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                    >
                        <option value="">All Organizations</option>
                        {organizations.map(o => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                    </select>
                </div>

                <div className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                    {pagination.total} user{pagination.total !== 1 ? 's' : ''} found
                </div>

                {/* Table */}
                <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="p-8 space-y-4">
                            {[...Array(8)].map((_, i) => <div key={i} className="h-10 bg-slate-100 dark:bg-slate-700/50 rounded-xl animate-pulse" />)}
                        </div>
                    ) : users.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <UsersIcon className="w-12 h-12 mb-4 text-slate-300 dark:text-slate-600" />
                            <p className="font-bold text-slate-500 dark:text-slate-400">No users found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-100 dark:border-slate-800">
                                        <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">User</th>
                                        <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Organization</th>
                                        <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Role</th>
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
                                                    <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-black text-sm flex-shrink-0">
                                                        {(user.username || user.email).charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-slate-900 dark:text-white text-sm">{user.username}</p>
                                                        <p className="text-xs text-slate-400">{user.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {user.organization_name ? (
                                                    <div className="flex items-center gap-2">
                                                        <BuildingOfficeIcon className="w-4 h-4 text-violet-500" />
                                                        <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">{user.organization_name}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-400 italic">No org</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-lg">
                                                    {user.role || 'user'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${user.status === 'active'
                                                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                                    }`}>
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
                                                        className="px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold disabled:opacity-50 transition-all"
                                                    >
                                                        {assigningPlan === user.id ? '...' : 'Assign'}
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex justify-end">
                                                    <button
                                                        onClick={() => handleBlock(user.id, user.status || 'active')}
                                                        className={`p-2 rounded-xl transition-all ${user.status === 'locked'
                                                                ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                                                                : 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                                                            }`}
                                                        title={user.status === 'locked' ? 'Unblock User' : 'Block User'}
                                                    >
                                                        {user.status === 'locked'
                                                            ? <LockOpenIcon className="w-4 h-4" />
                                                            : <LockClosedIcon className="w-4 h-4" />
                                                        }
                                                    </button>
                                                    <button
                                                        onClick={() => handleImpersonate(user.id)}
                                                        className="p-1.5 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-all"
                                                        title="Login as User"
                                                    >
                                                        <ArrowLeftOnRectangleIcon className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(user)}
                                                        className="p-1.5 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
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
                            <button
                                onClick={() => fetchAll(pagination.page - 1)}
                                disabled={pagination.page === 1}
                                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm text-slate-700 dark:text-slate-200 disabled:opacity-50 hover:bg-slate-50 transition-all"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => fetchAll(pagination.page + 1)}
                                disabled={pagination.page === pagination.totalPages}
                                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm text-slate-700 dark:text-slate-200 disabled:opacity-50 hover:bg-slate-50 transition-all"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </AppLayout>
    );
};

export default SuperAdminUsersPage;
