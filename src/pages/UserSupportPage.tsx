import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import {
    TicketIcon,
    ChatBubbleLeftRightIcon,
    PaperAirplaneIcon,
    ExclamationCircleIcon,
    ClockIcon,
    CheckCircleIcon,
    ChevronRightIcon,
    ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { createSupportTicket, listSupportTickets } from '../utils/adminApi';

const UserSupportPage: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [error, setError] = useState('');
    
    const [tickets, setTickets] = useState<any[]>([]);
    const [newTicket, setNewTicket] = useState({
        subject: '',
        category: 'Technical',
        priority: 'Medium',
        message: '',
    });

    const getUserData = () => {
        const raw = localStorage.getItem('ziya-user');
        return raw ? JSON.parse(raw) : null;
    };

    const fetchTickets = async (user: any) => {
        try {
            const { tickets: tList } = await listSupportTickets({
                created_by: user.id,
                created_by_role: 'user',
            });
            setTickets(tList);
        } catch (err: any) {
            setError(err.message || 'Failed to load tickets');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const user = getUserData();
        if (!user) {
            navigate('/login');
            return;
        }
        fetchTickets(user);
    }, [navigate]);

    const handleCreateTicket = async (e: React.FormEvent) => {
        e.preventDefault();
        const user = getUserData();
        if (!user) return;
        setSubmitting(true);
        setError('');
        try {
            await createSupportTicket({
                subject: newTicket.subject,
                category: newTicket.category,
                priority: newTicket.priority,
                message: newTicket.message,
                created_by: user.id,
                created_by_role: 'user',
                target_role: 'org_admin',
                organization_id: user.organization_id || null,
            });
            setNewTicket({ subject: '', category: 'Technical', priority: 'Medium', message: '' });
            setSuccessMessage('Ticket raised! Your organization admin has been notified.');
            setTimeout(() => setSuccessMessage(''), 4000);
            // Refresh ticket list
            await fetchTickets(user);
        } catch (err: any) {
            setError(err.message || 'Failed to raise ticket');
        } finally {
            setSubmitting(false);
        }
    };


    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Dashboard', path: '/dashboard' },
                { label: 'Support' }
            ]}
            pageTitle="Support Center"
            pageDescription="Raise technical issues, queries, or requests directly to your Organization Admin."
        >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Raise Ticket Form */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm sticky top-24">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-xl">
                                <TicketIcon className="w-5 h-5 text-primary" />
                            </div>
                            <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">Raise Ticket</h3>
                        </div>
                        <form onSubmit={handleCreateTicket} className="p-6 space-y-4">
                            {successMessage && (
                                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-xl text-emerald-700 dark:text-emerald-400 text-xs font-bold flex items-center gap-2">
                                    <CheckCircleIcon className="w-4 h-4" />
                                    {successMessage}
                                </div>
                            )}
                            {error && (
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-xs font-bold">
                                    {error}
                                </div>
                            )}


                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Subject</label>
                                <input
                                    type="text"
                                    required
                                    value={newTicket.subject}
                                    onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
                                    placeholder="Brief summary of the issue"
                                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Category</label>
                                    <select
                                        value={newTicket.category}
                                        onChange={(e) => setNewTicket({ ...newTicket, category: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-white outline-none"
                                    >
                                        <option>Technical</option>
                                        <option>Billing</option>
                                        <option>Other</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Priority</label>
                                    <select
                                        value={newTicket.priority}
                                        onChange={(e) => setNewTicket({ ...newTicket, priority: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-white outline-none"
                                    >
                                        <option>Low</option>
                                        <option>Medium</option>
                                        <option>High</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Description</label>
                                <textarea
                                    required
                                    rows={4}
                                    value={newTicket.message}
                                    onChange={(e) => setNewTicket({ ...newTicket, message: e.target.value })}
                                    placeholder="Describe your problem in detail..."
                                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/20 transition-all outline-none resize-none"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full flex items-center justify-center gap-2 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                            >
                                {submitting ? (
                                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <span>Notify Admin</span>
                                        <PaperAirplaneIcon className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Ticket List */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-500/10 rounded-xl">
                                    <ChatBubbleLeftRightIcon className="w-5 h-5 text-blue-500" />
                                </div>
                                <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">My Tickets</h3>
                            </div>
                            <span className="text-[10px] font-black text-slate-400 uppercase bg-slate-100 dark:bg-slate-900 px-3 py-1 rounded-full">{tickets.length} Total</span>
                        </div>
                        
                        <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
                            {loading ? (
                                [...Array(2)].map((_, i) => (
                                    <div key={i} className="p-6 animate-pulse space-y-3">
                                        <div className="h-4 bg-slate-100 dark:bg-slate-900 rounded-lg w-1/3" />
                                        <div className="h-3 bg-slate-50 dark:bg-slate-950 rounded-lg w-1/2" />
                                    </div>
                                ))
                            ) : tickets.length > 0 ? (
                                tickets.map((ticket) => (
                                    <div key={ticket.id} className="p-6 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-all group cursor-pointer">
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black text-primary font-mono bg-primary/5 px-1.5 py-0.5 rounded uppercase tracking-tighter">{ticket.id}</span>
                                                    <h4 className="text-sm font-bold text-slate-800 dark:text-white group-hover:text-primary transition-colors">{ticket.subject}</h4>
                                                </div>
                                                <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400">
                                                     <span className="flex items-center gap-1">
                                                        <ClockIcon className="w-3 h-3" />
                                                        {ticket.date || (ticket.created_at ? new Date(ticket.created_at).toLocaleDateString() : '—')}
                                                     </span>

                                                    <span className={`flex items-center gap-1 ${ticket.priority === 'High' || ticket.priority === 'Urgent' ? 'text-red-500' : 'text-slate-400'}`}>
                                                        <ExclamationCircleIcon className="w-3 h-3" />
                                                        {ticket.priority} Priority
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                                                    ticket.status === 'Open' ? 'bg-blue-100 text-blue-600' :
                                                    ticket.status === 'Resolved' ? 'bg-emerald-100 text-emerald-600' :
                                                    ticket.status === 'Pending' ? 'bg-amber-100 text-amber-600' :
                                                    'bg-slate-100 text-slate-500'
                                                }`}>
                                                    {ticket.status}
                                                </span>
                                                <ChevronRightIcon className="w-4 h-4 text-slate-300 group-hover:translate-x-0.5 transition-transform" />
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-500 font-medium pl-1 line-clamp-1 italic">
                                            Latest: {ticket.lastMessage}
                                        </p>
                                    </div>
                                ))
                            ) : (
                                <div className="p-12 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                                    No support tickets found.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
};

export default UserSupportPage;
