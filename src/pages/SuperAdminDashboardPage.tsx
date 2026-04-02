import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import Skeleton from '../components/Skeleton';
import KPICard from '../components/KPICard';
import { getSuperAdminStats } from '../utils/superAdminApi';
import { getAuditLogs } from '../utils/adminApi';
import {
    BuildingOfficeIcon,
    UsersIcon,
    UserGroupIcon,
    CircleStackIcon,
    ArrowPathIcon,
    ChartBarIcon,
    ArrowTrendingUpIcon,
    CurrencyDollarIcon,
    PresentationChartBarIcon,
} from '@heroicons/react/24/outline';

const SuperAdminDashboardPage: React.FC = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [recentEvents, setRecentEvents] = useState<any[]>([]);
    const [eventsLoading, setEventsLoading] = useState(true);

    useEffect(() => {
        // Verify super admin access
        const userStr = localStorage.getItem('ziya-user');
        if (!userStr) { navigate('/login'); return; }
        const user = JSON.parse(userStr);
        if (user.role !== 'super_admin') { navigate('/login'); return; }
        fetchStats();
        fetchRecentEvents();
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

    const fetchRecentEvents = async () => {
        setEventsLoading(true);
        try {
            const logsData = await getAuditLogs(1, 5);
            const mapped = (logsData.logs || []).map((log: any) => {
                const type = log.action_type?.toLowerCase() || '';
                const isCredit = type.includes('credit') || type.includes('billing');
                const isOrg = type.includes('org') || type.includes('create');
                const isLogin = type.includes('login') || type.includes('imperson');

                const diff = Date.now() - new Date(log.created_at).getTime();
                const mins = Math.floor(diff / 60000);
                const hours = Math.floor(mins / 60);
                const timeStr = hours > 24 ? `${Math.floor(hours / 24)}d ago` : hours > 0 ? `${hours}h ago` : mins > 0 ? `${mins}m ago` : 'Just now';

                return {
                    event: log.action_type?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Admin Action',
                    target: log.details || log.target_user_email || '—',
                    time: timeStr,
                    icon: isCredit ? CircleStackIcon : isOrg ? BuildingOfficeIcon : isLogin ? UsersIcon : ChartBarIcon,
                    color: isCredit ? 'text-amber-500' : isOrg ? 'text-violet-500' : isLogin ? 'text-blue-500' : 'text-slate-500',
                    bg: isCredit ? 'bg-amber-500/10' : isOrg ? 'bg-violet-500/10' : isLogin ? 'bg-blue-500/10' : 'bg-slate-500/10',
                };
            });
            setRecentEvents(mapped);
        } catch (_) {
            setRecentEvents([]);
        } finally {
            setEventsLoading(false);
        }
    };


    const kpis = [
        { label: 'Total Users', value: stats?.totalUsers ?? 0, icon: UsersIcon, color: 'blue' as const },
        { label: 'Total Agents', value: stats?.totalAgents ?? 0, icon: UserGroupIcon, color: 'purple' as const },
        { label: 'Total Organizations', value: stats?.totalOrganizations ?? 0, icon: BuildingOfficeIcon, color: 'green' as const },
        { label: 'Credit Usage', value: stats?.totalCreditsUsed ?? 0, icon: CircleStackIcon, color: 'red' as const, suffix: ' CR' },
        { label: 'Credit Available', value: stats?.totalCreditsAvailable ?? 0, icon: CurrencyDollarIcon, color: 'blue' as const, suffix: ' CR' },
    ];

    const userStr = localStorage.getItem('ziya-user');
    const userData = userStr ? JSON.parse(userStr) : null;

    return (
        <AppLayout
            breadcrumbs={[{ label: 'Super Admin', path: '/superadmin/dashboard' }, { label: 'Dashboard' }]}
            pageTitle="Super Admin Dashboard"
            pageDescription={`Platform-wide control center. Welcome, ${userData?.username || userData?.email || 'Super Admin'}`}
            primaryAction={
                <button
                    onClick={fetchStats}
                    className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-all font-bold text-sm shadow-sm"
                >
                    <ArrowPathIcon className="w-4 h-4 mr-2" />
                    Refresh
                </button>
            }
        >
            <div className="space-y-8 animate-in fade-in duration-500">
                {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-2xl text-red-700 dark:text-red-400 text-sm font-medium">
                        {error}
                    </div>
                )}

                {/* KPI Snapboxes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                    {kpis.map((kpi) => (
                        <KPICard 
                            key={kpi.label}
                            title={kpi.label}
                            value={`${kpi.value.toLocaleString()}${kpi.suffix || ''}`}
                            color={kpi.color}
                        />
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Organization Overview Chart Placeholder */}
                    <div className="lg:col-span-2 bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-xl">
                                    <PresentationChartBarIcon className="w-5 h-5 text-primary" />
                                </div>
                                <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">Organization Growth</h3>
                            </div>
                            <div className="flex gap-2">
                                <span className="px-3 py-1 bg-slate-100 dark:bg-slate-900 rounded-lg text-[10px] font-bold text-slate-500 uppercase tracking-wider">7 Days</span>
                                <span className="px-3 py-1 bg-primary text-white rounded-lg text-[10px] font-bold uppercase tracking-wider">30 Days</span>
                            </div>
                        </div>
                        
                        {/* Mock Chart Area */}
                        <div className="h-64 flex items-end justify-between gap-1 px-2 pt-4 relative">
                            {/* Grid Lines */}
                            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-8">
                                {[...Array(5)].map((_, i) => (
                                    <div key={i} className="w-full h-px bg-slate-100 dark:bg-slate-800/50"></div>
                                ))}
                            </div>
                            {/* Bars */}
                            {[40, 65, 45, 80, 55, 90, 70, 85, 60, 100, 75, 95].map((val, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center group h-full justify-end relative z-10 w-full">
                                    <div 
                                        className="w-full bg-primary/20 hover:bg-primary transition-all rounded-t-lg relative" 
                                        style={{ height: `${val}%` }}
                                    >
                                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] font-black px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                            {val}%
                                        </div>
                                    </div>
                                    <span className="text-[8px] font-bold text-slate-400 mt-2 uppercase">Jan</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Top Organizations by Usage */}
                    <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-amber-500/10 rounded-xl">
                                <ArrowTrendingUpIcon className="w-5 h-5 text-amber-500" />
                            </div>
                            <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">Top Consumption</h3>
                        </div>
                        <div className="space-y-4">
                            {loading ? (
                                [...Array(5)].map((_, i) => <Skeleton key={i} height={40} className="rounded-xl" />)
                            ) : stats?.orgBreakdown?.slice(0, 5).map((org: any, i: number) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800/50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-xs font-black">
                                            {i + 1}
                                        </div>
                                        <div className="overflow-hidden">
                                            <p className="text-xs font-bold text-slate-800 dark:text-white truncate w-24">{org.name}</p>
                                            <p className="text-[9px] text-slate-400 font-bold uppercase">{org.user_count || 0} Users</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs font-black text-primary">{(org.credits_used || 0).toLocaleString()} CR</p>
                                        <p className="text-[8px] font-bold text-emerald-500 uppercase tracking-tighter">Usage +12%</p>
                                    </div>
                                </div>
                            )) || (
                                <div className="py-10 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">
                                    No organization data
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Audit Log / Recent Events Placeholder */}
                <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden mt-8">
                    <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
                        <div className="flex items-center gap-3">
                           <div className="p-1.5 bg-slate-200/50 dark:bg-slate-700/50 rounded-lg">
                               <ChartBarIcon className="w-4 h-4 text-slate-500" />
                           </div>
                           <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">Global Platform Events</h3>
                        </div>
                        <button className="text-xs font-bold text-primary hover:underline underline-offset-4 decoration-primary/30 py-1 px-3 rounded-lg hover:bg-primary/5 transition-all">View All Activity</button>
                    </div>
                     <div className="divide-y divide-slate-50 dark:divide-slate-800">
                        {eventsLoading ? (
                            [...Array(4)].map((_, i) => (
                                <div key={i} className="p-5 flex items-center gap-4 animate-pulse">
                                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0" />
                                    <div className="space-y-2 flex-1">
                                        <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/3" />
                                        <div className="h-2 bg-slate-50 dark:bg-slate-900 rounded w-1/2" />
                                    </div>
                                </div>
                            ))
                        ) : recentEvents.length === 0 ? (
                            <div className="p-8 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
                                No recent platform events
                            </div>
                        ) : (
                            recentEvents.map((item, i) => (
                                <div key={i} className="p-5 flex items-center justify-between hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors group">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-3 rounded-xl ${item.bg} ${item.color} group-hover:scale-105 transition-transform`}>
                                            <item.icon className="w-5 h-5" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <p className="text-sm font-black text-slate-800 dark:text-white">{item.event}</p>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide truncate max-w-xs">{item.target}</p>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full text-[9px] font-black uppercase tracking-widest">
                                            {item.time}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                     </div>
                </div>
            </div>
        </AppLayout>
    );
};

export default SuperAdminDashboardPage;
