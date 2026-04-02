import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import {
    TicketIcon,
    ChatBubbleLeftRightIcon,
    CheckCircleIcon,
    ChevronRightIcon,
    ArrowPathIcon,
    InboxStackIcon,
    ExclamationTriangleIcon,
    UserGroupIcon
} from '@heroicons/react/24/outline';
import { listSupportTickets, replyToSupportTicket, updateTicketStatus } from '../utils/adminApi';

const SuperAdminSupportPage: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [tickets, setTickets] = useState<any[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<any>(null);
    const [reply, setReply] = useState('');
    const [sending, setSending] = useState(false);
    const [stats, setStats] = useState({ open: 0, urgent: 0, resolved: 0 });

    const getSuperAdmin = () => {
        const raw = localStorage.getItem('ziya-user');
        return raw ? JSON.parse(raw) : null;
    };

    const fetchTickets = async () => {
        setLoading(true);
        try {
            // Super admin sees all org_admin tickets (no created_by filter = see all)
            const { tickets: allTickets } = await listSupportTickets({
                created_by_role: 'org_admin',
                limit: 100,
            });
            setTickets(allTickets);
            setStats({
                open: allTickets.filter((t: any) => t.status === 'Open').length,
                urgent: allTickets.filter((t: any) => t.priority === 'High' || t.priority === 'Urgent').length,
                resolved: allTickets.filter((t: any) => t.status === 'Resolved' || t.status === 'Closed').length,
            });
        } catch (err: any) {
            console.error('Failed to load tickets:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const user = getSuperAdmin();
        if (!user || user.role !== 'super_admin') { navigate('/login'); return; }
        fetchTickets();
    }, [navigate]);

    const handleReply = async () => {
        if (!reply.trim() || !selectedTicket) return;
        const superAdmin = getSuperAdmin();
        if (!superAdmin) return;
        setSending(true);
        try {
            await replyToSupportTicket(selectedTicket.id, reply, superAdmin.id, 'super_admin');
            await updateTicketStatus(selectedTicket.id, 'Resolved');
            const updated = tickets.map(t => t.id === selectedTicket.id ? {...t, status: 'Resolved'} : t);
            setTickets(updated);
            setStats(prev => ({ ...prev, open: Math.max(0, prev.open - 1), resolved: prev.resolved + 1 }));
            setReply('');
            setSelectedTicket({...selectedTicket, status: 'Resolved'});
        } catch (err: any) {
            console.error('Failed to send reply:', err);
        } finally {
            setSending(false);
        }
    };


    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Super Admin', path: '/superadmin/dashboard' },
                { label: 'Helpdesk' }
            ]}
            pageTitle="Global Helpdesk"
            pageDescription="Central command for Org Admin support, ticket triage, and issue resolution."
        >
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                {/* Quick Stats overview */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-slate-800/50 p-5 rounded-[2rem] border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Open Tickets</p>
                            <h4 className="text-2xl font-black text-slate-800 dark:text-white mt-1">{loading ? '…' : stats.open}</h4>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                            <InboxStackIcon className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800/50 p-5 rounded-[2rem] border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Urgent Issues</p>
                            <h4 className="text-2xl font-black text-red-500 mt-1">{loading ? '…' : stats.urgent}</h4>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                            <ExclamationTriangleIcon className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800/50 p-5 rounded-[2rem] border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg Response</p>
                            <h4 className="text-2xl font-black text-slate-800 dark:text-white mt-1">2h 15m</h4>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                            <TicketIcon className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800/50 p-5 rounded-[2rem] border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resolved (7d)</p>
                            <h4 className="text-2xl font-black text-slate-800 dark:text-white mt-1">{loading ? '…' : stats.resolved}</h4>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                            <UserGroupIcon className="w-5 h-5" />
                        </div>
                    </div>
                </div>

                {/* Main Dashboard Interface */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[600px]">
                    
                    {/* Tickets List Sidebar (Col 4) */}
                    <div className="lg:col-span-4 bg-white dark:bg-slate-800/50 rounded-[2rem] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm flex flex-col h-full">
                        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
                            <ChatBubbleLeftRightIcon className="w-5 h-5 text-indigo-500" />
                            <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest">Ticket Queue</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-50 dark:divide-slate-800/50">
                            {loading ? (
                                [...Array(4)].map((_, i) => <div key={i} className="p-5 h-24 animate-pulse bg-slate-50 dark:bg-slate-900/50" />)
                            ) : tickets.map((t) => (
                                <div 
                                    key={t.id} 
                                    onClick={() => setSelectedTicket(t)}
                                    className={`p-5 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-900/30 ${selectedTicket?.id === t.id ? 'bg-indigo-50/50 dark:bg-indigo-900/20 border-l-4 border-l-indigo-500' : 'border-l-4 border-transparent'}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${t.status === 'Open' ? 'bg-blue-500' : t.status === 'Resolved' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                                            <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{t.id}</span>
                                        </div>
                                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest ${t.priority === 'High' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                                            {t.priority}
                                        </span>
                                    </div>
                                    <h4 className={`text-sm font-bold truncate mb-1 ${selectedTicket?.id === t.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-800 dark:text-white'}`}>{t.subject}</h4>
                                    <div className="flex justify-between items-center text-[10px]">
                                        <span className="text-slate-500 truncate max-w-[120px] font-medium">{t.org_name || t.created_by_name || '—'}</span>
                                        <span className="text-slate-400 font-bold">{t.date || (t.created_at ? new Date(t.created_at).toLocaleDateString() : '—')}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Ticket Details & Chat Interface (Col 8) */}
                    <div className="lg:col-span-8 bg-white dark:bg-slate-800/50 rounded-[2rem] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm flex flex-col h-full relative">
                        {selectedTicket ? (
                            <>
                                {/* Header */}
                                <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800/80 flex justify-between items-center shrink-0 z-10 shadow-sm">
                                    <div className="flex gap-4 items-center">
                                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 flex items-center justify-center font-black text-indigo-500">
                                            {(selectedTicket.org_name || selectedTicket.org || '?').substring(0,2).toUpperCase()}
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-black text-slate-800 dark:text-white">{selectedTicket.subject}</h2>
                                            <div className="flex gap-2 items-center text-xs text-slate-500 font-medium mt-0.5">
                                                <span className="font-bold text-indigo-500">{selectedTicket.org_name || selectedTicket.org || selectedTicket.created_by_name} Admin</span>
                                                <span>•</span>
                                                <span>{selectedTicket.date || (selectedTicket.created_at ? new Date(selectedTicket.created_at).toLocaleString() : '—')}</span>
                                            </div>
                                        </div>
                                    </div>
                                    {selectedTicket.status !== 'Resolved' && (
                                        <button className="px-4 py-2 bg-slate-100 dark:bg-slate-900 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] font-black uppercase text-slate-500 transition-all ml-4">
                                            Mark Resolved
                                        </button>
                                    )}
                                </div>

                                {/* Chat Thread */}
                                <div className="flex-1 p-6 overflow-y-auto space-y-6 custom-scrollbar bg-slate-50/30 dark:bg-slate-900/20">
                                    {/* Org Admin Message */}
                                    <div className="flex gap-4 animate-in slide-in-from-bottom-2">
                                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-black text-[10px] text-slate-500 shrink-0">
                                            OA
                                        </div>
                                        <div>
                                            <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 rounded-2xl rounded-tl-sm max-w-xl shadow-sm">
                                                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-medium">{selectedTicket.message}</p>
                                            </div>
                                            <p className="text-[9px] text-slate-400 mt-1.5 font-bold uppercase ml-1">Org Admin • {selectedTicket.time || (selectedTicket.created_at ? new Date(selectedTicket.created_at).toLocaleTimeString() : '')}</p>
                                        </div>
                                    </div>

                                    {selectedTicket.status === 'Resolved' && (
                                        <div className="flex flex-row-reverse gap-4 animate-in slide-in-from-bottom-2">
                                            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-black text-[10px] text-white shrink-0">
                                                SA
                                            </div>
                                             <div className="flex flex-col items-end">
                                                <div className="bg-indigo-600 p-4 rounded-2xl rounded-tr-sm max-w-xl shadow-md">
                                                    <p className="text-sm text-white leading-relaxed font-medium">{selectedTicket.lastMessage?.replace('super_admin: ', '') || 'Ticket resolved by Super Admin.'}</p>
                                                </div>
                                                <p className="text-[9px] text-slate-400 mt-1.5 font-bold uppercase mr-1">Super Admin • {selectedTicket.updated_at ? new Date(selectedTicket.updated_at).toLocaleTimeString() : 'Just now'}</p>
                                            </div>
                                        </div>
                                    )}
                                    
                                    {selectedTicket.status === 'Resolved' && (
                                        <div className="flex justify-center my-6">
                                            <span className="px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 border border-emerald-100 dark:border-emerald-800 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5">
                                                <CheckCircleIcon className="w-3 h-3" />
                                                Ticket Closed
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Reply Input */}
                                {selectedTicket.status !== 'Resolved' && (
                                    <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800 shrink-0">
                                        <div className="flex items-end gap-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl p-2 pb-2 shadow-inner focus-within:border-indigo-500/50 focus-within:ring-2 focus-within:ring-indigo-500/10 transition-all">
                                            <textarea 
                                                value={reply}
                                                onChange={(e) => setReply(e.target.value)}
                                                placeholder={`Reply to ${selectedTicket.org}...`}
                                                className="flex-1 bg-transparent p-3 text-sm font-medium outline-none resize-none max-h-32 dark:text-white"
                                                rows={1}
                                                style={{ minHeight: '44px' }}
                                                onInput={(e) => {
                                                    const target = e.target as HTMLTextAreaElement;
                                                    target.style.height = 'auto';
                                                    target.style.height = `${target.scrollHeight}px`;
                                                }}
                                            />
                                            <button 
                                                onClick={handleReply}
                                                disabled={sending || !reply.trim()}
                                                className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-md disabled:opacity-50 disabled:shadow-none transition-all mb-0.5 mr-0.5 shrink-0"
                                            >
                                                {sending ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <ChevronRightIcon className="w-5 h-5" />}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 dark:bg-slate-900/20">
                                <div className="w-20 h-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2rem] flex items-center justify-center shadow-sm mb-4 rotate-12 transition-transform hover:rotate-0">
                                    <ChatBubbleLeftRightIcon className="w-8 h-8 text-slate-300" />
                                </div>
                                <h3 className="text-slate-500 dark:text-slate-300 font-bold text-lg">Helpdesk Command Center</h3>
                                <p className="text-sm font-medium mt-1">Select a ticket from the queue to start responding</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AppLayout>
    );
};

export default SuperAdminSupportPage;
