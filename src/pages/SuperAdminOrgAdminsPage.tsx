import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import {
    UserGroupIcon,
    PlusIcon,
    ArrowPathIcon,
    MagnifyingGlassIcon,
    BuildingOfficeIcon,
    TrashIcon,
} from '@heroicons/react/24/outline';
import { listOrgAdmins, createOrgAdmin, listOrganizations, impersonateUser, deleteOrgAdmin } from '../utils/superAdminApi';
import { OrgAdmin, Organization } from '../types';
import { ArrowLeftOnRectangleIcon } from '@heroicons/react/24/outline';

const SuperAdminOrgAdminsPage: React.FC = () => {
    const navigate = useNavigate();
    const [admins, setAdmins] = useState<OrgAdmin[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        email: '',
        username: '',
        password: '',
        organization_id: '',
    });

    useEffect(() => {
        const userStr = localStorage.getItem('ziya-user');
        if (!userStr) { navigate('/login'); return; }
        const user = JSON.parse(userStr);
        if (user.role !== 'super_admin') { navigate('/login'); return; }
        fetchAll();
    }, [navigate]);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [a, o] = await Promise.all([listOrgAdmins(), listOrganizations()]);
            setAdmins(a);
            setOrganizations(o);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!form.email || !form.username || !form.password || !form.organization_id) {
            setFormError('All fields are required');
            return;
        }
        setSaving(true);
        setFormError('');
        try {
            await createOrgAdmin({
                email: form.email,
                username: form.username,
                password: form.password,
                organization_id: parseInt(form.organization_id),
            });
            setShowModal(false);
            setForm({ email: '', username: '', password: '', organization_id: '' });
            fetchAll();
        } catch (err: any) {
            setFormError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleImpersonate = async (targetUserId: string) => {
        try {
            const user = await impersonateUser(targetUserId);
            const currentUserStr = localStorage.getItem('ziya-user');
            localStorage.setItem('ziya-original-superadmin', currentUserStr!);
            localStorage.setItem('ziya-user', JSON.stringify(user));
            // Force reload to org admin dashboard
            window.location.href = '/admin/dashboard';
        } catch(err: any) {
            alert(err.message);
        }
    };

    const handleDelete = async (admin: OrgAdmin) => {
        if (!window.confirm(`Are you absolutely sure you want to PERMANENTLY delete Org Admin "${admin.username}"?\n\nThis action CANNOT be undone.`)) return;
        try {
            await deleteOrgAdmin(admin.id);
            fetchAll();
        } catch (err: any) {
            alert('Failed: ' + err.message);
        }
    };

    const filtered = admins.filter(a =>
        a.email.toLowerCase().includes(search.toLowerCase()) ||
        a.username.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Super Admin', path: '/superadmin/dashboard' },
                { label: 'Organization Admins' },
            ]}
            pageTitle="Organization Admins"
            pageDescription="Create and manage admins for each organization."
            primaryAction={
                <div className="flex gap-3">
                    <button onClick={fetchAll} className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 font-bold text-sm hover:bg-slate-50 transition-all">
                        <ArrowPathIcon className="w-4 h-4 mr-2" />Refresh
                    </button>
                    <button
                        onClick={() => { setForm({ email: '', username: '', password: '', organization_id: '' }); setFormError(''); setShowModal(true); }}
                        className="flex items-center px-5 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-black text-sm shadow-lg shadow-blue-500/20 hover:shadow-xl transition-all"
                    >
                        <PlusIcon className="w-4 h-4 mr-2" />Add Org Admin
                    </button>
                </div>
            }
        >
            <div className="space-y-6 animate-in fade-in duration-500">
                {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl text-red-700 dark:text-red-400 text-sm font-medium">{error}</div>
                )}

                {/* Search */}
                <div className="relative max-w-sm">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search org admins..."
                        className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium text-slate-900 dark:text-white"
                    />
                </div>

                {/* Table */}
                <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="p-8 space-y-4">
                            {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-slate-100 dark:bg-slate-700/50 rounded-xl animate-pulse" />)}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                            <UserGroupIcon className="w-12 h-12 mb-4 opacity-40" />
                            <p className="font-bold text-slate-500 dark:text-slate-400">
                                {search ? 'No org admins found' : 'No org admins yet'}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-100 dark:border-slate-800">
                                        <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Admin</th>
                                        <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Organization</th>
                                        <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                                        <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Created</th>
                                        <th className="text-right px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {filtered.map((admin) => (
                                        <tr key={admin.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-black text-sm flex-shrink-0">
                                                        {(admin.username || admin.email).charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-slate-900 dark:text-white text-sm">{admin.username}</p>
                                                        <p className="text-xs text-slate-400">{admin.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <BuildingOfficeIcon className="w-4 h-4 text-violet-500" />
                                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                        {admin.organization_name || `Org #${admin.organization_id}`}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${admin.status === 'active'
                                                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                                    }`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${admin.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                                    {admin.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm text-slate-500 dark:text-slate-400">
                                                    {new Date(admin.created_at).toLocaleDateString()}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => handleImpersonate(admin.id)}
                                                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                                        title="Login as Admin"
                                                    >
                                                        <ArrowLeftOnRectangleIcon className="w-4 h-4" />
                                                        Login
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(admin)}
                                                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                                        title="Delete Admin"
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
            </div>

            {/* Create Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-8 w-full max-w-md mx-4 border border-slate-200 dark:border-slate-700">
                        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-6">Create Organization Admin</h3>
                        {formError && (
                            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm font-medium">{formError}</div>
                        )}
                        <div className="space-y-4">
                            {[
                                { key: 'email', label: 'Email Address', type: 'email', placeholder: 'admin@company.com' },
                                { key: 'username', label: 'Username', type: 'text', placeholder: 'org_admin_name' },
                                { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
                            ].map((field) => (
                                <div key={field.key}>
                                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{field.label}</label>
                                    <input
                                        type={field.type}
                                        value={(form as any)[field.key]}
                                        onChange={(e) => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-900 dark:text-white"
                                        placeholder={field.placeholder}
                                    />
                                </div>
                            ))}
                            <div>
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Assign to Organization</label>
                                <select
                                    value={form.organization_id}
                                    onChange={(e) => setForm(f => ({ ...f, organization_id: e.target.value }))}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-900 dark:text-white"
                                >
                                    <option value="">Select an organization...</option>
                                    {organizations.filter(o => o.status === 'active').map(o => (
                                        <option key={o.id} value={o.id}>{o.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setShowModal(false)} className="flex-1 py-3 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
                                Cancel
                            </button>
                            <button onClick={handleCreate} disabled={saving} className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-black shadow-lg shadow-blue-500/30 hover:shadow-xl transition-all disabled:opacity-60">
                                {saving ? 'Creating...' : 'Create Admin'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppLayout>
    );
};

export default SuperAdminOrgAdminsPage;
