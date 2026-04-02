import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { agentService } from '../services/agentService';
import { phoneNumberService } from '../services/phoneNumberService';
import { useAuth } from '../contexts/AuthContext';
import AppLayout from '../components/AppLayout';
import {
    UserGroupIcon,
    PhoneIcon,
    SignalIcon,
    CircleStackIcon,
    PlusIcon,
    ChartBarIcon,
    Cog6ToothIcon,
    ArrowPathIcon,
    ClockIcon
} from '@heroicons/react/24/outline';
import { fetchCampaigns, getApiPath } from '../utils/api';
import KPICard from '../components/KPICard';
import Skeleton from '../components/Skeleton';

const DashboardPage: React.FC = () => {
    const navigate = useNavigate();
    const [agentCount, setAgentCount] = useState(0);
    const [phoneNumberCount, setPhoneNumberCount] = useState(0);
    const [activeCalls, setActiveCalls] = useState(0);
    const [credits, setCredits] = useState<number | string>('--');
    const [stats, setStats] = useState({
        totalCampaigns: 0,
        activeCampaigns: 0,
        totalCalls: 0,
        conversionRate: 0,
        totalLeads: 0
    });
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const { user } = useAuth();

    useEffect(() => {
        // Check if user is admin
        const adminData = localStorage.getItem('admin');
        setIsAdmin(!!adminData);

        if (user) {
            loadData();
        }
    }, [user]);

    const loadData = async () => {
        try {
            setLoading(true);

            // Fetch agents
            const agents = await agentService.getAgents(user!.id);
            setAgentCount(agents.length);

            // Fetch phone numbers
            const phoneNumbers = await phoneNumberService.getPhoneNumbers(user!.id);
            setPhoneNumberCount(phoneNumbers.length);

            // TODO: Fetch active calls from API when endpoint is available
            setActiveCalls(0);

            // Fetch campaigns for analytics
            const campaignRes = await fetchCampaigns(user!.id);
            if (campaignRes.success && campaignRes.data) {
                const camps = campaignRes.data;
                const totalCampaigns = camps.length;
                const activeCampaigns = camps.filter((c: any) => c.status === 'running').length;
                const totalLeads = camps.reduce((sum: number, c: any) => sum + (c.total_contacts || 0), 0);
                const totalCalls = camps.reduce((sum: number, c: any) => sum + (c.completed_calls || 0), 0);
                const conversionRate = totalLeads > 0 ? Math.round((totalCalls / totalLeads) * 100) : 0;

                setStats({
                    totalCampaigns,
                    activeCampaigns,
                    totalCalls,
                    conversionRate,
                    totalLeads
                });
            }

            // Fetch real wallet balance
            try {
                const API_BASE = (await import('../utils/api')).getApiBaseUrl();
                const walletRes = await fetch(`${API_BASE}${getApiPath()}/wallet/balance/${user!.id}`);
                if (walletRes.ok) {
                    const walletData = await walletRes.json();
                    setCredits(Math.round(walletData.balance || 0));
                } else {
                    setCredits(0);
                }
            } catch {
                setCredits('--');
            }

        } catch (error) {
            console.error('Error loading dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };


    if (loading) {
        return (
            <AppLayout
                breadcrumbs={[{ label: 'Dashboard' }]}
                pageTitle="Dashboard"
                pageDescription="Welcome back, let's see what's happening today."
            >
                {/* Stats Grid Skeleton */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 stagger-children mb-8">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 md:p-6">
                            <div className="flex items-center">
                                <Skeleton width={48} height={48} variant="rounded" />
                                <div className="ml-4 space-y-2">
                                    <Skeleton width={80} height={12} variant="text" />
                                    <Skeleton width={40} height={24} variant="text" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 stagger-children">
                    {/* Analytics Skeleton */}
                    <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 md:p-6">
                        <Skeleton width={150} height={24} variant="text" className="mb-6" />
                        <div className="grid grid-cols-2 gap-4">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="col-span-1 border border-slate-100 dark:border-slate-800 rounded-2xl p-4">
                                    <Skeleton width={100} height={12} variant="text" className="mb-2" />
                                    <Skeleton width={60} height={28} variant="text" />
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 border border-slate-100 dark:border-slate-800 rounded-2xl p-4">
                            <Skeleton width={120} height={12} variant="text" className="mb-2" />
                            <Skeleton width={80} height={28} variant="text" />
                        </div>
                    </div>

                    {/* Quick Actions Skeleton */}
                    <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 md:p-6">
                        <Skeleton width={120} height={24} variant="text" className="mb-6" />
                        <div className="grid grid-cols-2 gap-3 md:gap-4">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
                                    <Skeleton width={48} height={48} variant="rounded" className="mb-3" />
                                    <Skeleton width={100} height={14} variant="text" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout
            breadcrumbs={[{ label: 'Dashboard' }]}
            pageTitle="Dashboard"
            pageDescription="Complete overview of your voice AI agents and campaign performance."
        >

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 stagger-children">
                <KPICard title="Total Agents" value={agentCount} color="blue" />
                <KPICard title="Active Calls" value={activeCalls} color="green" />
                <KPICard title="Phone Numbers" value={phoneNumberCount} color="purple" />
                <KPICard title="Total Credits" value={credits} color="gray" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 stagger-children">
                <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 md:p-6">
                    <h2 className="text-lg md:text-xl font-bold text-slate-800 dark:text-white mb-6">Overall Analytics</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-1">
                            <KPICard title="Total Campaigns" value={stats.totalCampaigns} color="blue" />
                        </div>
                        <div className="col-span-1">
                            <KPICard title="Active Campaigns" value={stats.activeCampaigns} color="green" />
                        </div>
                        <div className="col-span-1">
                            <KPICard title="Total Calls" value={stats.totalCalls} color="gray" />
                        </div>
                        <div className="col-span-1">
                            <KPICard title="Total Leads" value={stats.totalLeads} color="purple" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <KPICard title="Conversion Rate" value={`${stats.conversionRate}%`} color="red" />
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 md:p-6">
                    <h2 className="text-lg md:text-xl font-bold text-slate-800 dark:text-white mb-6">Quick Actions</h2>
                    <div className="grid grid-cols-2 gap-3 md:gap-4">
                        <button
                            onClick={() => navigate('/agents')}
                            className="group flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-primary/50 hover:bg-primary/5 transition-all duration-300 transform hover:scale-[1.02]">
                            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl shadow-sm text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300">
                                <PlusIcon className="h-6 w-6" />
                            </div>
                            <span className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-300 tracking-tight">Create Agent</span>
                        </button>
                        <button
                            onClick={() => navigate('/phone-numbers')}
                            className="group flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-primary/50 hover:bg-primary/5 transition-all duration-300 transform hover:scale-[1.02]">
                            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl shadow-sm text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300">
                                <PhoneIcon className="h-6 w-6" />
                            </div>
                            <span className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-300 tracking-tight">Import Number</span>
                        </button>
                        <button
                            onClick={() => navigate('/campaigns')}
                            className="group flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-primary/50 hover:bg-primary/5 transition-all duration-300 transform hover:scale-[1.02]">
                            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl shadow-sm text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300">
                                <ChartBarIcon className="h-6 w-6" />
                            </div>
                            <span className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-300 tracking-tight">View Reports</span>
                        </button>
                        <button
                            onClick={() => navigate('/settings')}
                            className="group flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-primary/50 hover:bg-primary/5 transition-all duration-300 transform hover:scale-[1.02]">
                            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl shadow-sm text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300">
                                <Cog6ToothIcon className="h-6 w-6" />
                            </div>
                            <span className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-300 tracking-tight">Settings</span>
                        </button>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
};

export default DashboardPage;