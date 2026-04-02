import React, { useState, useEffect } from 'react';
import AppLayout from '../components/AppLayout';
import { callService, Call, CallFilters } from '../services/callService';
import { useAuth } from '../contexts/AuthContext';
import {
    PhoneIcon,
    ClockIcon,
    UserIcon,
    FunnelIcon,
    CalendarIcon,
    ArrowPathIcon,
    ArrowDownTrayIcon
} from '@heroicons/react/24/outline';

const CallHistoryPage: React.FC = () => {
    const { user } = useAuth();
    const [calls, setCalls] = useState<Call[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<CallFilters>({});
    const [pagination, setPagination] = useState({
        total: 0,
        limit: 50,
        offset: 0,
        hasMore: false
    });
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        if (user?.id) {
            fetchCallHistory();
        }
    }, [user, filters, pagination.offset]);

    const fetchCallHistory = async () => {
        if (!user?.id) return;

        try {
            setLoading(true);
            setError(null);
            const response = await callService.fetchCallHistory(
                user.id,
                filters,
                pagination.limit,
                pagination.offset
            );

            setCalls(response.calls);
            setPagination(response.pagination);
        } catch (err) {
            console.error('Error fetching call history:', err);
            setError('Failed to load call history. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleFilterChange = (key: keyof CallFilters, value: string) => {
        setFilters(prev => ({
            ...prev,
            [key]: value || undefined
        }));
        setPagination(prev => ({ ...prev, offset: 0 })); // Reset to first page
    };

    const handlePageChange = (newOffset: number) => {
        setPagination(prev => ({ ...prev, offset: newOffset }));
    };

    const getCallTypeColor = (callType: string) => {
        const colors: { [key: string]: string } = {
            'web_call': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
            'twilio_inbound': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
            'twilio_outbound': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
        };
        return colors[callType] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
    };

    const getStatusColor = (status: string) => {
        const colors: { [key: string]: string } = {
            'completed': 'text-green-600 dark:text-green-400',
            'in-progress': 'text-yellow-600 dark:text-yellow-400',
            'failed': 'text-red-600 dark:text-red-400',
            'initiated': 'text-blue-600 dark:text-blue-400'
        };
        return colors[status] || 'text-gray-600 dark:text-gray-400';
    };

    if (!user) {
        return (
            <AppLayout
                breadcrumbs={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Call History' }]}
                pageTitle="Call History"
            >
                <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                    <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full mb-4">
                        <UserIcon className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Authentication Required</h3>
                    <p className="text-slate-500 max-w-sm">Please log in to access your call history records.</p>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Dashboard', path: '/dashboard' },
                { label: 'Call History' }
            ]}
            pageTitle="Call History"
            pageDescription="Comprehensive log of all inbound and outbound calls."
            primaryAction={
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => fetchCallHistory()}
                        className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                        title="Refresh"
                    >
                        <ArrowPathIcon className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button className="flex items-center px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-sm hover:shadow-lg transition-all">
                        <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                        Export CSV
                    </button>
                </div>
            }
        >
            <div className="space-y-6 animate-in fade-in duration-500">

                {/* Filters Section */}
                <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl p-1 shadow-sm">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <FunnelIcon className="h-4 w-4" />
                            Filter Records
                        </h3>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className="text-xs font-bold text-primary hover:text-primary-dark transition-colors"
                        >
                            {showFilters ? 'Hide Filters' : 'Show Filters'}
                        </button>
                    </div>

                    {showFilters && (
                        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top-2">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Call Direction</label>
                                <div className="relative">
                                    <select
                                        value={filters.callType || ''}
                                        onChange={(e) => handleFilterChange('callType', e.target.value)}
                                        className="w-full pl-4 pr-10 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all text-sm font-medium appearance-none"
                                    >
                                        <option value="">All Call Types</option>
                                        <option value="web_call">Web Calls</option>
                                        <option value="twilio_inbound">Inbound (Twilio)</option>
                                        <option value="twilio_outbound">Outbound (Twilio)</option>
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Start Date</label>
                                <div className="relative">
                                    <input
                                        type="date"
                                        value={filters.startDate || ''}
                                        onChange={(e) => handleFilterChange('startDate', e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all text-sm font-medium"
                                    />
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                        <CalendarIcon className="h-4 w-4" />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">End Date</label>
                                <div className="relative">
                                    <input
                                        type="date"
                                        value={filters.endDate || ''}
                                        onChange={(e) => handleFilterChange('endDate', e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all text-sm font-medium"
                                    />
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                        <CalendarIcon className="h-4 w-4" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Call List Table */}
                <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden min-h-[400px]">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary/20 border-t-primary mb-4"></div>
                            <p className="text-sm font-bold text-slate-400 animate-pulse">Loading records...</p>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-64 p-8">
                            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-full mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <p className="text-red-500 font-bold mb-2">Failed to load data</p>
                            <p className="text-slate-400 text-sm text-center max-w-md">{error}</p>
                            <button onClick={() => fetchCallHistory()} className="mt-4 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">Retry</button>
                        </div>
                    ) : calls.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-96">
                            <div className="p-6 bg-slate-50 dark:bg-slate-900/50 rounded-full mb-6">
                                <PhoneIcon className="w-12 h-12 text-slate-300 dark:text-slate-600" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">No Calls Recorded</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs text-center leading-relaxed">
                                Your call history is empty. Start making calls to populate this list.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-slate-50/80 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                                        <tr>
                                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Status</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Agent</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Duration</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Type</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none text-right">Date & Time</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                        {calls.map((call) => (
                                            <tr key={call.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors cursor-default">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold capitalize border ${call.status === 'completed'
                                                            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-100 dark:border-green-900/30'
                                                            : call.status === 'failed'
                                                                ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-100 dark:border-red-900/30'
                                                                : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-100 dark:border-yellow-900/30'
                                                        }`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${call.status === 'completed' ? 'bg-green-500' : call.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'
                                                            }`}></span>
                                                        {call.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                                                            <UserIcon className="h-4 w-4" />
                                                        </div>
                                                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                                                            {call.agentName}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 font-mono text-xs font-medium bg-slate-100 dark:bg-slate-900 px-3 py-1.5 rounded-lg w-fit">
                                                        <ClockIcon className="w-3.5 h-3.5" />
                                                        {callService.formatDuration(call.duration)}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${getCallTypeColor(call.callType)} border-current/10`}>
                                                        {callService.getCallTypeLabel(call.callType)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                                        {new Date(call.timestamp).toLocaleDateString()}
                                                    </p>
                                                    <p className="text-xs text-slate-400 font-medium">
                                                        {new Date(call.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination Controls */}
                            {pagination.total > pagination.limit && (
                                <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/30">
                                    <div className="text-xs font-bold text-slate-400">
                                        Showing {pagination.offset + 1}-{Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total} records
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handlePageChange(Math.max(0, pagination.offset - pagination.limit))}
                                            disabled={pagination.offset === 0}
                                            className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-primary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                                        >
                                            Previous
                                        </button>
                                        <button
                                            onClick={() => handlePageChange(pagination.offset + pagination.limit)}
                                            disabled={!pagination.hasMore}
                                            className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-primary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </AppLayout>
    );
};

export default CallHistoryPage;
