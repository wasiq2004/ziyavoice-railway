import React, { useState, useMemo, useEffect } from 'react';
import AppLayout from '../components/AppLayout';
import {
    ArrowDownTrayIcon,
    MagnifyingGlassIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    CalendarDaysIcon,
    TagIcon,
    UserIcon,
    PhoneIcon,
    ArrowPathRoundedSquareIcon,
    CheckCircleIcon,
    XCircleIcon,
    EllipsisHorizontalIcon,
    TrashIcon,
    ArrowDownOnSquareIcon
} from '@heroicons/react/24/outline';
import Skeleton from '../components/Skeleton';
import KPICard from '../components/KPICard';
import { useAuth } from '../contexts/AuthContext';
import { getApiBaseUrl, getApiPath } from '../utils/api';

// Custom FunnelIcon component
const FunnelIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
    </svg>
);

interface ReportData {
    id: string;
    sNo: number;
    date: string;
    day: string;
    campaignId: string;
    agentName: string;
    calledNumber: string;
    type: 'Incoming' | 'Outbound';
    status: string;
    result: string;
    firstCallTime: string;
    followUpTime: string;
    call_duration?: number;
    recordingUrl: string | null;
}

const ReportsPage: React.FC = () => {
    const { user } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'All' | 'Incoming' | 'Outbound'>('All');
    const [sortConfig, setSortConfig] = useState<{ key: keyof ReportData, direction: 'asc' | 'desc' } | null>({ key: 'sNo', direction: 'asc' });

    // Dropdown filters
    const [selectedCampaign, setSelectedCampaign] = useState('All Campaigns');
    const [selectedAgent, setSelectedAgent] = useState('All Agents');
    const [selectedStatus, setSelectedStatus] = useState('All Statuses');
    const [selectedResult, setSelectedResult] = useState('All Results');

    const [reports, setReports] = useState<ReportData[]>([]);
    const [stats, setStats] = useState({
        totalCalls: 0,
        completedCalls: 0,
        failedCalls: 0,
        avgDuration: '0s',
        interestedLeads: 0
    });
    const [openActionId, setOpenActionId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchReports = async () => {
            if (!user?.id) return;
            try {
                setIsLoading(true);
                const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/reports?userId=${user.id}`);
                const data = await response.json();

                if (data.success) {
                    const formattedData = data.data.map((row: any, index: number) => {
                        const dateObj = new Date(row.created_at);
                        return {
                            id: row.id.toString(),
                            sNo: index + 1,
                            date: dateObj.toISOString().split('T')[0],
                            day: dateObj.toLocaleDateString('en-US', { weekday: 'long' }),
                            campaignId: row.campaignName || 'Unknown',
                            agentName: row.agentName || 'Unknown Agent',
                            calledNumber: row.calledNumber,
                            type: row.type || 'Outbound',
                            status: row.status || 'Unknown',
                            result: row.result || 'Pending',
                            firstCallTime: dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                            followUpTime: row.schedule_time ? new Date(row.schedule_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'None',
                            call_duration: row.call_duration || 0,
                            recordingUrl: row.recording_url || null
                        };
                    });
                    setReports(formattedData);

                    // Calculate stats
                    const total = formattedData.length;
                    const completed = formattedData.filter((r: any) => ['completed', 'success', 'successful'].includes(r.status.toLowerCase())).length;
                    const failed = total - completed;
                    const interested = formattedData.filter((r: any) => ['interested', 'positive', 'success'].includes(r.result.toLowerCase())).length;

                    // Calculate average duration from call_duration field
                    let avgDuration = '0s';
                    if (completed > 0) {
                        const totalDuration = formattedData
                            .filter((r: any) => ['completed', 'success', 'successful'].includes(r.status.toLowerCase()))
                            .reduce((sum: number, r: any) => sum + (r.call_duration || 0), 0);
                        const avgSeconds = Math.round(totalDuration / completed);
                        const minutes = Math.floor(avgSeconds / 60);
                        const seconds = avgSeconds % 60;
                        avgDuration = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
                    }

                    setStats({
                        totalCalls: total,
                        completedCalls: completed,
                        failedCalls: failed,
                        avgDuration: avgDuration,
                        interestedLeads: interested
                    });
                }
            } catch (error) {
                console.error('Failed to fetch reports:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchReports();
    }, [user]);

    // Compute unique dropdown options from data
    const filterOptions = useMemo(() => {
        const campaigns = ['All Campaigns', ...Array.from(new Set(reports.map(r => r.campaignId))).filter(Boolean)];
        const agents = ['All Agents', ...Array.from(new Set(reports.map(r => r.agentName))).filter(Boolean)];
        const statuses = ['All Statuses', ...Array.from(new Set(reports.map(r => r.status))).filter(Boolean)];
        const results = ['All Results', ...Array.from(new Set(reports.map(r => r.result))).filter(Boolean)];

        return { campaigns, agents, statuses, results };
    }, [reports]);

    const handleDelete = (id: string) => {
        if (window.confirm('Are you sure you want to delete this report from view?')) {
            setReports(prev => prev.filter(r => r.id !== id));
            setOpenActionId(null);
        }
    };

    const handleSort = (key: keyof ReportData) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const filteredAndSortedData = useMemo(() => {
        let data = [...reports];

        // Search Filter
        if (searchQuery) {
            data = data.filter(item =>
                item.agentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.campaignId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.calledNumber.includes(searchQuery)
            );
        }

        // Tab Filter
        if (activeTab !== 'All') {
            data = data.filter(item => item.type === activeTab);
        }

        // Dropdown Filters
        if (selectedCampaign !== 'All Campaigns') data = data.filter(item => item.campaignId === selectedCampaign);
        if (selectedAgent !== 'All Agents') data = data.filter(item => item.agentName === selectedAgent);
        if (selectedStatus !== 'All Statuses') data = data.filter(item => item.status === selectedStatus);
        if (selectedResult !== 'All Results') data = data.filter(item => item.result === selectedResult);

        // Sorting
        if (sortConfig !== null) {
            data.sort((a: any, b: any) => {
                if (a[sortConfig.key] < b[sortConfig.key]) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (a[sortConfig.key] > b[sortConfig.key]) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }

        return data;
    }, [reports, searchQuery, activeTab, selectedCampaign, selectedAgent, selectedStatus, selectedResult, sortConfig]);

    const sortIcon = (key: keyof ReportData) => {
        if (!sortConfig || sortConfig.key !== key) return <div className="w-3 h-3 ml-1 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />;
        return sortConfig.direction === 'asc' ?
            <ChevronUpIcon className="w-3 h-3 ml-1 text-primary" /> :
            <ChevronDownIcon className="w-3 h-3 ml-1 text-primary" />;
    };

    const handleExportCSV = () => {
        if (filteredAndSortedData.length === 0) return;

        const headers = ['S.No', 'Date', 'Day', 'Campaign Name', 'Agent Name', 'Called Number', 'Type', 'Status', 'Result', 'First Call Time'];

        const csvRows = [
            headers.join(','), // Header row
            ...filteredAndSortedData.map(row =>
                [
                    row.sNo,
                    `"${row.date}"`,
                    `"${row.day}"`,
                    `"${row.campaignId}"`,
                    `"${row.agentName}"`,
                    `"${row.calledNumber}"`,
                    `"${row.type}"`,
                    `"${row.status}"`,
                    `"${row.result}"`,
                    `"${row.firstCallTime}"`
                ].join(',')
            )
        ];

        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');

        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'Ziya_Call_Reports_Export.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportBtn = (
        <button
            onClick={handleExportCSV}
            disabled={filteredAndSortedData.length === 0}
            className="flex items-center space-x-2 bg-slate-900 dark:bg-slate-800 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-800 dark:hover:bg-slate-700 transition-all shadow-lg shadow-slate-900/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <ArrowDownTrayIcon className="h-4 w-4" />
            <span>Export to Excel</span>
        </button>
    );

    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Dashboard', path: '/dashboard' },
                { label: 'Reports' }
            ]}
            pageTitle="Reports"
            pageDescription="Comprehensive analysis of your voice interactions and campaign results."
            primaryAction={exportBtn}
        >
            <div className="space-y-6">
                {/* KPI Summary Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <KPICard
                        title="Total Interactions"
                        value={stats.totalCalls}
                        color="blue"
                    />
                    <KPICard
                        title="Successful Connections"
                        value={stats.completedCalls}
                        color="green"
                        percentage={`${stats.totalCalls > 0 ? Math.round((stats.completedCalls / stats.totalCalls) * 100) : 0}%`}
                    />
                    <KPICard
                        title="Interested Leads"
                        value={stats.interestedLeads}
                        color="purple"
                    />
                    <KPICard
                        title="Avg Duration"
                        value={stats.avgDuration}
                        color="gray"
                    />
                    <KPICard
                        title="Failed / No Answer"
                        value={stats.failedCalls}
                        color="red"
                    />
                </div>

                {/* Statistics Summary */}
                <div className="flex items-center space-x-2 text-sm text-slate-500 font-medium bg-slate-50 dark:bg-slate-800/30 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                    <span className="font-black text-slate-900 dark:text-white uppercase text-[10px] tracking-widest bg-white dark:bg-slate-800 px-2 py-1 rounded shadow-sm border border-slate-100 dark:border-slate-700">Detailed Filter Status</span>
                    <span className="ml-2 font-bold text-slate-600 dark:text-slate-300">{filteredAndSortedData.length} entries matching current criteria</span>
                </div>

                {/* Filters Row 1: Tabs and Search */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex p-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 w-fit">
                        {['All', 'Incoming', 'Outbound'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab as any)}
                                className={`px-5 py-1.5 rounded-lg text-sm font-bold transition-all duration-200 ${activeTab === tab
                                    ? 'bg-white dark:bg-slate-700 text-primary shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                    }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    <div className="relative group min-w-[300px]">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                        <input
                            type="text"
                            placeholder="Search by agent, campaign or number..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm font-medium w-full transition-all"
                        />
                    </div>
                </div>

                {/* Filters Row 2: Dropdowns */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { label: 'All Campaigns', value: selectedCampaign, setter: setSelectedCampaign, options: filterOptions.campaigns },
                        { label: 'All Agents', value: selectedAgent, setter: setSelectedAgent, options: filterOptions.agents },
                        { label: 'All Statuses', value: selectedStatus, setter: setSelectedStatus, options: filterOptions.statuses },
                        { label: 'All Results', value: selectedResult, setter: setSelectedResult, options: filterOptions.results },
                    ].map((filter, i) => (
                        <div key={i} className="relative">
                            <select
                                value={filter.value}
                                onChange={(e) => filter.setter(e.target.value)}
                                className="w-full pl-4 pr-10 py-2.5 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 appearance-none focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all cursor-pointer"
                            >
                                {filter.options.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                            <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                    ))}
                </div>

                {/* Data Table */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-visible min-h-[400px]">
                    {isLoading ? (
                        <div className="overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                                    <tr>
                                        <th className="px-6 py-4 text-center w-20 text-[11px] font-bold text-slate-500 uppercase tracking-widest">S.No</th>
                                        <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Date / Day</th>
                                        <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Campaign Name</th>
                                        <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Agent</th>
                                        <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Phone / Type</th>
                                        <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                                        <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Result</th>
                                        <th className="px-6 py-4 text-right pr-6 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                    {[...Array(8)].map((_, i) => (
                                        <tr key={i}>
                                            <td className="px-6 py-4 text-center"><Skeleton width={32} height={14} variant="text" className="mx-auto" /></td>
                                            <td className="px-6 py-4">
                                                <div className="space-y-1">
                                                    <Skeleton width={80} height={14} variant="text" />
                                                    <Skeleton width={40} height={10} variant="text" />
                                                </div>
                                            </td>
                                            <td className="px-6 py-4"><Skeleton width={100} height={24} variant="rounded" /></td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center space-x-2">
                                                    <Skeleton width={28} height={28} variant="rounded" />
                                                    <Skeleton width={80} height={14} variant="text" />
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="space-y-1">
                                                    <Skeleton width={100} height={14} variant="text" />
                                                    <Skeleton width={60} height={10} variant="text" />
                                                </div>
                                            </td>
                                            <td className="px-6 py-4"><Skeleton width={70} height={14} variant="text" /></td>
                                            <td className="px-6 py-4"><Skeleton width={80} height={20} variant="rounded" /></td>
                                            <td className="px-6 py-4 text-right"><Skeleton width={32} height={32} variant="rounded" className="ml-auto" /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-visible">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                                            <th onClick={() => handleSort('sNo')} className="px-6 py-4 cursor-pointer group hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors text-center w-20">
                                                <div className="flex items-center justify-center text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                                                    S.No {sortIcon('sNo')}
                                                </div>
                                            </th>
                                            <th onClick={() => handleSort('date')} className="px-6 py-4 cursor-pointer group hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors">
                                                <div className="flex items-center text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                                                    Date / Day {sortIcon('date')}
                                                </div>
                                            </th>
                                            <th onClick={() => handleSort('campaignId')} className="px-6 py-4 cursor-pointer group hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors">
                                                <div className="flex items-center text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                                                    Campaign Name {sortIcon('campaignId')}
                                                </div>
                                            </th>
                                            <th onClick={() => handleSort('agentName')} className="px-6 py-4 cursor-pointer group hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors">
                                                <div className="flex items-center text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                                                    Agent {sortIcon('agentName')}
                                                </div>
                                            </th>
                                            <th className="px-6 py-4">
                                                <div className="flex items-center text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                                                    Phone / Type
                                                </div>
                                            </th>
                                            <th onClick={() => handleSort('status')} className="px-6 py-4 cursor-pointer group hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors">
                                                <div className="flex items-center text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                                                    Status {sortIcon('status')}
                                                </div>
                                            </th>
                                            <th onClick={() => handleSort('result')} className="px-6 py-4 cursor-pointer group hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors">
                                                <div className="flex items-center text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                                                    Result {sortIcon('result')}
                                                </div>
                                            </th>
                                            <th className="px-6 py-4 text-right pr-6">
                                                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                                                    Actions
                                                </div>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                        {filteredAndSortedData.map((row) => (
                                            <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all group">
                                                <td className="px-6 py-4 text-sm font-bold text-slate-400 group-hover:text-primary transition-colors text-center">
                                                    {row.sNo.toString().padStart(2, '0')}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{row.date}</span>
                                                        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-tight">{row.day}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                                        {row.campaignId}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center space-x-2">
                                                        <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                                            <UserIcon className="w-4 h-4" />
                                                        </div>
                                                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{row.agentName}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{row.calledNumber}</span>
                                                        <span className={`text-[10px] font-bold uppercase tracking-widest ${row.type === 'Incoming' ? 'text-blue-500' : 'text-purple-500'}`}>
                                                            {row.type}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center space-x-1.5">
                                                        <div className={`w-1.5 h-1.5 rounded-full ${['Completed', 'success', 'successful'].includes(row.status.toLowerCase()) ? 'bg-green-500' :
                                                            ['in-progress', 'in_progress', 'started', 'processing'].includes(row.status.toLowerCase()) ? 'bg-blue-500 animate-pulse' : 'bg-red-500'
                                                            }`} />
                                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 capitalize">{row.status}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${['interested', 'positive', 'success'].includes(row.result.toLowerCase()) ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                                                        ['pending', 'neutral', 'unknown'].includes(row.result.toLowerCase()) ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                                                            ['scheduled', 'callback'].includes(row.result.toLowerCase()) ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                                                                'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                                        }`}>
                                                        {row.result}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right pr-6">
                                                    <div className="relative">
                                                        <button
                                                            onClick={() => setOpenActionId(openActionId === row.id ? null : row.id)}
                                                            className={`p-2 rounded-xl transition-all ${openActionId === row.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-400 hover:text-primary hover:bg-primary/5'}`}
                                                        >
                                                            <EllipsisHorizontalIcon className="w-5 h-5" />
                                                        </button>

                                                        {/* Action Dropdown */}
                                                        {openActionId === row.id && (
                                                            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                                                <button
                                                                    onClick={() => {
                                                                        if (row.recordingUrl) {
                                                                            window.open(row.recordingUrl, '_blank');
                                                                        } else {
                                                                            alert('No recording available for this call.');
                                                                        }
                                                                        setOpenActionId(null);
                                                                    }}
                                                                    className={`w-full px-4 py-2.5 text-left text-sm font-bold flex items-center space-x-3 transition-colors ${row.recordingUrl
                                                                        ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                                                        : 'text-slate-400 opacity-50 cursor-not-allowed'
                                                                        }`}
                                                                >
                                                                    <ArrowDownOnSquareIcon className={`w-4 h-4 ${row.recordingUrl ? 'text-primary' : 'text-slate-400'}`} />
                                                                    <span>{row.recordingUrl ? 'Download Call' : 'No Recording'}</span>
                                                                </button>
                                                                <div className="my-1 border-t border-slate-100 dark:border-slate-700/50"></div>
                                                                <button
                                                                    onClick={() => handleDelete(row.id)}
                                                                    className="w-full px-4 py-2.5 text-left text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-3 transition-colors"
                                                                >
                                                                    <TrashIcon className="w-4 h-4" />
                                                                    <span>Delete</span>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {filteredAndSortedData.length === 0 && (
                                <div className="py-20 text-center">
                                    <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100 dark:border-slate-800">
                                        <ArrowPathRoundedSquareIcon className="w-8 h-8 text-slate-300" />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">No matching reports</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Try adjusting your filters or search query.</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </AppLayout>
    );
};

export default ReportsPage;
