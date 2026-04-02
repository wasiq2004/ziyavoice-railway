import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import {
    CogIcon,
    ShieldCheckIcon,
    BellAlertIcon,
    ServerIcon,
    KeyIcon,
    GlobeAltIcon,
    CheckCircleIcon,
    ArrowPathIcon,
    CpuChipIcon,
    CurrencyDollarIcon,
} from '@heroicons/react/24/outline';
import { getApiBaseUrl } from '../utils/api';

type Tab = 'general' | 'api_keys' | 'notifications' | 'resources' | 'billing';

const SuperAdminSettingsPage: React.FC = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<Tab>('general');
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [settingsLoading, setSettingsLoading] = useState(true);

    const [general, setGeneral] = useState({
        platformName: 'Ziya Voice',
        supportEmail: 'support@ziyavoice.com',
        maintenanceMode: false,
    });

    const [providerKeys] = useState({
        elevenLabs: '••••••••••••••••••••',
        twilioSid: 'AC••••••••••••••••••••',
        openai: 'sk-••••••••••••••••••••',
    });

    const [resources, setResources] = useState({
        maxConcurrentCalls: 2000,
        storageQuotaGb: 50,
    });

    const [billing, setBilling] = useState({ platformMargin: 25 });

    const [notifications, setNotifications] = useState({
        daily: true,
        critical: true,
        new_org: true,
        wallet: false,
    });

    useEffect(() => {
        const userStr = localStorage.getItem('ziya-user');
        if (!userStr || JSON.parse(userStr).role !== 'super_admin') { navigate('/login'); return; }
        fetchSettings();
    }, [navigate]);

    const fetchSettings = async () => {
        setSettingsLoading(true);
        try {
            const API = getApiBaseUrl();
            const res = await fetch(`${API}${getApiPath()}/superadmin/settings`);
            if (!res.ok) throw new Error('Failed to load settings');
            const data = await res.json();
            const s = data.settings || {};
            setGeneral({
                platformName: s.platform_name || 'Ziya Voice',
                supportEmail: s.support_email || 'support@ziyavoice.com',
                maintenanceMode: s.maintenance_mode === '1',
            });
            setResources({
                maxConcurrentCalls: parseInt(s.max_concurrent_calls || '2000'),
                storageQuotaGb: parseInt(s.storage_quota_gb || '50'),
            });
            setBilling({ platformMargin: parseInt(s.platform_margin || '25') });
            setNotifications({
                daily: s.notify_daily_report !== '0',
                critical: s.notify_critical !== '0',
                new_org: s.notify_new_org !== '0',
                wallet: s.notify_wallet_empty === '1',
            });
        } catch (err) {
            console.error('Failed to fetch settings:', err);
        } finally {
            setSettingsLoading(false);
        }
    };

    const saveSettings = async (section: string, payload: Record<string, string>) => {
        setSaving(true);
        setError('');
        try {
            const API = getApiBaseUrl();
            const res = await fetch(`${API}${getApiPath()}/superadmin/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: payload }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'Save failed');
            setSuccess(`${section} settings updated successfully!`);
            setTimeout(() => setSuccess(''), 3000);
        } catch (err: any) {
            setError(err.message || 'Failed to save settings');
            setTimeout(() => setError(''), 4000);
        } finally {
            setSaving(false);
        }
    };

    const handleSaveGeneral = () => saveSettings('General', {
        platform_name: general.platformName,
        support_email: general.supportEmail,
        maintenance_mode: general.maintenanceMode ? '1' : '0',
    });

    const handleSaveResources = () => saveSettings('Resource Limits', {
        max_concurrent_calls: String(resources.maxConcurrentCalls),
        storage_quota_gb: String(resources.storageQuotaGb),
    });

    const handleSaveBilling = () => saveSettings('Billing', {
        platform_margin: String(billing.platformMargin),
    });

    const handleSaveNotifications = () => saveSettings('Notification', {
        notify_daily_report: notifications.daily ? '1' : '0',
        notify_critical: notifications.critical ? '1' : '0',
        notify_new_org: notifications.new_org ? '1' : '0',
        notify_wallet_empty: notifications.wallet ? '1' : '0',
    });


    const tabs = [
        { id: 'general', label: 'Global Platform', icon: GlobeAltIcon, desc: 'Core platform identity' },
        { id: 'api_keys', label: 'Provider APIs', icon: KeyIcon, desc: 'Master API credentials' },
        { id: 'resources', label: 'System Resource', icon: ServerIcon, desc: 'Throttling & limits' },
        { id: 'notifications', label: 'Audit Alerts', icon: BellAlertIcon, desc: 'System notifications' },
        { id: 'billing', label: 'Platform Financials', icon: CurrencyDollarIcon, desc: 'Global pricing & margins' },
    ];

    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Super Admin', path: '/superadmin/dashboard' },
                { label: 'System Settings' }
            ]}
            pageTitle="System Settings"
            pageDescription="Centralized control panel for system-wide parameters, API integrations, and security."
        >
            <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                {/* Vertical Tabs Sidebar */}
                <div className="w-full md:w-72 space-y-2 shrink-0">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-4 mb-4">Configuration Areas</h3>
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as Tab)}
                            className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all text-left ${
                                activeTab === tab.id 
                                ? 'bg-indigo-600 shadow-lg shadow-indigo-600/20 text-white' 
                                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                        >
                            <tab.icon className={`w-6 h-6 ${activeTab === tab.id ? 'text-indigo-200' : 'text-slate-400'}`} />
                            <div>
                                <h4 className={`text-sm font-bold ${activeTab === tab.id ? 'text-white' : 'text-slate-800 dark:text-white'}`}>{tab.label}</h4>
                                <p className={`text-[9px] font-black uppercase tracking-widest mt-1 ${activeTab === tab.id ? 'text-indigo-200' : 'text-slate-400'}`}>
                                    {tab.desc}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div className="flex-1">
                    {success && (
                        <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-2xl text-emerald-700 dark:text-emerald-400 text-sm font-bold flex items-center gap-2 animate-in slide-in-from-top-2">
                            <CheckCircleIcon className="w-5 h-5" />
                            {success}
                        </div>
                    )}
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-2xl text-red-700 dark:text-red-400 text-sm font-bold animate-in slide-in-from-top-2">
                            {error}
                        </div>
                    )}

                    <div className="bg-white dark:bg-slate-800/50 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden min-h-[500px]">
                        
                        {/* GENERAL SETTINGS */}
                        {activeTab === 'general' && (
                            <div className="animate-in fade-in duration-300">
                                <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                                    <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                                        <GlobeAltIcon className="w-6 h-6 text-indigo-500" />
                                        Global Platform
                                    </h2>
                                    <p className="text-sm text-slate-500 font-medium mt-1">Configure the root identity of the SaaS platform.</p>
                                </div>
                                <div className="p-8 space-y-6">
                                    <div className="grid grid-cols-1 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Master Platform Name</label>
                                            <input 
                                                type="text" 
                                                value={general.platformName}
                                                onChange={e => setGeneral({...general, platformName: e.target.value})}
                                                className="w-full max-w-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3 text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Global Support Email</label>
                                            <input 
                                                type="email" 
                                                value={general.supportEmail}
                                                onChange={e => setGeneral({...general, supportEmail: e.target.value})}
                                                className="w-full max-w-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3 text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                            />
                                        </div>
                                        <div className="max-w-lg flex items-center justify-between p-5 bg-amber-50 dark:bg-amber-900/10 rounded-2xl border border-amber-100 dark:border-amber-900/30">
                                            <div>
                                                <p className="text-sm font-black text-amber-600 uppercase tracking-tight flex items-center gap-2">
                                                    <ShieldCheckIcon className="w-4 h-4" />
                                                    Maintenance Mode
                                                </p>
                                                <p className="text-[10px] text-amber-700/60 font-medium mt-1">Suspends all tenant portals. API remains active for queued tasks.</p>
                                            </div>
                                            <button 
                                                onClick={() => setGeneral({...general, maintenanceMode: !general.maintenanceMode})}
                                                className={`w-14 h-7 rounded-full transition-all relative ${general.maintenanceMode ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                                            >
                                                <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-sm ${general.maintenanceMode ? 'left-8' : 'left-1'}`} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                                        <button 
                                            onClick={handleSaveGeneral}
                                            disabled={saving || settingsLoading}
                                            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-[11px] uppercase tracking-widest shadow-lg shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50"
                                        >
                                            {saving ? 'Applying...' : 'Save Global Identity'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* API KEYS */}
                        {activeTab === 'api_keys' && (
                            <div className="animate-in fade-in duration-300">
                                <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                                    <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                                        <KeyIcon className="w-6 h-6 text-violet-500" />
                                        Master API Credentials
                                    </h2>
                                    <p className="text-sm text-slate-500 font-medium mt-1">These keys override tenant-specific keys if they fallback to platform billing.</p>
                                </div>
                                <div className="p-8 space-y-6">
                                    <div className="space-y-6 max-w-xl">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Eleven Labs System Key</label>
                                            <input 
                                                type="password" 
                                                value={providerKeys.elevenLabs}
                                                className="w-full bg-slate-100 dark:bg-slate-900/40 border-2 border-slate-200 dark:border-slate-800 rounded-2xl px-5 py-3 text-sm font-mono text-slate-400 cursor-not-allowed outline-none"
                                                disabled
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Twilio Master Account SID</label>
                                            <input 
                                                type="password" 
                                                value={providerKeys.twilioSid}
                                                className="w-full bg-slate-100 dark:bg-slate-900/40 border-2 border-slate-200 dark:border-slate-800 rounded-2xl px-5 py-3 text-sm font-mono text-slate-400 cursor-not-allowed outline-none"
                                                disabled
                                            />
                                        </div>
                                    </div>
                                    <div className="p-5 bg-violet-50 dark:bg-violet-900/10 border border-violet-100 dark:border-violet-900/30 rounded-2xl max-w-xl">
                                        <p className="text-xs text-violet-700 dark:text-violet-400 font-bold leading-relaxed flex items-start gap-3">
                                            <CpuChipIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                            API Keys are hardcoded in the server environment variables for maximum security. Edit the .env file and restart the API layer to apply new keys.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* RESOURCES */}
                        {activeTab === 'resources' && (
                            <div className="animate-in fade-in duration-300">
                                <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                                    <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                                        <ServerIcon className="w-6 h-6 text-blue-500" />
                                        System Throttling
                                    </h2>
                                    <p className="text-sm text-slate-500 font-medium mt-1">Protection against DDoS and runaway tenant campaigns.</p>
                                </div>
                                <div className="p-8 space-y-6">
                                    <div className="flex flex-col md:flex-row gap-6">
                                        <div className="flex-1 space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Global Max Concurrent Calls</label>
                                            <input
                                                type="number"
                                                value={resources.maxConcurrentCalls}
                                                onChange={e => setResources({...resources, maxConcurrentCalls: parseInt(e.target.value) || 0})}
                                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3 text-xl font-black text-slate-800 dark:text-white outline-none"
                                            />
                                            <p className="text-[9px] text-slate-400 ml-1">Hard limit across ALL tenants.</p>
                                        </div>
                                        <div className="flex-1 space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Storage Quota per Org (GB)</label>
                                            <input
                                                type="number"
                                                value={resources.storageQuotaGb}
                                                onChange={e => setResources({...resources, storageQuotaGb: parseInt(e.target.value) || 0})}
                                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3 text-xl font-black text-slate-800 dark:text-white outline-none"
                                            />
                                            <p className="text-[9px] text-slate-400 ml-1">Default data limit for new orgs.</p>
                                        </div>
                                    </div>
                                    <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                                        <button 
                                            onClick={handleSaveResources}
                                            disabled={saving || settingsLoading}
                                            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-[11px] uppercase tracking-widest shadow-lg shadow-blue-600/20 transition-all active:scale-95 disabled:opacity-50"
                                        >
                                            {saving ? 'Applying Limits...' : 'Enforce Limits'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* NOTIFICATIONS */}
                        {activeTab === 'notifications' && (
                            <div className="animate-in fade-in duration-300">
                                <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                                    <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                                        <BellAlertIcon className="w-6 h-6 text-pink-500" />
                                        Audit & Alerts
                                    </h2>
                                    <p className="text-sm text-slate-500 font-medium mt-1">Super Admin notifications for critical system events.</p>
                                </div>
                                <div className="p-8 space-y-4 max-w-xl">
                                    {([
                                        { id: 'daily' as const, label: 'Daily Super Admin Analytics Report' },
                                        { id: 'critical' as const, label: 'Critical Service Disruptions (Twilio/LLM)' },
                                        { id: 'new_org' as const, label: 'New Organization Signup' },
                                        { id: 'wallet' as const, label: 'Tenant Wallet Empty Warning' },
                                    ]).map(item => (
                                        <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800/80">
                                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{item.label}</span>
                                            <input
                                                type="checkbox"
                                                checked={notifications[item.id]}
                                                onChange={e => setNotifications({...notifications, [item.id]: e.target.checked})}
                                                className="w-5 h-5 accent-pink-500"
                                            />
                                        </div>
                                    ))}
                                    <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                                        <button 
                                            onClick={handleSaveNotifications}
                                            disabled={saving || settingsLoading}
                                            className="px-8 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all disabled:opacity-50"
                                        >
                                            {saving ? 'Saving...' : 'Save Preferences'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* BILLING */}
                        {activeTab === 'billing' && (
                            <div className="animate-in fade-in duration-300">
                                <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                                    <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                                        <CurrencyDollarIcon className="w-6 h-6 text-emerald-500" />
                                        Platform Margins & Costs
                                    </h2>
                                    <p className="text-sm text-slate-500 font-medium mt-1">Define the Global Credit value compared to USD.</p>
                                </div>
                                <div className="p-8 space-y-6">
                                    <div className="max-w-xl space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Platform Margin (%)</label>
                                            <input
                                                type="number"
                                                value={billing.platformMargin}
                                                onChange={e => setBilling({ platformMargin: parseInt(e.target.value) || 0 })}
                                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3 text-sm font-bold text-slate-800 dark:text-white outline-none"
                                            />
                                            <p className="text-[9px] text-slate-400 font-medium ml-1">Additional markup applied on top of raw Twilio/ElevenLabs costs.</p>
                                        </div>
                                    </div>
                                    <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                                        <button 
                                            onClick={handleSaveBilling}
                                            disabled={saving || settingsLoading}
                                            className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[11px] uppercase tracking-widest shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
                                        >
                                            {saving ? 'Saving...' : 'Update Margins'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </AppLayout>
    );
};

export default SuperAdminSettingsPage;
