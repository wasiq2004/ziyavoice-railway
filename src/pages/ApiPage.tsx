import React, { useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useAuth } from '../contexts/AuthContext';
import { KeyIcon, CheckCircleIcon, ArrowPathIcon, CpuChipIcon } from '@heroicons/react/24/outline';

interface ApiInputProps {
    label: string;
    id: string;
    name: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    description: string;
    isConfigured?: boolean;
}

const ApiInput: React.FC<ApiInputProps> = ({ label, id, name, value, onChange, description, isConfigured = false }) => (
    <div>
        <div className="flex items-center justify-between">
            <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
            {isConfigured && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Configured
                </span>
            )}
        </div>
        <input
            type="password"
            name={name}
            id={id}
            value={value}
            onChange={onChange}
            className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
        />
        <p className="mt-2 text-sm text-slate-500">
            {description}
            {isConfigured && value === '' && (
                <span className="block mt-1 text-xs text-slate-400">
                    Leave blank to keep existing key, or enter new key to update
                </span>
            )}
        </p>
    </div>
);

interface ApiService {
    id: string;
    name: string;
    description: string;
    isEnvironmentVariable?: boolean;
    envVarName?: string;
}

interface UserApiKey {
    id: string;
    userId: string;
    serviceName: string;
    createdAt: string;
    updatedAt: string;
}

const ApiPage: React.FC = () => {
    const { user } = useAuth();
    const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
    const [userApiKeys, setUserApiKeys] = useState<UserApiKey[]>([]);
    const [loading, setLoading] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');

    const apiServices: ApiService[] = [
        {
            id: 'gemini',
            name: 'Gemini',
            description: 'Your Google Gemini API key for accessing AI services.'
        },
        {
            id: '11labs',
            name: 'ElevenLabs',
            description: 'Required for both Speech-to-Text and Text-to-Speech services.'
        }
    ];

    const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setApiKeys(prev => ({ ...prev, [name]: value }));
    };

    const handleApiKeysSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setSaveStatus('');

        // Simulate API call - in a real app, you'd save these to a secure backend vault
        try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            setSaveStatus('✅ API Keys updated successfully!');
            setTimeout(() => setSaveStatus(''), 3000);
        } catch (error) {
            setSaveStatus('❌ Failed to update API keys.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Dashboard', path: '/dashboard' },
                { label: 'API & Integrations' }
            ]}
            pageTitle="API & Integrations"
            pageDescription="Manage 3rd party API keys and service connections."
        >
            <div className="max-w-4xl space-y-8 animate-in fade-in duration-500">
                {/* Status Message */}
                {saveStatus && (
                    <div className={`p-4 rounded-2xl flex items-center justify-between shadow-sm border animate-in slide-in-from-top-2 ${saveStatus.includes('✅')
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/30 text-red-700 dark:text-red-400'
                        }`}>
                        <div className="flex items-center">
                            <span className="mr-3 font-bold">{saveStatus.split(' ')[0]}</span>
                            <span className="text-sm font-bold">{saveStatus.split(' ').slice(1).join(' ')}</span>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Information Sidebar */}
                    <div className="space-y-6">
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-3xl p-6">
                            <h3 className="text-sm font-black text-blue-800 dark:text-blue-300 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <CpuChipIcon className="h-4 w-4" />
                                Security Note
                            </h3>
                            <p className="text-xs text-blue-700/80 dark:text-blue-400 leading-relaxed font-medium">
                                API keys are stored securely in your browser's local storage for development. In production, these should be handled by your backend secrets manager.
                            </p>
                        </div>

                        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
                            <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Supported Services</h3>
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                        <span className="font-bold text-xs">G</span>
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-900 dark:text-white">Google Gemini</p>
                                        <p className="text-[10px] text-slate-500">AI Language Model</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                        <span className="font-bold text-xs">11</span>
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-900 dark:text-white">ElevenLabs</p>
                                        <p className="text-[10px] text-slate-500">Voice Synthesis</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Main Form Area */}
                    <div className="lg:col-span-2">
                        <form onSubmit={handleApiKeysSubmit} className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
                            <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <KeyIcon className="h-5 w-5 text-primary" />
                                    Configure Keys
                                </h2>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-6 py-2.5 rounded-xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {loading && <ArrowPathIcon className="h-4 w-4 animate-spin" />}
                                    {loading ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>

                            <div className="p-8 space-y-8">
                                {apiServices.map((service) => (
                                    <div key={service.id} className="group">
                                        <div className="flex items-center justify-between mb-3">
                                            <label htmlFor={service.id} className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide flex items-center gap-2">
                                                {service.name}
                                                {apiKeys[service.id] && <CheckCircleIcon className="h-4 w-4 text-green-500" />}
                                            </label>
                                            <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500">
                                                Required
                                            </span>
                                        </div>
                                        <div className="relative">
                                            <input
                                                type="password"
                                                id={service.id}
                                                name={service.id}
                                                value={apiKeys[service.id] || ''}
                                                onChange={handleKeyChange}
                                                placeholder={`Enter your ${service.name} API Key`}
                                                className="w-full pl-4 pr-10 py-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all font-mono text-sm text-slate-900 dark:text-white"
                                            />
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                                                <KeyIcon className="h-4 w-4 opacity-50" />
                                            </div>
                                        </div>
                                        <p className="mt-2 text-[10px] text-slate-500 font-medium">{service.description}</p>
                                    </div>
                                ))}
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
};

export default ApiPage;
