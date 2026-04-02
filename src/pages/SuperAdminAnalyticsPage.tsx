import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import KPICard from '../components/KPICard';
import {
    PresentationChartBarIcon,
    ArrowPathIcon,
    UsersIcon,
    BuildingOfficeIcon,
    CircleStackIcon,
    CpuChipIcon,
} from '@heroicons/react/24/outline';
import { getSuperAdminStats } from '../utils/superAdminApi';

const SuperAdminAnalyticsPage: React.FC = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const userStr = localStorage.getItem('ziya-user');
        if (!userStr) { navigate('/login'); return; }
        const user = JSON.parse(userStr);
        if (user.role !== 'super_admin') { navigate('/login'); return; }
        fetchStats();
    }, [navigate]);

    const fetchStats = async () => {
        setLoading(true);
        try {
            const data = await getSuperAdminStats();
            setStats(data.stats || data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const formatNumber = (n: number = 0) => new Intl.NumberFormat('en-US').format(n);

    const metricCards = [
        { label: 'Total Organizations', value: stats?.totalOrganizations, icon: BuildingOfficeIcon, color: 'from-violet-500 to-purple-600', glow: 'shadow-violet-500/30' },
        { label: 'Total Users', value: stats?.totalUsers, icon: UsersIcon, color: 'from-emerald-500 to-teal-600', glow: 'shadow-emerald-500/30' },
        { label: 'Active Users (Month)', value: stats?.activeUsers, icon: UsersIcon, color: 'from-blue-500 to-indigo-600', glow: 'shadow-blue-500/30' },
        { label: 'Total Credits Used', value: stats?.totalCreditsUsed, icon: CircleStackIcon, color: 'from-amber-500 to-orange-600', glow: 'shadow-amber-500/30', suffix: ' CR' },
    ];

    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Super Admin', path: '/superadmin/dashboard' },
                { label: 'Platform Analytics' },
            ]}
            pageTitle="Platform Analytics"
            pageDescription="Platform-wide usage metrics, credits consumption, and growth data."
            primaryAction={
                <button onClick={fetchStats} className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 font-bold text-sm hover:bg-slate-50 transition-all">
                    <ArrowPathIcon className="w-4 h-4 mr-2" />Refresh
                </button>
            }
        >
            <div className="space-y-8 animate-in fade-in duration-500">
                {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl text-red-700 dark:text-red-400 text-sm">{error}</div>
                )}

                {/* KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {metricCards.map((card) => (
                        <KPICard 
                            key={card.label} 
                            title={card.label} 
                            value={`${formatNumber(card.value || 0)}${card.suffix || ''}`}
                            color={
                                card.color.includes('violet') ? 'purple' :
                                card.color.includes('emerald') ? 'green' :
                                card.color.includes('blue') ? 'blue' :
                                card.color.includes('amber') ? 'gray' : 'gray'
                            }
                        />
                    ))}
                </div>

                {/* Service Usage */}
                {stats?.serviceUsage && stats.serviceUsage.length > 0 && (
                    <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                            <CpuChipIcon className="w-5 h-5 text-violet-500" />
                            <h2 className="text-lg font-bold text-slate-800 dark:text-white">Service Usage (This Month)</h2>
                        </div>
                        <div className="p-6">
                            <div className="space-y-4">
                                {stats.serviceUsage.map((s: any) => {
                                    const maxUsage = Math.max(...stats.serviceUsage.map((x: any) => x.total_usage), 1);
                                    const pct = (s.total_usage / maxUsage) * 100;
                                    const colorMap: Record<string, string> = {
                                        elevenlabs: 'bg-violet-500',
                                        gemini: 'bg-blue-500',
                                        deepgram: 'bg-emerald-500',
                                    };
                                    return (
                                        <div key={s.service_name}>
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 capitalize">{s.service_name}</span>
                                                <div className="text-right">
                                                    <span className="text-sm font-black text-slate-900 dark:text-white">{formatNumber(s.total_usage)}</span>
                                                    <span className="text-xs text-slate-400 ml-2 font-semibold">{s.user_count} users</span>
                                                </div>
                                            </div>
                                            <div className="h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${colorMap[s.service_name] || 'bg-primary'} rounded-full transition-all duration-700`}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Organization Breakdown */}
                {stats?.orgBreakdown && stats.orgBreakdown.length > 0 && (
                    <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                            <BuildingOfficeIcon className="w-5 h-5 text-violet-500" />
                            <h2 className="text-lg font-bold text-slate-800 dark:text-white">Organizations Overview</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-100 dark:border-slate-800">
                                        <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Organization</th>
                                        <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Users</th>
                                        <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Admins</th>
                                        <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {stats.orgBreakdown.map((org: any) => (
                                        <tr key={org.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400 font-black text-xs">
                                                        {org.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="font-bold text-slate-900 dark:text-white text-sm">{org.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-300 text-sm">{org.user_count || 0}</td>
                                            <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-300 text-sm">{org.admin_count || 0}</td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${org.status === 'active'
                                                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                                    }`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${org.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                                    {org.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </AppLayout>
    );
};

export default SuperAdminAnalyticsPage;
