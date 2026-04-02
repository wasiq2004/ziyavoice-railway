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
    UserCircleIcon,
    ShieldCheckIcon
} from '@heroicons/react/24/outline';
import { createSupportTicket, listSupportTickets, replyToSupportTicket, updateTicketStatus } from '../utils/adminApi';

const AdminSupportPage: React.FC = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'users' | 'superadmin'>('users');
    
    // States for 'superadmin' tab (Raising tickets to Super Admin)
    const [saLoading, setSaLoading] = useState(true);
    const [submittingSa, setSubmittingSa] = useState(false);
    const [saSuccessMsg, setSaSuccessMsg] = useState('');
    const [saError, setSaError] = useState('');
    const [saTickets, setSaTickets] = useState<any[]>([]);
    const [newSaTicket, setNewSaTicket] = useState({
        subject: '',
        category: 'Technical',
        priority: 'Medium',
        message: '',
    });

    // States for 'users' tab (Acting as Helpdesk for users)
    const [userHelpdeskLoading, setUserHelpdeskLoading] = useState(true);
    const [userTickets, setUserTickets] = useState<any[]>([]);
    const [selectedUserTicket, setSelectedUserTicket] = useState<any>(null);
    const [userReply, setUserReply] = useState('');
    const [sendingUserReply, setSendingUserReply] = useState(false);

    const getAdmin = () => {
        const raw = localStorage.getItem('ziya-user');
        return raw ? JSON.parse(raw) : null;
    };

    const adminRole = getAdmin()?.role;

    const fetchSaTickets = async (admin: any) => {
        if (admin.role === 'super_admin') {
            setSaLoading(false);
            return; // Super admins don't raise tickets to themselves
        }
        try {
            const { tickets } = await listSupportTickets({
                created_by: admin.id,
                created_by_role: 'org_admin',
                target_role: 'super_admin'
            });
            setSaTickets(tickets);
        } catch (err: any) {
            setSaError(err.message || 'Failed to load tickets');
        } finally {
            setSaLoading(false);
        }
    };

    const fetchUserTickets = async (admin: any) => {
        try {
            if (admin.role === 'super_admin') {
                const { tickets } = await listSupportTickets({
                    target_role: 'super_admin',
                });
                setUserTickets(tickets);
            } else {
                const { tickets } = await listSupportTickets({
                    target_role: 'org_admin',
                    organization_id: admin.organization_id,
                });
                setUserTickets(tickets.filter((t: any) => t.created_by_role === 'user'));
            }
        } catch (err: any) {
            console.error('Failed to load user tickets:', err);
        } finally {
            setUserHelpdeskLoading(false);
        }
    };

    useEffect(() => {
        const admin = getAdmin();
        if (!admin) {
            navigate('/login');
            return;
        }
        fetchSaTickets(admin);
        fetchUserTickets(admin);
    }, [navigate]);

    const handleCreateSaTicket = async (e: React.FormEvent) => {
        e.preventDefault();
        const admin = getAdmin();
        if (!admin || admin.role === 'super_admin') return;
        setSubmittingSa(true);
        setSaError('');
        try {
            await createSupportTicket({
                subject: newSaTicket.subject,
                category: newSaTicket.category,
                priority: newSaTicket.priority,
                message: newSaTicket.message,
                created_by: admin.id,
                created_by_role: 'org_admin',
                target_role: 'super_admin',
                organization_id: admin.organization_id || null,
            });
            setNewSaTicket({ subject: '', category: 'Technical', priority: 'Medium', message: '' });
            setSaSuccessMsg('Ticket raised! Super admin has been notified.');
            setTimeout(() => setSaSuccessMsg(''), 4000);
            await fetchSaTickets(admin);
        } catch (err: any) {
            setSaError(err.message || 'Failed to raise ticket');
        } finally {
            setSubmittingSa(false);
        }
    };

    const handleReplyToUser = async () => {
        if (!userReply.trim() || !selectedUserTicket) return;
        const admin = getAdmin();
        if (!admin) return;
        setSendingUserReply(true);
        try {
            await replyToSupportTicket(selectedUserTicket.id, userReply, admin.id, admin.role);
            await updateTicketStatus(selectedUserTicket.id, 'In Progress');
            const updated = userTickets.map(t => t.id === selectedUserTicket.id ? {...t, status: 'In Progress'} : t);
            setUserTickets(updated);
            setUserReply('');
            setSelectedUserTicket({...selectedUserTicket, status: 'In Progress'});
            // Optimistically add reply
            if (selectedUserTicket.replies) {
                selectedUserTicket.replies.push({
                    user_role: admin.role,
                    message: userReply,
                    created_at: new Date().toISOString()
                });
            }
        } catch (err: any) {
            console.error('Failed to send reply:', err);
        } finally {
            setSendingUserReply(false);
        }
    };

    const formatDate = (ds: string) => {
        if (!ds) return '';
        return new Date(ds).toLocaleDateString();
    };
    
    const formatTime = (ds: string) => {
        if (!ds) return '';
        return new Date(ds).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    };

    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Admin', path: '/admin/dashboard' },
                { label: 'Support' }
            ]}
            pageTitle="Support Center"
            pageDescription="Manage your users' support requests or raise technical issues to the Super Admin."
        >
            <div className="space-y-6">
                
                {/* Tabs */}
                <div className="flex p-1 bg-slate-100 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 w-fit">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider transition-all ${activeTab === 'users' ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                        <UserCircleIcon className="w-5 h-5" />
                        {adminRole === 'super_admin' ? 'Org Admin Helpdesk' : 'User Helpdesk'}
                    </button>
                    {adminRole !== 'super_admin' && (
                        <button
                            onClick={() => setActiveTab('superadmin')}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider transition-all ${activeTab === 'superadmin' ? 'bg-white dark:bg-slate-700 text-indigo-500 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                            <ShieldCheckIcon className="w-5 h-5" />
                            Contact Super Admin
                        </button>
                    )}
                </div>

                {/* USER HELPDESK TAB */}
                {activeTab === 'users' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[700px] animate-in fade-in duration-300">
                        {/* Ticket Queue */}
                        <div className="lg:col-span-4 bg-white dark:bg-slate-800/50 rounded-[2rem] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm flex flex-col h-full">
                            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
                                <ChatBubbleLeftRightIcon className="w-5 h-5 text-primary" />
                                <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest">User Tickets</h3>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-50 dark:divide-slate-800/50">
                                {userHelpdeskLoading ? (
                                    [...Array(4)].map((_, i) => <div key={i} className="p-5 h-24 animate-pulse bg-slate-50 dark:bg-slate-900/50" />)
                                ) : userTickets.map((t) => (
                                    <div 
                                        key={t.id} 
                                        onClick={() => setSelectedUserTicket(t)}
                                        className={`p-5 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-900/30 ${selectedUserTicket?.id === t.id ? 'bg-blue-50/50 dark:bg-blue-900/20 border-l-4 border-l-primary' : 'border-l-4 border-transparent'}`}
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
                                        <h4 className={`text-sm font-bold mb-1 truncate ${selectedUserTicket?.id === t.id ? 'text-primary' : 'text-slate-800 dark:text-white'}`}>{t.subject}</h4>
                                        <div className="flex justify-between items-center text-[10px]">
                                            <span className="text-slate-500 font-medium">@{t.creator_name || t.creator_email}</span>
                                            <span className="text-slate-400 font-bold">{formatDate(t.created_at)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Ticket Thread */}
                        <div className="lg:col-span-8 bg-white dark:bg-slate-800/50 rounded-[2rem] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm flex flex-col h-full relative">
                            {selectedUserTicket ? (
                                <>
                                    <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800/80 flex justify-between items-center shrink-0 z-10 shadow-sm">
                                        <div className="flex gap-4 items-center">
                                            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center font-black text-primary uppercase">
                                                {(selectedUserTicket.creator_name || selectedUserTicket.creator_email || 'U').substring(0,2)}
                                            </div>
                                            <div>
                                                <h2 className="text-lg font-black text-slate-800 dark:text-white">{selectedUserTicket.subject}</h2>
                                                <div className="flex gap-2 items-center text-xs text-slate-500 font-medium mt-0.5">
                                                    <span className="font-bold text-primary">@{selectedUserTicket.creator_name || selectedUserTicket.creator_email}</span>
                                                    <span>•</span>
                                                    <span>{formatDate(selectedUserTicket.created_at)} at {formatTime(selectedUserTicket.created_at)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        {selectedUserTicket.status !== 'Resolved' && (
                                            <button 
                                                onClick={async () => {
                                                    await updateTicketStatus(selectedUserTicket.id, 'Resolved');
                                                    const updated = userTickets.map(t => t.id === selectedUserTicket.id ? {...t, status: 'Resolved'} : t);
                                                    setUserTickets(updated);
                                                    setSelectedUserTicket({...selectedUserTicket, status: 'Resolved'});
                                                }}
                                                className="px-4 py-2 bg-slate-100 dark:bg-slate-900 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] font-black uppercase text-slate-500 transition-all ml-4"
                                            >
                                                Mark Resolved
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex-1 p-6 overflow-y-auto space-y-6 custom-scrollbar bg-slate-50/30 dark:bg-slate-900/20">
                                        <div className="flex gap-4 animate-in slide-in-from-bottom-2">
                                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-black text-[10px] text-slate-500 shrink-0">
                                                U
                                            </div>
                                            <div>
                                                <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 rounded-2xl rounded-tl-sm max-w-xl shadow-sm">
                                                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-medium">{selectedUserTicket.message}</p>
                                                </div>
                                                <p className="text-[9px] text-slate-400 mt-1.5 font-bold uppercase ml-1">User • {formatTime(selectedUserTicket.created_at)}</p>
                                            </div>
                                        </div>

                                        {selectedUserTicket.replies?.map((r: any) => (
                                            <div key={r.id || Math.random()} className={`flex gap-4 animate-in slide-in-from-bottom-2 ${r.user_role === 'org_admin' ? 'flex-row-reverse' : ''}`}>
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-[10px] shrink-0 ${r.user_role === 'org_admin' ? 'bg-primary text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
                                                    {r.user_role === 'org_admin' ? 'AD' : 'U'}
                                                </div>
                                                <div className={`flex flex-col ${r.user_role === 'org_admin' ? 'items-end' : ''}`}>
                                                    <div className={`p-4 rounded-2xl max-w-xl shadow-md ${r.user_role === 'org_admin' ? 'bg-primary text-white rounded-tr-sm' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-tl-sm border'}`}>
                                                        <p className="text-sm leading-relaxed font-medium">{r.message}</p>
                                                    </div>
                                                    <p className={`text-[9px] text-slate-400 mt-1.5 font-bold uppercase ${r.user_role === 'org_admin' ? 'mr-1' : 'ml-1'}`}>
                                                        {r.user_role === 'org_admin' ? 'Admin' : 'User'} • {formatTime(r.created_at)}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}

                                        {selectedUserTicket.status === 'Resolved' && (
                                            <div className="flex justify-center my-6">
                                                <span className="px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 border border-emerald-100 dark:border-emerald-800 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5">
                                                    <CheckCircleIcon className="w-3 h-3" />
                                                    Ticket Closed
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    {selectedUserTicket.status !== 'Resolved' && (
                                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800 shrink-0">
                                            <div className="flex items-end gap-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl p-2 pb-2 shadow-inner focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
                                                <textarea 
                                                    value={userReply}
                                                    onChange={(e) => setUserReply(e.target.value)}
                                                    placeholder="Reply to user..."
                                                    className="flex-1 bg-transparent p-3 text-sm font-medium outline-none resize-none max-h-32 dark:text-white"
                                                    rows={1}
                                                    style={{ minHeight: '44px' }}
                                                />
                                                <button 
                                                    onClick={handleReplyToUser}
                                                    disabled={sendingUserReply || !userReply.trim()}
                                                    className="p-3 bg-primary hover:bg-primary-hover text-white rounded-2xl shadow-md disabled:opacity-50 disabled:shadow-none transition-all mb-0.5 mr-0.5 shrink-0"
                                                >
                                                    {sendingUserReply ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <ChevronRightIcon className="w-5 h-5" />}
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
                                    <h3 className="text-slate-500 dark:text-slate-300 font-bold text-lg">Select a user ticket to reply</h3>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* SUPER ADMIN CONTACT TAB */}
                {activeTab === 'superadmin' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-300">
                        {/* Raise SA Ticket */}
                        <div className="lg:col-span-1 space-y-6">
                            <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                                    <div className="p-2 bg-indigo-500/10 rounded-xl">
                                        <TicketIcon className="w-5 h-5 text-indigo-500" />
                                    </div>
                                    <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">Raise Ticket to Super Admin</h3>
                                </div>
                                <form onSubmit={handleCreateSaTicket} className="p-6 space-y-4">
                                    {saSuccessMsg && (
                                        <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-xl text-emerald-700 dark:text-emerald-400 text-xs font-bold flex items-center gap-2">
                                            <CheckCircleIcon className="w-4 h-4" />
                                            {saSuccessMsg}
                                        </div>
                                    )}
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Subject</label>
                                        <input
                                            type="text"
                                            required
                                            value={newSaTicket.subject}
                                            onChange={(e) => setNewSaTicket({ ...newSaTicket, subject: e.target.value })}
                                            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Category</label>
                                            <select
                                                value={newSaTicket.category}
                                                onChange={(e) => setNewSaTicket({ ...newSaTicket, category: e.target.value })}
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
                                                value={newSaTicket.priority}
                                                onChange={(e) => setNewSaTicket({ ...newSaTicket, priority: e.target.value })}
                                                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-white outline-none"
                                            >
                                                <option>Medium</option>
                                                <option>High</option>
                                                <option>Urgent</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Message</label>
                                        <textarea
                                            required
                                            rows={4}
                                            value={newSaTicket.message}
                                            onChange={(e) => setNewSaTicket({ ...newSaTicket, message: e.target.value })}
                                            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={submittingSa}
                                        className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                                    >
                                        {submittingSa ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <><span>Notify Super Admin</span><PaperAirplaneIcon className="w-4 h-4" /></>}
                                    </button>
                                </form>
                            </div>
                        </div>

                        {/* Recent SA Tickets List */}
                        <div className="lg:col-span-2">
                            <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-indigo-500/10 rounded-xl">
                                            <ChatBubbleLeftRightIcon className="w-5 h-5 text-indigo-500" />
                                        </div>
                                        <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">My Tickets (To Super Admin)</h3>
                                    </div>
                                </div>
                                <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
                                    {saLoading ? (
                                        [...Array(3)].map((_, i) => <div key={i} className="p-6 animate-pulse"><div className="h-4 bg-slate-100 dark:bg-slate-900 rounded-lg w-1/3 mb-2" /><div className="h-3 bg-slate-50 dark:bg-slate-950 rounded-lg w-1/2" /></div>)
                                    ) : saTickets.length > 0 ? (
                                        saTickets.map(t => (
                                            <div key={t.id} className="p-6 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-all flex justify-between gap-4">
                                                <div className="flex-1 space-y-1">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-[10px] font-black text-indigo-500 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded flex items-center">{t.id.substring(0,8)}</span>
                                                        <h4 className="text-sm font-bold text-slate-800 dark:text-white">{t.subject}</h4>
                                                    </div>
                                                    <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{t.message}</p>
                                                    <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 mt-2">
                                                        <span className="flex items-center gap-1"><ClockIcon className="w-3 h-3" />{formatDate(t.created_at)}</span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-2 shrink-0">
                                                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${t.status === 'Open' ? 'bg-blue-100 text-blue-600' : t.status === 'Resolved' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{t.status}</span>
                                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest ${t.priority === 'High' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                                                        {t.priority}
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="p-12 text-center text-slate-400">
                                            <ShieldCheckIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                            <p className="font-bold text-sm">No tickets raised to Super Admin yet.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AppLayout>
    );
};

export default AdminSupportPage;
