import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import {
    BuildingOfficeIcon,
    PlusIcon,
    PencilIcon,
    XCircleIcon,
    CheckCircleIcon,
    ArrowPathIcon,
    MagnifyingGlassIcon,
    TrashIcon,
    BanknotesIcon,
    ArrowRightOnRectangleIcon,
    FunnelIcon,
    UserGroupIcon,
    ExclamationTriangleIcon,
    ShieldExclamationIcon,
} from '@heroicons/react/24/outline';
import { listOrganizations, createOrganization, updateOrganization, disableOrganization, deleteOrganization, listOrgAdmins, deleteOrgAdmin } from '../utils/superAdminApi';
import { Organization, OrgAdmin } from '../types';
import { getApiBaseUrl, getApiPath } from '../utils/api';

const API_BASE_URL = `${getApiBaseUrl()}${getApiPath()}`;

const SuperAdminOrganizationsPage: React.FC = () => {
    const navigate = useNavigate();
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [orgAdmins, setOrgAdmins] = useState<OrgAdmin[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showCreditModal, setShowCreditModal] = useState<{org: Organization; amount: string} | null>(null);
    const [showDeleteAdminModal, setShowDeleteAdminModal] = useState<{org: Organization; admin: OrgAdmin} | null>(null);
    const [editOrg, setEditOrg] = useState<Organization | null>(null);
    const [formName, setFormName] = useState('');
    const [formLogoUrl, setFormLogoUrl] = useState('');
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    useEffect(() => {
        const userStr = localStorage.getItem('ziya-user');
        if (!userStr) { navigate('/login'); return; }
        const user = JSON.parse(userStr);
        if (user.role !== 'super_admin') { navigate('/login'); return; }
        fetchAll();
    }, [navigate]);

    const fetchAll = async () => {
        setLoading(true);
        setError('');
        try {
            const [orgs, admins] = await Promise.all([
                listOrganizations(),
                listOrgAdmins(),
            ]);
            setOrganizations(orgs);
            setOrgAdmins(admins);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const showSuccess = (msg: string) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(''), 3500);
    };

    // Get org admin for a given org
    const getOrgAdmin = (orgId: number): OrgAdmin | undefined =>
        orgAdmins.find(a => a.organization_id === orgId);

    const handleImpersonate = async (org: Organization) => {
        const orgAdmin = getOrgAdmin(org.id);
        if (orgAdmin) {
            // Save current super admin session so we can return
            const currentSession = localStorage.getItem('ziya-user');
            if (currentSession) {
                localStorage.setItem('ziya-impersonation-superadmin', currentSession);
            }
            const adminMock = {
                id: orgAdmin.id,
                email: orgAdmin.email,
                name: orgAdmin.username || orgAdmin.email,
                username: orgAdmin.username,
                role: 'org_admin',
                organization_id: org.id,
                organization_name: org.name,
                organization_logo_url: org.logo_url || null,
            };
            localStorage.setItem('ziya-user', JSON.stringify(adminMock));
            localStorage.setItem('admin', JSON.stringify(adminMock));
            navigate('/admin/dashboard');
            window.location.reload();
            return;
        }
        alert('No admin found for this organization.');
    };

    const handleAssignCredit = async () => {
        if (!showCreditModal) return;
        const amount = parseFloat(showCreditModal.amount);
        if (!amount || amount <= 0) { setFormError('Please enter a valid credit amount.'); return; }
        setSaving(true);
        setFormError('');
        try {
            // Get the org admin id for wallet transaction
            const orgAdmin = getOrgAdmin(showCreditModal.org.id);
            const superAdmin = JSON.parse(localStorage.getItem('ziya-user') || '{}');
            const response = await fetch(`${API_BASE_URL}/admin/wallet/add-credits`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: orgAdmin?.id || showCreditModal.org.id,
                    amount,
                    description: `SuperAdmin credit allocation to org: ${showCreditModal.org.name}`,
                    adminId: superAdmin.id || 'superadmin',
                }),
            });
            if (!response.ok) {
                const d = await response.json();
                throw new Error(d.message || 'Failed to assign credits');
            }
            showSuccess(`Credits assigned to ${showCreditModal.org.name} successfully.`);
            setShowCreditModal(null);
            fetchAll();
        } catch (err: any) {
            setFormError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteAdmin = async () => {
        if (!showDeleteAdminModal) return;
        setSaving(true);
        setFormError('');
        try {
            await deleteOrgAdmin(showDeleteAdminModal.admin.id);
            showSuccess(`Admin "${showDeleteAdminModal.admin.username || showDeleteAdminModal.admin.email}" deleted successfully.`);
            setShowDeleteAdminModal(null);
            fetchAll();
        } catch (err: any) {
            setFormError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleSaveOrg = async () => {
        if (!formName.trim()) { setFormError('Organization name is required'); return; }
        setSaving(true);
        setFormError('');
        try {
            const user = JSON.parse(localStorage.getItem('ziya-user') || '{}');
            if (editOrg) {
                await updateOrganization(editOrg.id, { name: formName, logo_url: formLogoUrl });
                showSuccess('Organization updated successfully.');
            } else {
                await createOrganization(formName, user.id, formLogoUrl);
                showSuccess('Organization created successfully.');
            }
            setShowCreateModal(false);
            fetchAll();
        } catch (err: any) {
            setFormError(err.message);
        } finally {
            setSaving(false);
        }
    };


    const filtered = organizations.filter(o =>
        o.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Super Admin', path: '/superadmin/dashboard' },
                { label: 'Organizations' },
            ]}
            pageTitle="Organization Management"
            pageDescription="Monitor organization health, allocate credits, and perform administrative actions."
            primaryAction={
                <div className="flex gap-3">
                    <button
                        onClick={fetchAll}
                        className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                    >
                        <ArrowPathIcon className="w-4 h-4 mr-2" />
                        Refresh
                    </button>
                    <button
                        onClick={() => { setFormName(''); setFormLogoUrl(''); setFormError(''); setShowCreateModal(true); }}
                        className="flex items-center px-5 py-2 bg-primary text-white rounded-xl font-black text-sm shadow-lg shadow-primary/20 hover:shadow-xl transition-all"
                    >
                        <PlusIcon className="w-4 h-4 mr-2" />
                        New Org
                    </button>
                </div>
            }
        >
            <div className="space-y-6 animate-in fade-in duration-500">

                {/* Success toast */}
                {successMsg && (
                    <div className="flex items-center gap-3 px-5 py-3 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl text-sm font-bold animate-in slide-in-from-top-2">
                        <CheckCircleIcon className="w-5 h-5 flex-shrink-0" />
                        {successMsg}
                    </div>
                )}

                {error && (
                    <div className="flex items-center gap-3 px-5 py-3 bg-red-50 border border-red-100 text-red-700 rounded-2xl text-sm font-bold">
                        <XCircleIcon className="w-5 h-5 flex-shrink-0" />
                        {error}
                    </div>
                )}

                {/* Search & Filters */}
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full md:max-w-sm">
                        <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search organizations..."
                            className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none text-sm font-bold text-slate-800 dark:text-white"
                        />
                    </div>
                    <span className="text-xs text-slate-400 font-bold">
                        {filtered.length} organization{filtered.length !== 1 ? 's' : ''}
                    </span>
                </div>

                {/* Table */}
                <div className="bg-white dark:bg-slate-800/50 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                                    <th className="text-left px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Organization</th>
                                    <th className="text-left px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Members & Admins</th>
                                    <th className="text-left px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Admin Account</th>
                                    <th className="text-left px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Credits</th>
                                    <th className="text-left px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                                    <th className="text-right px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                                {loading ? (
                                    [...Array(3)].map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td colSpan={6} className="px-8 py-6"><div className="h-10 bg-slate-100 dark:bg-slate-900 rounded-2xl" /></td>
                                        </tr>
                                    ))
                                ) : filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-8 py-12 text-center text-slate-400 font-bold text-sm">
                                            No organizations found.
                                        </td>
                                    </tr>
                                ) : filtered.map((org) => {
                                    const orgAdmin = getOrgAdmin(org.id);
                                    return (
                                    <tr key={org.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-900/40 transition-all">
                                        {/* Organization Details */}
                                        <td className="px-8 py-5">
                                            <div className="flex items-center gap-4">
                                                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary/10 to-blue-500/10 border border-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                                                    {org.logo_url ? (
                                                        <img src={org.logo_url} className="w-full h-full object-cover" alt={org.name} />
                                                    ) : (
                                                        <BuildingOfficeIcon className="w-5 h-5 text-primary" />
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="font-black text-slate-800 dark:text-white text-sm leading-tight group-hover:text-primary transition-colors">{org.name}</p>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">ID: {org.id}</p>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Members & Admins — real-time from API */}
                                        <td className="px-6 py-5">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <UserGroupIcon className="w-3.5 h-3.5 text-slate-400" />
                                                    <span className="text-xs font-black text-slate-700 dark:text-slate-300">{org.user_count ?? 0} Members</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-500" />
                                                    <span className="text-xs font-black text-slate-700 dark:text-slate-300">{org.admin_count ?? 0} Admin{(org.admin_count ?? 0) !== 1 ? 's' : ''}</span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Admin Account — real admin data */}
                                        <td className="px-6 py-5">
                                            {orgAdmin ? (
                                                <div>
                                                    <p className="text-xs font-black text-slate-800 dark:text-white leading-tight">{orgAdmin.username || '—'}</p>
                                                    <p className="text-[10px] text-slate-400 font-bold truncate max-w-[140px]">{orgAdmin.email}</p>
                                                </div>
                                            ) : (
                                                <span className="text-[10px] text-slate-400 italic font-bold">No admin assigned</span>
                                            )}
                                        </td>

                                        {/* Credits — real credit_balance from API */}
                                        <td className="px-6 py-5 font-mono">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-black text-primary">
                                                    {(org.credit_balance ?? 0).toLocaleString()} <span className="text-[9px]">CR</span>
                                                </span>
                                                <span className="text-[9px] text-slate-400 font-bold uppercase">Balance</span>
                                            </div>
                                        </td>

                                        {/* Status */}
                                        <td className="px-6 py-5">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                                org.status === 'active'
                                                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                                    : 'bg-red-50 text-red-600 border border-red-100'
                                            }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${org.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                                {org.status}
                                            </span>
                                        </td>

                                        {/* Actions */}
                                        <td className="px-8 py-5">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {/* Assign Credit */}
                                                <button
                                                    onClick={() => setShowCreditModal({org, amount: ''})}
                                                    title="Assign Credits"
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all shadow-sm"
                                                >
                                                    <BanknotesIcon className="w-3.5 h-3.5" />
                                                    <span>Credits</span>
                                                </button>

                                                {/* Login as Admin */}
                                                <button
                                                    onClick={() => handleImpersonate(org)}
                                                    disabled={!orgAdmin}
                                                    title={orgAdmin ? `Login as ${orgAdmin.username}` : 'No admin assigned'}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-md shadow-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    <ArrowRightOnRectangleIcon className="w-3.5 h-3.5" />
                                                    <span>Login</span>
                                                </button>

                                                {/* Delete Admin */}
                                                {orgAdmin && (
                                                    <button
                                                        onClick={() => setShowDeleteAdminModal({org, admin: orgAdmin})}
                                                        title={`Delete admin: ${orgAdmin.username}`}
                                                        className="flex items-center gap-1 p-1.5 bg-red-50 border border-red-100 text-red-500 rounded-xl hover:bg-red-100 hover:text-red-700 transition-all"
                                                    >
                                                        <TrashIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                )}

                                                {/* Edit */}
                                                <button
                                                    title="Edit organization"
                                                    onClick={() => {
                                                        setEditOrg(org);
                                                        setFormName(org.name);
                                                        setFormLogoUrl(org.logo_url || '');
                                                        setFormError('');
                                                        setShowCreateModal(true);
                                                    }}
                                                    className="p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-xl transition-all"
                                                >
                                                    <PencilIcon className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Credit Allocation Modal */}
            {showCreditModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl p-8 w-full max-w-md border border-slate-200 dark:border-slate-800">
                        <div className="flex flex-col items-center mb-6">
                            <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center text-emerald-500 mb-4">
                                <BanknotesIcon className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">Allocate Credits</h3>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Org: {showCreditModal.org.name}</p>
                            {getOrgAdmin(showCreditModal.org.id) && (
                                <p className="text-[10px] text-slate-400 font-bold mt-0.5">Admin: {getOrgAdmin(showCreditModal.org.id)?.username}</p>
                            )}
                        </div>

                        {formError && (
                            <p className="text-xs text-red-600 font-bold mb-4 text-center bg-red-50 rounded-xl px-3 py-2">{formError}</p>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Credit Amount (CR)</label>
                                <input
                                    type="number"
                                    value={showCreditModal.amount}
                                    onChange={(e) => setShowCreditModal({...showCreditModal, amount: e.target.value})}
                                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none font-black text-lg text-slate-900 dark:text-white"
                                    placeholder="5000"
                                    autoFocus
                                    min="1"
                                />
                                <p className="text-[9px] text-slate-400 font-bold mt-2 px-1 leading-relaxed italic">
                                    * Credits will be credited to {showCreditModal.org.name}'s admin wallet. Transaction will be audited.
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-4 mt-8">
                            <button
                                onClick={() => { setShowCreditModal(null); setFormError(''); }}
                                className="flex-1 py-4 border-2 border-slate-100 dark:border-slate-800 rounded-2xl font-black text-xs text-slate-500 uppercase tracking-widest hover:bg-slate-50 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAssignCredit}
                                disabled={saving || !showCreditModal.amount}
                                className="flex-1 py-4 bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/30 transition-all disabled:opacity-50"
                            >
                                {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin mx-auto" /> : 'Confirm Deposit'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Admin Confirmation Modal */}
            {showDeleteAdminModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl p-8 w-full max-w-sm border border-slate-200 dark:border-slate-800">
                        <div className="flex flex-col items-center mb-6">
                            <div className="w-16 h-16 bg-red-50 dark:bg-red-900/30 rounded-2xl flex items-center justify-center text-red-500 mb-4">
                                <ShieldExclamationIcon className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">Delete Admin</h3>
                            <p className="text-sm text-slate-500 font-medium text-center mt-2">
                                Are you sure you want to remove <strong>{showDeleteAdminModal.admin.username || showDeleteAdminModal.admin.email}</strong> as admin of <strong>{showDeleteAdminModal.org.name}</strong>?
                            </p>
                            <p className="text-[10px] text-red-500 font-bold mt-2 text-center">This action cannot be undone.</p>
                        </div>

                        {formError && (
                            <p className="text-xs text-red-600 font-bold mb-4 text-center bg-red-50 rounded-xl px-3 py-2">{formError}</p>
                        )}

                        <div className="flex gap-4 mt-2">
                            <button
                                onClick={() => { setShowDeleteAdminModal(null); setFormError(''); }}
                                className="flex-1 py-3 border-2 border-slate-100 dark:border-slate-800 rounded-2xl font-black text-xs text-slate-500 uppercase tracking-widest hover:bg-slate-50 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteAdmin}
                                disabled={saving}
                                className="flex-1 py-3 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-red-600/30 transition-all hover:bg-red-700 disabled:opacity-50"
                            >
                                {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin mx-auto" /> : 'Delete Admin'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create / Edit Organization Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl p-8 w-full max-w-md border border-slate-200 dark:border-slate-800">
                        <div className="flex flex-col items-center mb-6">
                            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-4">
                                <BuildingOfficeIcon className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">
                                {editOrg ? 'Edit Organization' : 'New Organization'}
                            </h3>
                        </div>

                        {formError && (
                            <p className="text-xs text-red-600 font-bold mb-4 text-center bg-red-50 rounded-xl px-3 py-2">{formError}</p>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Organization Name</label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none font-black text-sm text-slate-900 dark:text-white"
                                    placeholder="Acme Corp"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Logo URL (Optional)</label>
                                <input
                                    type="text"
                                    value={formLogoUrl}
                                    onChange={(e) => setFormLogoUrl(e.target.value)}
                                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none font-bold text-sm text-slate-900 dark:text-white"
                                    placeholder="https://example.com/logo.png"
                                />
                            </div>
                        </div>

                        <div className="flex gap-4 mt-8">
                            <button
                                onClick={() => { setShowCreateModal(false); setFormError(''); }}
                                className="flex-1 py-4 border-2 border-slate-100 dark:border-slate-800 rounded-2xl font-black text-xs text-slate-500 uppercase tracking-widest hover:bg-slate-50 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveOrg}
                                disabled={saving || !formName.trim()}
                                className="flex-1 py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/30 transition-all disabled:opacity-50"
                            >
                                {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin mx-auto" /> : (editOrg ? 'Update' : 'Create')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppLayout>
    );
};

export default SuperAdminOrganizationsPage;
