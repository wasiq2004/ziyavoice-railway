import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import KPICard from '../components/KPICard';
import {
    ArrowDownTrayIcon,
    UsersIcon,
    UserGroupIcon,
    ServerIcon,
    SignalIcon,
    RocketLaunchIcon,
    ShieldExclamationIcon,
    ChartPieIcon
} from '@heroicons/react/24/outline';
import { getUsers, getUserResources } from '../utils/adminApi';

const AdminReportsPage: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalUsers: 0,
        activeUsers: 0,
        totalAgents: 0,
        activeAgents: 0,
        suspendedUsers: 0,
        avgAgentsPerUser: '0.0',
        totalCampaigns: 0
    });
    const [userReports, setUserReports] = useState<any[]>([]);

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
        fetchData();
    }, [navigate]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch real users from backend (org-scoped via adminApi appendOrgId)
            const { users, pagination } = await getUsers(1, 100);

            // For each user, fetch their resources (agents + campaigns) in parallel
            const enriched = await Promise.all(
                users.map(async (u: any) => {
                    try {
                        const resources = await getUserResources(u.id);
                        const agents = resources.agents || [];
                        const campaigns = resources.campaigns || [];
                        const totalAgents = agents.length;
                        const activeAgents = agents.filter((a: any) => a.status === 'active' || a.status === 'running').length;
                        const totalCampaigns = campaigns.length;
                        // ElevenLabs usage as proxy for credits used
                        const creditsUsed = Math.round(
                            (u.elevenlabs_usage || 0) + (u.gemini_usage || 0) + (u.deepgram_usage || 0)
                        );
                        return {
                            id: u.id,
                            email: u.email,
                            username: u.username,
                            joined: u.created_at,
                            totalAgents,
                            activeAgents,
                            totalCampaigns,
                            status: u.status || 'active',
                            creditsUsed,
                        };
                    } catch {
                        return {
                            id: u.id,
                            email: u.email,
                            username: u.username,
                            joined: u.created_at,
                            totalAgents: 0,
                            activeAgents: 0,
                            totalCampaigns: 0,
                            status: u.status || 'active',
                            creditsUsed: 0,
                        };
                    }
                })
            );

            const tUsers = enriched.length;
            const aUsers = enriched.filter(u => u.status === 'active').length;
            const tAgents = enriched.reduce((sum, u) => sum + u.totalAgents, 0);
            const aAgents = enriched.reduce((sum, u) => sum + u.activeAgents, 0);
            const sUsers = enriched.filter(u => u.status === 'locked' || u.status === 'inactive').length;
            const tCampaigns = enriched.reduce((sum, u) => sum + u.totalCampaigns, 0);

            setStats({
                totalUsers: tUsers,
                activeUsers: aUsers,
                totalAgents: tAgents,
                activeAgents: aAgents,
                suspendedUsers: sUsers,
                avgAgentsPerUser: tUsers > 0 ? (tAgents / tUsers).toFixed(1) : '0.0',
                totalCampaigns: tCampaigns,
            });

            setUserReports(enriched);
        } catch (err: any) {
            console.error('Error fetching report data:', err);
        } finally {
            setLoading(false);
        }
    };


    const handleExportCSV = () => {
        if (userReports.length === 0) return;
        const headers = ['User ID', 'Username', 'Email', 'Joined Date', 'Total Agents', 'Active Agents', 'Campaigns Run', 'Credits Used', 'Status'];
        const csvRows = [
            headers.join(','),
            ...userReports.map(r => [
                r.id,
                `"${r.username}"`,
                `"${r.email}"`,
                new Date(r.joined).toLocaleDateString(),
                r.totalAgents,
                r.activeAgents,
                r.totalCampaigns,
                r.creditsUsed,
                r.status.toUpperCase()
            ].join(','))
        ];
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'User_Intelligence_Report_Detailed.csv';
        a.click();
    };

    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Admin', path: '/admin/dashboard' },
                { label: 'User Reports Data' }
            ]}
            pageTitle="User Intelligence Reports"
            pageDescription="Complete analytical breakdown of active users, agent deployments, and system wide utilization."
            primaryAction={
                <button
                    onClick={handleExportCSV}
                    className="flex items-center space-x-2 bg-slate-900 dark:bg-slate-800 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-800 dark:hover:bg-slate-700 transition-all shadow-lg"
                >
                    <ArrowDownTrayIcon className="h-4 w-4 stroke-2" />
                    <span>Export User Data</span>
                </button>
            }
        >
            <div className="space-y-6 animate-in fade-in duration-500">
                {/* User & Agent KPIs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
                    <KPICard title="Total Users" value={stats.totalUsers} icon={<UsersIcon className="w-5 h-5"/>} color="blue" />
                    <KPICard title="Active Online Users" value={stats.activeUsers} icon={<SignalIcon className="w-5 h-5"/>} color="green" />
                    <KPICard title="Total Agents Created" value={stats.totalAgents} icon={<UserGroupIcon className="w-5 h-5"/>} color="purple" />
                    <KPICard title="Active Live Agents" value={stats.activeAgents} icon={<ServerIcon className="w-5 h-5"/>} color="green" />
                    <KPICard title="Avg Agents/User" value={stats.avgAgentsPerUser} icon={<ChartPieIcon className="w-5 h-5"/>} color="gray" />
                    <KPICard title="Campaigns Dispatched" value={stats.totalCampaigns} icon={<RocketLaunchIcon className="w-5 h-5"/>} color="blue" />
                    <KPICard title="Suspended/Inactive" value={stats.suspendedUsers} icon={<ShieldExclamationIcon className="w-5 h-5"/>} color="red" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                     {/* System Agent Distribution Graph (Mock Visual) */}
                    <div className="bg-white dark:bg-slate-800/50 rounded-[2rem] border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                        <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest mb-6">Agent Deployment Status</h3>
                        <div className="space-y-5">
                            <div>
                                <div className="flex justify-between text-xs font-bold mb-2">
                                    <span className="text-slate-500">Live Handling Calls</span>
                                    <span className="text-emerald-500">{stats.activeAgents} Agents</span>
                                </div>
                                <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-emerald-400 to-green-500 rounded-full transition-all duration-1000"
                                        style={{ width: `${stats.totalAgents > 0 ? (stats.activeAgents / stats.totalAgents) * 100 : 0}%` }}
                                    />
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between text-xs font-bold mb-2">
                                    <span className="text-slate-500">Idle / Standby</span>
                                    <span className="text-amber-500">{stats.totalAgents - stats.activeAgents} Agents</span>
                                </div>
                                <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-1000"
                                        style={{ width: `${stats.totalAgents > 0 ? ((stats.totalAgents - stats.activeAgents) / stats.totalAgents) * 100 : 0}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Detailed User Intelligence Table */}
                    <div className="bg-white dark:bg-slate-800/50 rounded-[2rem] border border-slate-200 dark:border-slate-800 p-6 shadow-sm lg:col-span-2 flex flex-col">
                        <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest mb-4">Detailed User Asset Report</h3>
                        <div className="overflow-x-auto flex-1">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-slate-100 dark:border-slate-700">
                                        <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">System User</th>
                                        <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Agents (Active/Total)</th>
                                        <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Total Campaigns</th>
                                        <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Cr. Used</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                                    {userReports.map((row, i) => (
                                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                                            <td className="py-3">
                                                <p className="text-sm font-bold text-slate-800 dark:text-white">{row.username}</p>
                                                <p className="text-[10px] text-slate-400 font-bold">{row.email}</p>
                                            </td>
                                            <td className="py-3 text-center">
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                    {row.activeAgents} <span className="text-slate-400 font-medium">/ {row.totalAgents}</span>
                                                </span>
                                            </td>
                                            <td className="py-3 text-center text-sm font-bold text-slate-600 dark:text-slate-300">
                                                {row.totalCampaigns}
                                            </td>
                                            <td className="py-3 text-right">
                                                <span className="text-sm font-black text-slate-800 dark:text-white">{row.creditsUsed.toLocaleString()}</span>
                                                <span className="text-[10px] font-black text-slate-400 ml-1">CR</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {userReports.length === 0 && !loading && (
                                <div className="text-center py-8 text-xs font-black text-slate-400 uppercase">
                                    No organization users mapped yet.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
};

export default AdminReportsPage;
