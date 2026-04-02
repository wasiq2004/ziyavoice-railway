import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import {
    CircleStackIcon,
    BuildingOfficeIcon,
    ArrowPathIcon,
    PlusIcon,
    MagnifyingGlassIcon,
    BanknotesIcon,
    ClockIcon,
} from '@heroicons/react/24/outline';
import { listOrganizations } from '../utils/superAdminApi';
import { Organization } from '../types';
import { getApiBaseUrl, getApiPath } from '../utils/api';

const SuperAdminCreditsPage: React.FC = () => {
    const navigate = useNavigate();
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [orgBalances, setOrgBalances] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [showAllocModal, setShowAllocModal] = useState<Organization | null>(null);
    const [allocReason, setAllocReason] = useState('');
    const [amount, setAmount] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [logFilter, setLogFilter] = useState('All');
    const [historyLogs, setHistoryLogs] = useState<any[]>([]);
    const [logsLoading, setLogsLoading] = useState(true);

    useEffect(() => {
        const userStr = localStorage.getItem('ziya-user');
        if (!userStr || JSON.parse(userStr).role !== 'super_admin') { navigate('/login'); return; }
        fetchOrgs();
        fetchLogs();
    }, [navigate]);

    const fetchOrgs = async () => {
        setLoading(true);
        try {
            const orgs = await listOrganizations();
            setOrganizations(orgs);
            // Fetch org admin wallet balances
            const API = `${getApiBaseUrl()}${getApiPath()}`;
            const balRes = await fetch(`${API}/superadmin/credits/org-balances`);
            if (balRes.ok) {
                const balData = await balRes.json();
                const map: Record<string, number> = {};
                (balData.admins || []).forEach((a: any) => {
                    // map by org_id
                    if (a.org_id) map[a.org_id] = (map[a.org_id] || 0) + parseFloat(a.credits_balance || 0);
                });
                setOrgBalances(map);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchLogs = async () => {
        setLogsLoading(true);
        try {
            const API = `${getApiBaseUrl()}${getApiPath()}`;
            const res = await fetch(`${API}/superadmin/credits/logs?limit=50`);
            if (res.ok) {
                const data = await res.json();
                setHistoryLogs(data.logs || []);
            }
        } catch (err) {
            console.error('Failed to fetch credit logs:', err);
        } finally {
            setLogsLoading(false);
        }
    };

    const handleAllocate = async () => {
        if (!showAllocModal || !amount) return;
        const superAdmin = JSON.parse(localStorage.getItem('ziya-user') || '{}');
        setSaving(true);
        setErrorMsg('');
        try {
            const API = `${getApiBaseUrl()}${getApiPath()}`;
            // Find org admin for this org
            const balRes = await fetch(`${API}/superadmin/credits/org-balances`);
            const balData = await balRes.json();
            const orgAdmin = (balData.admins || []).find((a: any) => a.org_id == showAllocModal.id);
            if (!orgAdmin) throw new Error('No org admin found for this organization. Create an org admin first.');

            const allocRes = await fetch(`${API}/superadmin/credits/allocate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target_admin_id: orgAdmin.id,
                    amount: Number(amount),
                    description: allocReason || `Bulk allocation by Super Admin`,
                    allocated_by: superAdmin.id,
                }),
            });
            const allocData = await allocRes.json();
            if (!allocData.success) throw new Error(allocData.message || 'Allocation failed');

            setSuccessMsg(`Successfully allocated ${amount} CR to ${showAllocModal.name}`);
            setAmount('');
            setAllocReason('');
            setShowAllocModal(null);
            setTimeout(() => setSuccessMsg(''), 4000);
            fetchOrgs();
            fetchLogs();
        } catch (err: any) {
            setErrorMsg(err.message || 'Failed to allocate credits');
        } finally {
            setSaving(false);
        }
    };

    const filtered = organizations.filter(o => o.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Super Admin', path: '/superadmin/dashboard' },
                { label: 'Credit Management' }
            ]}
            pageTitle="Bulk Credit Allocation"
            pageDescription="Strategically distribute communication credits to organization wallets."
        >
            <div className="space-y-6 animate-in fade-in duration-500">
                {successMsg && (
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-2xl text-emerald-700 dark:text-emerald-400 text-sm font-bold flex items-center gap-2">
                        <BanknotesIcon className="w-5 h-5" />
                        {successMsg}
                    </div>
                )}

                <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                    <div className="relative w-full md:max-w-md">
                        <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Find organization by name..."
                            className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none text-sm font-bold text-slate-800 dark:text-white shadow-sm"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {loading ? (
                        [...Array(6)].map((_, i) => (
                            <div key={i} className="h-48 bg-slate-100 dark:bg-slate-900 animate-pulse rounded-[2rem]" />
                        ))
                    ) : filtered.map((org) => (
                        <div key={org.id} className="bg-white dark:bg-slate-800/50 rounded-[2rem] border border-slate-200 dark:border-slate-800 p-6 hover:shadow-xl transition-all group overflow-hidden relative">
                            <div className="absolute top-0 right-0 -mr-6 -mt-6 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
                            
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-black text-lg">
                                    {org.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="overflow-hidden">
                                    <h3 className="font-black text-slate-800 dark:text-white truncate">{org.name}</h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">ID: #{org.id}</p>
                                </div>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-4 mb-6">
                                <div className="flex justify-between items-end">
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Current Balance</p>
                                        <p className="text-xl font-black text-primary">{(orgBalances[String(org.id)] || 0).toLocaleString()} <span className="text-xs">CR</span></p>
                                    </div>
                                    <div className="text-right space-y-1">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Usage/Mo</p>
                                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">—</p>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => setShowAllocModal(org)}
                                className="w-full py-3 bg-slate-900 dark:bg-white dark:text-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                            >
                                <PlusIcon className="w-4 h-4" />
                                Allocate Credits
                            </button>
                        </div>
                    ))}
                </div>

                {/* Global Trackings */}
                <div className="mt-12 bg-white dark:bg-slate-800/50 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl">
                                <ClockIcon className="w-5 h-5 text-slate-500" />
                            </div>
                            <h2 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">Global Credit Logs</h2>
                        </div>
                        
                        <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-900 rounded-xl">
                            {['All', 'Allocation', 'Deduction'].map(filter => (
                                <button
                                    key={filter}
                                    onClick={() => setLogFilter(filter)}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${logFilter === filter ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                >
                                    {filter === 'Allocation' ? 'Payment Log' : filter === 'Deduction' ? 'Credit Log' : 'All Logs'}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date & Time</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Organization</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Amount (CR)</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Author</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                {logsLoading ? (
                                    <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-400">Loading logs...</td></tr>
                                ) : historyLogs.map((log) => {
                                    const logDate = log.created_at ? new Date(log.created_at) : null;
                                    const dateStr = logDate ? logDate.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) : (log.date || '—');
                                    const timeStr = logDate ? logDate.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'}) : (log.time || '—');
                                    return (
                                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{dateStr}</p>
                                            <p className="text-[10px] font-black text-slate-400 uppercase">{timeStr}</p>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
                                                <PlusIcon className="w-3 h-3 mr-1" />
                                                Allocation
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-600 dark:text-slate-300">
                                            {log.org_name || log.recipient_name || '—'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-black text-emerald-600 dark:text-emerald-400">
                                            +{Number(log.amount || 0).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-xs font-bold text-slate-500">
                                            {log.created_by || log.admin || 'Admin'}
                                        </td>
                                    </tr>
                                    );
                                })}
                                {historyLogs.filter(l => logFilter === 'All' || l.type === logFilter).length === 0 && (
                                   <tr>
                                     <td colSpan={5} className="px-6 py-8 text-center text-sm font-medium text-slate-500">
                                        No logs found.
                                     </td>
                                   </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Allocation Modal */}
            {showAllocModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl p-8 w-full max-w-md border border-slate-200 dark:border-slate-800">
                        <div className="flex flex-col items-center mb-6 text-center">
                            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-4">
                                <CircleStackIcon className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">Credit Allocation</h3>
                            <p className="text-sm text-slate-500 font-bold mt-1">Increasing balance for <span className="text-primary">{showAllocModal.name}</span></p>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Allocation Amount (Credits)</label>
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none font-black text-xl text-slate-900 dark:text-white"
                                    placeholder="e.g. 10000"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Reason (Optional)</label>
                                <input
                                    type="text"
                                    value={allocReason}
                                    onChange={(e) => setAllocReason(e.target.value)}
                                    className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl focus:border-primary/50 outline-none font-bold text-sm text-slate-900 dark:text-white"
                                    placeholder="e.g. Monthly top-up"
                                />
                            </div>
                            {errorMsg && (
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-xs font-bold">
                                    {errorMsg}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-4 mt-8">
                            <button
                                onClick={() => setShowAllocModal(null)}
                                className="flex-1 py-4 border-2 border-slate-100 dark:border-slate-800 rounded-2xl font-black text-xs text-slate-500 uppercase tracking-widest hover:bg-slate-50 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAllocate}
                                disabled={saving || !amount}
                                className="flex-1 py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/30 transition-all disabled:opacity-50"
                            >
                                {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin mx-auto" /> : 'Confirm Allocation'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppLayout>
    );
};

export default SuperAdminCreditsPage;
