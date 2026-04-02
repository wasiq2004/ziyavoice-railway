import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import {
    AdjustmentsHorizontalIcon,
    CurrencyDollarIcon,
    GlobeAltIcon,
    CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { getApiBaseUrl } from '../utils/api';

const API_BASE_URL = `${getApiBaseUrl()}/api`;

const SuperAdminPricingPage: React.FC = () => {
    const navigate = useNavigate();

    // Data state
    const [services, setServices] = useState<any[]>([]);
    const [config, setConfig] = useState<any>({ usdToInrRate: 0, inrToCreditRate: 0, hiddenProfitPercentage: 0 });
    
    // UI state
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Editing State for Services
    const [editedServices, setEditedServices] = useState<Record<string, string>>({});

    // Editing State for Config
    const [editedConfig, setEditedConfig] = useState<any>({});

    const userStr = localStorage.getItem('ziya-user');
    const currentUser = userStr ? JSON.parse(userStr) : null;

    useEffect(() => {
        if (!currentUser || currentUser.role !== 'super_admin') { navigate('/login'); return; }
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [servicesRes, configRes] = await Promise.all([
                fetch(`${API_BASE_URL}/superadmin/pricing/services`),
                fetch(`${API_BASE_URL}/superadmin/pricing/config`)
            ]);

            const sData = await servicesRes.json();
            const cData = await configRes.json();

            if (sData.success) {
                setServices(sData.pricing);
                const exSvcs: Record<string, string> = {};
                sData.pricing.forEach((p: any) => { exSvcs[p.service_type] = p.cost_per_unit.toString(); });
                setEditedServices(exSvcs);
            }
            if (cData.success) {
                setConfig(cData.config);
                setEditedConfig({
                    usdToInrRate: cData.config.usdToInrRate.toString(),
                    inrToCreditRate: cData.config.inrToCreditRate.toString(),
                    hiddenProfitPercentage: (cData.config.hiddenProfitPercentage * 100).toString(), // convert to %
                });
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load pricing data');
        } finally {
            setLoading(false);
        }
    };

    const showMessage = (msg: string, isError = false) => {
        if (isError) setError(msg);
        else setSuccess(msg);
        setTimeout(() => { setError(''); setSuccess(''); }, 3000);
    };

    const handleSaveService = async (serviceType: string) => {
        const costStr = editedServices[serviceType];
        if (!costStr || isNaN(parseFloat(costStr))) return showMessage('Invalid cost amount', true);

        setSaving(serviceType);
        try {
            const res = await fetch(`${API_BASE_URL}/superadmin/pricing/services/${serviceType}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ costPerUnit: parseFloat(costStr) })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            showMessage(`Service ${serviceType} updated successfully!`);
            fetchData();
        } catch (err: any) {
            showMessage(err.message, true);
        } finally {
            setSaving(null);
        }
    };

    const handleSaveConfig = async () => {
        setSaving('config');
        try {
            const res = await fetch(`${API_BASE_URL}/superadmin/pricing/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    usdToInrRate: parseFloat(editedConfig.usdToInrRate),
                    inrToCreditRate: parseFloat(editedConfig.inrToCreditRate),
                    hiddenProfitPercentage: parseFloat(editedConfig.hiddenProfitPercentage) / 100 // Convert back to decimal
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            showMessage('Platform exchange rates and margins updated successfully!');
            fetchData();
        } catch (err: any) {
            showMessage(err.message, true);
        } finally {
            setSaving(null);
        }
    };

    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Super Admin', path: '/superadmin/dashboard' },
                { label: 'Price Management' },
            ]}
            pageTitle="Price Management"
            pageDescription="Manage RAW API costs and control exact profit margins and currency mappings centrally."
        >
            <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto">
                {/* Alerts */}
                {error && <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl text-red-700 dark:text-red-400 text-sm font-medium">{error}</div>}
                {success && <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-emerald-700 dark:text-emerald-400 text-sm font-medium flex gap-2 items-center"><CheckCircleIcon className="w-5 h-5"/>{success}</div>}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    
                    {/* Raw API Costs Table */}
                    <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                            <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                                <CurrencyDollarIcon className="w-6 h-6 text-emerald-500" /> RAW Vendor Routing Costs
                            </h2>
                            <p className="text-sm text-slate-500 mt-1">This defines the exact dollar amount we pay to Twilio, ElevenLabs, etc. These values are in USD.</p>
                        </div>
                        
                        <div className="p-6 flex-1">
                            {loading ? (
                                <div className="space-y-4">
                                    {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-slate-100 dark:bg-slate-700/50 rounded-xl animate-pulse" />)}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {services.map(svc => (
                                        <div key={svc.service_type} className="flex items-center gap-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                                            <div className="flex-1">
                                                <h3 className="font-bold text-slate-900 dark:text-white capitalize">{svc.service_type.replace('_', ' ')}</h3>
                                                <p className="text-xs text-slate-500 uppercase font-black tracking-widest mt-1">Cost per {svc.unit_type}</p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="relative w-32">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">$</span>
                                                    <input 
                                                        type="number" 
                                                        step="0.000001"
                                                        value={editedServices[svc.service_type] || ''}
                                                        onChange={(e) => setEditedServices({...editedServices, [svc.service_type]: e.target.value})}
                                                        className="w-full pl-7 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-bold shadow-inner text-slate-900 dark:text-white"
                                                    />
                                                </div>
                                                <button 
                                                    onClick={() => handleSaveService(svc.service_type)}
                                                    disabled={saving === svc.service_type || editedServices[svc.service_type] === svc.cost_per_unit.toString()}
                                                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg font-bold text-sm transition-all shadow-md active:scale-95 whitespace-nowrap"
                                                >
                                                    {saving === svc.service_type ? 'Saving...' : 'Update'}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Platform Config Multipliers */}
                    <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-gradient-to-r from-violet-500/10 to-transparent">
                            <div>
                                <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                                    <GlobeAltIcon className="w-6 h-6 text-violet-500" /> Exchange & Margin Control
                                </h2>
                                <p className="text-sm text-slate-500 mt-1">Control how raw USD cost translates to User Credits.</p>
                            </div>
                        </div>

                        <div className="p-6 flex-1">
                            {loading ? (
                                <div className="space-y-6">
                                    {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-slate-100 dark:bg-slate-700/50 rounded-xl animate-pulse" />)}
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    
                                    {/* USD to INR */}
                                    <div className="group">
                                        <label className="flex items-center justify-between text-sm font-black text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">
                                            <span>USD to INR Rate</span>
                                            <span className="text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[10px]">Multiplier</span>
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">₹</span>
                                            <input 
                                                type="number" step="0.01"
                                                value={editedConfig.usdToInrRate || ''}
                                                onChange={e => setEditedConfig({...editedConfig, usdToInrRate: e.target.value})}
                                                className="w-full pl-9 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:border-violet-500 focus:ring-violet-500 text-lg font-black text-slate-900 dark:text-white transition-all shadow-inner"
                                            />
                                        </div>
                                    </div>

                                    {/* INR to Credit */}
                                    <div className="group">
                                        <label className="flex items-center justify-between text-sm font-black text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">
                                            <span>INR to Credit Ratio</span>
                                            <span className="text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[10px]">Multiplier</span>
                                        </label>
                                        <div className="relative border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/50 shadow-inner overflow-hidden flex">
                                            <div className="px-4 py-3.5 bg-slate-100 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 font-black text-slate-500">₹1 = </div>
                                            <input 
                                                type="number" step="1"
                                                value={editedConfig.inrToCreditRate || ''}
                                                onChange={e => setEditedConfig({...editedConfig, inrToCreditRate: e.target.value})}
                                                className="w-full px-4 py-3.5 bg-transparent border-none outline-none text-lg font-black text-slate-900 dark:text-white"
                                            />
                                            <div className="px-4 py-3.5 text-slate-400 font-bold bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700">Credits</div>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-dashed border-slate-200 dark:border-slate-700"></div>

                                    {/* Profit Margin */}
                                    <div className="group">
                                        <label className="flex items-center justify-between text-sm font-black text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">
                                            <span className="text-violet-600 dark:text-violet-400">Target Profit Margin</span>
                                            <span className="text-violet-500/80 bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 rounded text-[10px]">Markup added to Voice Calls</span>
                                        </label>
                                        <div className="relative">
                                            <input 
                                                type="number" step="1"
                                                value={editedConfig.hiddenProfitPercentage || ''}
                                                onChange={e => setEditedConfig({...editedConfig, hiddenProfitPercentage: e.target.value})}
                                                className="w-full pl-4 pr-12 py-3.5 bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800 rounded-xl outline-none focus:ring-2 focus:border-violet-500 focus:ring-violet-500 text-2xl font-black text-violet-700 dark:text-violet-300 transition-all shadow-inner"
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-violet-400 text-xl">%</span>
                                        </div>
                                    </div>

                                    <div className="pt-2">
                                        <button 
                                            onClick={handleSaveConfig}
                                            disabled={saving === 'config'}
                                            className="w-full py-4 bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 disabled:opacity-70 text-white rounded-xl font-black text-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all outline-none"
                                        >
                                            {saving === 'config' ? 'Deploying Config...' : 'Save Global Multipliers'}
                                        </button>
                                        <p className="text-center text-xs text-slate-400 font-medium mt-3">Changes here take effect immediately for all active agents.</p>
                                    </div>

                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
};

export default SuperAdminPricingPage;
