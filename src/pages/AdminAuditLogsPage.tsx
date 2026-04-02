import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuditLogs, Admin } from '../utils/adminApi';
import AppLayout from '../components/AppLayout';
import Skeleton from '../components/Skeleton';
import {
    DocumentTextIcon,
    ArrowLeftIcon,
    ShieldCheckIcon,
    UserIcon,
    ClockIcon,
    InformationCircleIcon,
    ArrowPathIcon,
    ChevronLeftIcon,
    ChevronRightIcon
} from '@heroicons/react/24/outline';

const AdminAuditLogsPage: React.FC = () => {
    const navigate = useNavigate();
    const [admin, setAdmin] = useState<Admin | null>(null);
    const [logs, setLogs] = useState<any[]>([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

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

        setAdmin(parsed);
        fetchLogs();
    }, [navigate, pagination.page]);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            const data = await getAuditLogs(pagination.page, pagination.limit);
            setLogs(data.logs);
            setPagination(prev => ({ ...prev, ...data.pagination }));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const getActionColor = (action: string) => {
        const a = action.toLowerCase();
        if (a.includes('delete') || a.includes('reset') || a.includes('block') || a.includes('lock')) return 'text-red-600 bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800/50';
        if (a.includes('create') || a.includes('add') || a.includes('unlock') || a.includes('restore')) return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/50';
        if (a.includes('update') || a.includes('edit') || a.includes('set')) return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/50';
        return 'text-slate-600 bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800';
    };

    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Admin', path: '/admin/dashboard' },
                { label: 'System Logs' }
            ]}
            pageTitle="System Security Logs"
            pageDescription="Audit trail of all administrative actions and security events."
            primaryAction={
                <div className="flex items-center space-x-3">
                    <button
                        onClick={() => navigate('/admin/dashboard')}
                        className="flex items-center px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-all font-bold text-sm"
                    >
                        <ArrowLeftIcon className="w-4 h-4 mr-2" />
                        Back to Dashboard
                    </button>
                    <button
                        onClick={fetchLogs}
                        className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-all font-bold text-sm shadow-sm"
                    >
                        <ArrowPathIcon className="w-4 h-4 mr-2" />
                        Refresh
                    </button>
                </div>
            }
        >
            <div className="space-y-8 animate-in fade-in duration-500">
                {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-2xl text-red-700 dark:text-red-400 text-sm font-medium">
                        {error}
                    </div>
                )}

                <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-900/50">
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Timestamp</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Administrator</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Action</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Target User</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {loading ? (
                                    [...Array(10)].map((_, i) => (
                                        <tr key={i}>
                                            <td colSpan={5} className="px-8 py-4">
                                                <Skeleton width="100%" height={20} />
                                            </td>
                                        </tr>
                                    ))
                                ) : logs.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-8 py-20 text-center">
                                            <DocumentTextIcon className="h-12 w-12 text-slate-200 mx-auto mb-4" />
                                            <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">No audit logs found</p>
                                        </td>
                                    </tr>
                                ) : (
                                    logs.map((log) => (
                                        <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                                            <td className="px-8 py-5 whitespace-nowrap">
                                                <div className="flex items-center text-xs font-bold text-slate-500 dark:text-slate-400">
                                                    <ClockIcon className="h-3.5 w-3.5 mr-2 opacity-50" />
                                                    {formatDate(log.created_at)}
                                                </div>
                                            </td>
                                            <td className="px-8 py-5 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-black mr-3">
                                                        {(log.admin_name || log.admin_email || 'A')[0].toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-900 dark:text-white leading-none mb-1">{log.admin_name || 'Admin'}</p>
                                                        <p className="text-[10px] text-slate-400 font-medium leading-none">{log.admin_email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-5 whitespace-nowrap">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${getActionColor(log.action_type)}`}>
                                                    {log.action_type}
                                                </span>
                                            </td>
                                            <td className="px-8 py-5 whitespace-nowrap">
                                                {log.target_user_id ? (
                                                    <div
                                                        className="flex items-center cursor-pointer hover:text-primary transition-colors"
                                                        onClick={() => navigate(`/admin/users/${log.target_user_id}`)}
                                                    >
                                                        <UserIcon className="h-4 w-4 mr-2 text-slate-300" />
                                                        <div>
                                                            <p className="text-sm font-bold leading-none mb-1">{log.target_user_name || 'User'}</p>
                                                            <p className="text-[10px] text-slate-400 font-medium leading-none">{log.target_user_email}</p>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-300 font-bold text-[10px] uppercase tracking-widest">System Wide</span>
                                                )}
                                            </td>
                                            <td className="px-8 py-5">
                                                <div className="flex items-start max-w-xs">
                                                    <InformationCircleIcon className="h-4 w-4 mr-2 text-slate-300 flex-shrink-0 mt-0.5" />
                                                    <p className="text-xs text-slate-500 line-clamp-2">{log.details || 'No additional context'}</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {!loading && pagination.totalPages > 1 && (
                        <div className="px-8 py-5 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <p className="text-xs font-bold text-slate-400">
                                Showing <span className="text-slate-900 dark:text-white">{(pagination.page - 1) * pagination.limit + 1}</span> to <span className="text-slate-900 dark:text-white">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> of <span className="text-slate-900 dark:text-white">{pagination.total}</span> logs
                            </p>
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={() => setPagination(p => ({ ...p, page: Math.max(1, p.page - 1) }))}
                                    disabled={pagination.page === 1}
                                    className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-50 hover:bg-slate-50 transition-colors shadow-sm"
                                >
                                    <ChevronLeftIcon className="h-4 w-4" />
                                </button>
                                <div className="flex items-center space-x-1">
                                    {[...Array(pagination.totalPages)].map((_, i) => {
                                        const pageNum = i + 1;
                                        // Only show first, last, and relative pages
                                        if (pageNum === 1 || pageNum === pagination.totalPages || Math.abs(pageNum - pagination.page) <= 1) {
                                            return (
                                                <button
                                                    key={pageNum}
                                                    onClick={() => setPagination(p => ({ ...p, page: pageNum }))}
                                                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${pagination.page === pageNum ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50'}`}
                                                >
                                                    {pageNum}
                                                </button>
                                            );
                                        } else if (pageNum === 2 || pageNum === pagination.totalPages - 1) {
                                            return <span key={pageNum} className="text-slate-300 text-xs">...</span>;
                                        }
                                        return null;
                                    })}
                                </div>
                                <button
                                    onClick={() => setPagination(p => ({ ...p, page: Math.min(p.totalPages, p.page + 1) }))}
                                    disabled={pagination.page === pagination.totalPages}
                                    className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-50 hover:bg-slate-50 transition-colors shadow-sm"
                                >
                                    <ChevronRightIcon className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </AppLayout>
    );
};

export default AdminAuditLogsPage;
