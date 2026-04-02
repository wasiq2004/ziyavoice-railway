import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import {
    UserCircleIcon,
    PhotoIcon,
    GlobeAltIcon,
    ArrowPathIcon,
    CloudArrowUpIcon,
    CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { getApiBaseUrl, getApiPath } from '../utils/api';

const AdminSettingsPage: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    
    // Form states
    const [profile, setProfile] = useState({
        name: '',
        email: '',
        username: '',
    });
    
    const [branding, setBranding] = useState({
        logoUrl: '',
        customDomain: '',
    });

    const getAdminUser = () => {
        const raw = localStorage.getItem('ziya-user');
        return raw ? JSON.parse(raw) : null;
    };

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
        
        setProfile({
            name: parsed.name || '',
            email: parsed.email || '',
            username: parsed.username || '',
        });
        
        setBranding({
            logoUrl: parsed.organization_logo || '',
            customDomain: parsed.custom_domain || '',
        });
    }, [navigate]);

    const showSuccess = (msg: string) => {
        setSuccessMessage(msg);
        setErrorMessage('');
        setTimeout(() => setSuccessMessage(''), 3000);
    };
    const showError = (msg: string) => {
        setErrorMessage(msg);
        setTimeout(() => setErrorMessage(''), 4000);
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        const admin = getAdminUser();
        if (!admin) return;
        setSaving(true);
        try {
            const API = getApiBaseUrl();
            const res = await fetch(`${API}${getApiPath()}/admin/profile/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: admin.id,
                    name: profile.name,
                    username: profile.username,
                }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'Update failed');
            // Sync localStorage so header/nav reflects changes
            const updated = { ...admin, name: profile.name, username: profile.username };
            localStorage.setItem('ziya-user', JSON.stringify(updated));
            showSuccess('Profile updated successfully!');
        } catch (err: any) {
            showError(err.message || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveBranding = async (e: React.FormEvent) => {
        e.preventDefault();
        const admin = getAdminUser();
        if (!admin) return;
        setSaving(true);
        try {
            const API = getApiBaseUrl();
            const res = await fetch(`${API}${getApiPath()}/admin/branding/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    adminId: admin.id,
                    logoUrl: branding.logoUrl,
                    customDomain: branding.customDomain,
                }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'Branding update failed');
            showSuccess('Branding settings updated!');
        } catch (err: any) {
            showError(err.message || 'Failed to update branding');
        } finally {
            setSaving(false);
        }
    };


    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Admin', path: '/admin/dashboard' },
                { label: 'Settings' }
            ]}
            pageTitle="Organization Settings"
            pageDescription="Manage your administrative profile, branding, and custom domain configuration."
        >
            <div className="max-w-4xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {successMessage && (
                    <div className="flex items-center p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-2xl text-emerald-700 dark:text-emerald-400 text-sm font-bold">
                        <CheckCircleIcon className="w-5 h-5 mr-3" />
                        {successMessage}
                    </div>
                )}
                {errorMessage && (
                    <div className="flex items-center p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-2xl text-red-700 dark:text-red-400 text-sm font-bold">
                        {errorMessage}
                    </div>
                )}

                {/* Profile Section */}
                <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-xl">
                            <UserCircleIcon className="w-5 h-5 text-primary" />
                        </div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">Admin Profile</h3>
                    </div>
                    <form onSubmit={handleSaveProfile} className="p-6 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                                <input
                                    type="text"
                                    value={profile.name}
                                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                                    placeholder="Enter your name"
                                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Username</label>
                                <input
                                    type="text"
                                    value={profile.username}
                                    onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                                    placeholder="Choose a username"
                                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                            <input
                                type="email"
                                value={profile.email}
                                disabled
                                className="w-full bg-slate-100 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-400 cursor-not-allowed outline-none"
                            />
                            <p className="text-[9px] text-slate-400 font-bold ml-1 italic">* Email cannot be changed</p>
                        </div>
                        <div className="pt-2 flex justify-end">
                            <button
                                type="submit"
                                disabled={saving}
                                className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : 'Update Profile'}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Branding & Whitelabel Section */}
                <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                        <div className="p-2 bg-purple-500/10 rounded-xl">
                            <PhotoIcon className="w-5 h-5 text-purple-500" />
                        </div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">Branding & Whitelabel</h3>
                    </div>
                    <form onSubmit={handleSaveBranding} className="p-6 space-y-6">
                        {/* Logo Upload */}
                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Brand Logo</label>
                            <div className="flex items-center gap-6 p-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
                                <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 flex items-center justify-center overflow-hidden">
                                    {branding.logoUrl ? (
                                        <img src={branding.logoUrl} alt="Logo Preview" className="max-w-full max-h-full object-contain" />
                                    ) : (
                                        <PhotoIcon className="w-8 h-8 text-slate-300" />
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Upload your organization logo</p>
                                    <p className="text-[10px] text-slate-400 font-medium">Recommended: PNG or SVG with transparent background. Max size: 2MB.</p>
                                    <button
                                        type="button"
                                        className="inline-flex items-center space-x-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 transition-all shadow-sm"
                                    >
                                        <CloudArrowUpIcon className="w-4 h-4" />
                                        <span>Select Image</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Custom Domain */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                <GlobeAltIcon className="w-3 h-3" />
                                Custom Domain
                            </label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">https://</span>
                                <input
                                    type="text"
                                    value={branding.customDomain}
                                    onChange={(e) => setBranding({ ...branding, customDomain: e.target.value })}
                                    placeholder="voice.yourdomain.com"
                                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl pl-16 pr-4 py-2.5 text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                                />
                            </div>
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-xl">
                                <p className="text-[10px] text-blue-700 dark:text-blue-400 font-bold leading-relaxed">
                                    To use a custom domain, point your CNAME record to <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">lb.ziyavoice.com</code> in your DNS settings. TLS/SSL will be automatically provisioned.
                                </p>
                            </div>
                        </div>

                        <div className="pt-2 flex justify-end">
                            <button
                                type="submit"
                                disabled={saving}
                                className="px-6 py-2.5 bg-slate-900 dark:bg-white dark:text-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-slate-900/20 dark:shadow-none disabled:opacity-50"
                            >
                                {saving ? 'Applying...' : 'Save Branding'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </AppLayout>
    );
};

export default AdminSettingsPage;
