import React, { useState } from 'react';
import {
    MagnifyingGlassIcon,
    FunnelIcon,
    ArrowUpTrayIcon,
    ArrowDownTrayIcon,
    PlusIcon,
    PencilSquareIcon,
    TrashIcon,
    ClockIcon
} from '@heroicons/react/24/outline';

interface Lead {
    id: string;
    name: string;
    phone: string;
    email: string;
    status: string;
    attempts: number;
    intent?: string | null;
    schedule_time?: string | null;
}

interface LeadsTableProps {
    leads: Lead[];
    onAddLead: () => void;
    onImportLeads: () => void;
    onExport?: () => void;
    onEditLead: (lead: Lead) => void;
    onDeleteLead: (id: string) => void;
    stats?: {
        completed: number;
        failed: number;
        inProgress: number;
        pending: number;
    };
}

const STATUS_COLORS: Record<string, string> = {
    Pending: 'bg-slate-50 text-slate-500 border-slate-100 dark:bg-slate-900/50 dark:text-slate-400 dark:border-slate-800',
    Completed: 'bg-green-50 text-green-600 border-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/50',
    Failed: 'bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/50',
    Rejected: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/50',
    Calling: 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/50',
    Ringing: 'bg-yellow-50 text-yellow-600 border-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-900/50',
    Initiated: 'bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-900/50',
};

const INTENT_CONFIG: Record<string, { label: string; color: string }> = {
    'interested': { label: 'Interested', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400' },
    'not_interested': { label: 'Not Interested', color: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400' },
    'needs_demo': { label: 'Needs a Demo', color: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400' },
    'scheduled_meeting': { label: 'Scheduled Meeting', color: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400' },
    '1_on_1_session_requested': { label: '1-on-1 Requested', color: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400' },
};

function formatScheduleTime(dt: string | null | undefined): string {
    if (!dt) return '—';
    try {
        return new Date(dt).toLocaleString(undefined, {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch {
        return dt;
    }
}

const LeadsTable: React.FC<LeadsTableProps> = ({
    leads, onAddLead, onImportLeads, onExport, onEditLead, onDeleteLead
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All Status');

    const filteredLeads = leads.filter(lead => {
        const matchesSearch =
            (lead.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (lead.phone || '').includes(searchTerm) ||
            (lead.email || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter = statusFilter === 'All Status' || lead.status === statusFilter;
        return matchesSearch && matchesFilter;
    });

    const getStatusClass = (status: string) =>
        STATUS_COLORS[status] || 'bg-slate-50 text-slate-500 border-slate-100 dark:bg-slate-900/50 dark:text-slate-400 dark:border-slate-800';

    const isLiveStatus = (status: string) =>
        status.toLowerCase() === 'calling' || status.toLowerCase() === 'ringing';

    return (
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden mt-8">
            {/* Header */}
            <div className="p-6 border-b border-slate-50 dark:border-slate-700/50 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white shrink-0">
                        Leads ({filteredLeads.length})
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Search */}
                        <div className="relative group">
                            <input
                                type="text"
                                placeholder="Search Leads..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full md:w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 pl-10 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all font-medium"
                            />
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                        </div>

                        {/* Status Filter */}
                        <div className="relative">
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="appearance-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 pr-10 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/50 outline-none transition-all cursor-pointer font-medium"
                            >
                                <option>All Status</option>
                                <option>Pending</option>
                                <option>Calling</option>
                                <option>Ringing</option>
                                <option>Completed</option>
                                <option>Failed</option>
                                <option>Rejected</option>
                            </select>
                            <FunnelIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>

                        {/* Export */}
                        <button
                            onClick={onExport}
                            className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all font-bold text-xs flex items-center gap-2"
                        >
                            <ArrowUpTrayIcon className="w-4 h-4" />
                            <span className="hidden sm:inline">Export</span>
                        </button>

                        {/* Import */}
                        <button
                            onClick={onImportLeads}
                            className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all font-bold text-xs flex items-center gap-2"
                        >
                            <ArrowDownTrayIcon className="w-4 h-4" />
                            <span className="hidden sm:inline">Import</span>
                        </button>

                        {/* Add Lead */}
                        <button
                            onClick={onAddLead}
                            className="flex items-center space-x-2 bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-xl font-bold transition-all shadow-lg shadow-primary/20 transform hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <PlusIcon className="h-4 w-4" />
                            <span className="text-sm">Add Lead</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-slate-50/50 dark:bg-slate-900/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 dark:border-slate-700/50">
                        <tr>
                            <th className="px-6 py-4">
                                <input type="checkbox" className="rounded-md border-slate-300 dark:border-slate-700 bg-transparent text-primary focus:ring-primary/20" />
                            </th>
                            <th className="px-6 py-4 font-black">Name</th>
                            <th className="px-6 py-4 font-black">Phone</th>
                            <th className="px-6 py-4 font-black">Email</th>
                            <th className="px-6 py-4 font-black">Status</th>
                            <th className="px-6 py-4 font-black">Attempts</th>
                            <th className="px-6 py-4 font-black">Intent</th>
                            <th className="px-6 py-4 font-black">Schedule</th>
                            <th className="px-6 py-4 font-black text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                        {filteredLeads.map((lead) => {
                            const intentCfg = lead.intent ? INTENT_CONFIG[lead.intent] : null;
                            const live = isLiveStatus(lead.status);

                            return (
                                <tr key={lead.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-all duration-200 group">
                                    <td className="px-6 py-4 w-10">
                                        <input type="checkbox" className="rounded-md border-slate-300 dark:border-slate-700 bg-transparent text-primary focus:ring-primary/20" />
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm font-bold text-slate-800 dark:text-white group-hover:text-primary transition-colors">{lead.name}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm font-bold font-mono text-slate-600 dark:text-slate-400">{lead.phone}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm font-semibold text-slate-500 truncate max-w-[150px] inline-block">{lead.email || '—'}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider border shadow-sm ${getStatusClass(lead.status)}`}>
                                            {live && (
                                                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse inline-block" />
                                            )}
                                            {lead.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-xs font-bold text-slate-500">{lead.attempts}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {intentCfg ? (
                                            <span className={`inline-flex px-2.5 py-0.5 rounded-lg text-[10px] font-black border ${intentCfg.color}`}>
                                                {intentCfg.label}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        {lead.schedule_time ? (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                                                <ClockIcon className="w-3 h-3" />
                                                {formatScheduleTime(lead.schedule_time)}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => onEditLead(lead)}
                                                className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                                                title="Edit Lead"
                                            >
                                                <PencilSquareIcon className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => onDeleteLead(lead.id)}
                                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                                title="Delete Lead"
                                            >
                                                <TrashIcon className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {filteredLeads.length === 0 && (
                    <div className="p-12 text-center">
                        <div className="w-16 h-16 bg-slate-50 dark:bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100 dark:border-slate-800">
                            <MagnifyingGlassIcon className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                        </div>
                        <p className="text-sm font-bold text-slate-500 dark:text-slate-400">No leads match your filters.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LeadsTable;
