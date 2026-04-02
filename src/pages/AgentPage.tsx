import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { VoiceAgent, VoiceAgentStatus } from '../types';
import AgentDetailPage from './AgentDetailPage';
import Modal from '../components/Modal';
import { agentService } from '../services/agentService';
import { useAuth } from '../contexts/AuthContext';
import AppLayout from '../components/AppLayout';
import UpgradePlanModal from '../components/UpgradePlanModal';
import { usePlanAccess } from '../utils/usePlanAccess';
import {
    PlusIcon,
    UserIcon,
    EllipsisVerticalIcon,
    TrashIcon,
    DocumentDuplicateIcon,
    PencilIcon,
    UserCircleIcon,
    CalendarIcon,
    ClockIcon,
    SignalIcon,
    ChevronLeftIcon
} from '@heroicons/react/24/outline';
import Skeleton from '../components/Skeleton';
// No initial agents fallback

const AgentPage: React.FC = () => {
    const [agents, setAgents] = useState<VoiceAgent[]>([]);
    const [selectedAgent, setSelectedAgent] = useState<VoiceAgent | null>(null);
    const [stagedAgent, setStagedAgent] = useState<VoiceAgent | null>(null);
    const [view, setView] = useState<'list' | 'create'>('list');
    const [newAgentName, setNewAgentName] = useState('');
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [agentToDelete, setAgentToDelete] = useState<VoiceAgent | null>(null);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    const { checkAccess, blockingReason, clearBlock } = usePlanAccess();

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (activeDropdown && !(event.target as Element).closest('.dropdown-menu') && !(event.target as Element).closest('.dropdown-trigger')) {
                setActiveDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [activeDropdown]);

    // Load agents
    useEffect(() => {
        if (user) {
            loadAgents();
        }
    }, [user]);

    const loadAgents = async () => {
        try {
            setLoading(true);
            if (!user) {
                setAgents([]);
                setLoading(false);
                return;
            }
            const agentData = await agentService.getAgents(user.id);
            if (agentData && agentData.length > 0) {
                setAgents(agentData);
            } else {
                setAgents([]);
            }
        } catch (error) {
            console.error('Error loading agents:', error);
            setAgents([]);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateAgent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newAgentName.trim()) return;

        if (!user) { return; }

        // Check plan access (credits + validity)
        const allowed = await checkAccess(user.id);
        if (!allowed) return;

        try {
            if (!user) throw new Error('User not authenticated');
            const newAgent: Omit<VoiceAgent, 'id' | 'createdDate'> = {
                name: newAgentName,
                identity: `This is the default identity for ${newAgentName}. Click to edit the agent's prompt, personality, and goals.`,
                status: VoiceAgentStatus.Active,
                model: 'gemini-2.0-flash',
                voiceId: 'eleven-rachel',
                language: 'ENGLISH',
                settings: {
                    userStartsFirst: false,
                    greetingLine: "Welcome! How can I help you?",
                    responseDelay: false,
                    inactivityHandling: true,
                    agentCanTerminateCall: false,
                    voicemailDetection: true,
                    callTransfer: true,
                    dtmfDial: false,
                    agentTimezone: 'America/New_York',
                    voiceDetectionConfidenceThreshold: 0.5,
                    overrideVAD: false,
                    backgroundAmbientSound: 'None',
                    callRecording: true,
                    sessionTimeoutFixedDuration: 3600,
                    sessionTimeoutNoVoiceActivity: 300,
                    sessionTimeoutEndMessage: "Your session has ended.",
                    dataPrivacyOptOut: false,
                    doNotCallDetection: true,
                    prefetchDataWebhook: '',
                    endOfCallWebhook: '',
                    preActionPhrases: [],
                    tools: [],
                    knowledgeDocIds: [],
                },
            };

            const createdAgent = await agentService.createAgent(user.id, newAgent);
            setAgents(prev => [createdAgent, ...prev]);
            setView('list');
            setNewAgentName('');
        } catch (error) {
            console.error('Error creating agent:', error);
            alert('Failed to create agent');
        }
    };

    const formatDateTime = (isoString: string) => {
        const date = new Date(isoString);
        return {
            date: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            time: date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
        };
    };

    const handleBackToList = () => {
        setSelectedAgent(null);
        setStagedAgent(null);
        loadAgents();
    };

    const handleSaveAgent = async () => {
        if (!stagedAgent || !user) return;
        try {
            const agent = await agentService.updateAgent(user.id, stagedAgent.id, stagedAgent);
            setAgents(prev => prev.map(a => a.id === agent.id ? agent : a));
            setSelectedAgent(agent);
        } catch (error) {
            console.error('Error saving agent:', error);
            alert('Failed to save agent');
        }
    };

    const handleToggleDropdown = (agentId: string, event: React.MouseEvent) => {
        event.stopPropagation();
        if (activeDropdown === agentId) {
            setActiveDropdown(null);
        } else {
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
            setDropdownPos({
                top: rect.bottom + window.scrollY,
                left: rect.right + window.scrollX - 224
            });
            setActiveDropdown(agentId);
        }
    };

    const handleEditAgent = (agent: VoiceAgent) => {
        setSelectedAgent(agent);
        setStagedAgent(agent);
        setActiveDropdown(null);
    };

    const handleDuplicateAgent = async (agentToDuplicate: VoiceAgent) => {
        try {
            if (!user) throw new Error('User not authenticated');

            // Check plan access before duplicating
            const allowed = await checkAccess(user.id);
            if (!allowed) return undefined;

            const duplicatedAgentData: Omit<VoiceAgent, 'id' | 'createdDate'> = {
                ...JSON.parse(JSON.stringify(agentToDuplicate)),
                name: `${agentToDuplicate.name} (Copy)`,
            };
            const duplicatedAgent = await agentService.createAgent(user.id, duplicatedAgentData);
            setAgents(prev => [duplicatedAgent, ...prev]);
            setActiveDropdown(null);
            return duplicatedAgent;
        } catch (error) {
            console.error('Error duplicating agent:', error);
            alert('Failed to duplicate agent');
        }
    };

    const handleDeleteRequest = (agentId: string) => {
        const agent = agents.find(a => a.id === agentId);
        if (agent) {
            setAgentToDelete(agent);
            setIsDeleteModalOpen(true);
        }
        setActiveDropdown(null);
    };

    const handleConfirmDelete = async () => {
        if (agentToDelete && user) {
            try {
                await agentService.deleteAgent(user.id, agentToDelete.id);
                setAgents(prev => prev.filter(agent => agent.id !== agentToDelete.id));
                setIsDeleteModalOpen(false);
                setAgentToDelete(null);
            } catch (error) {
                console.error('Error deleting agent:', error);
                alert('Failed to delete agent');
            }
        }
    };

    const addButton = (
        <button
            onClick={async () => {
                if (!user) return;
                const allowed = await checkAccess(user.id);
                if (!allowed) return;
                setView('create');
            }}
            className="flex items-center space-x-2 bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-xl font-bold transition-all duration-300 shadow-lg shadow-primary/25 transform hover:scale-[1.02] active:scale-[0.98]"
        >
            <PlusIcon className="h-5 w-5" />
            <span>Create Agent</span>
        </button>
    );

    if (selectedAgent && user) {
        return (
            <AppLayout
                breadcrumbs={[
                    { label: 'Dashboard', path: '/dashboard' },
                    { label: 'Agents', path: '/agents' },
                    { label: selectedAgent.name }
                ]}
                pageTitle={selectedAgent.name}
                pageDescription="Configure your agent's identity, voice, and tools."
                primaryAction={
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={handleBackToList}
                            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all font-bold group"
                        >
                            <ChevronLeftIcon className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                        </button>

                        <button
                            onClick={handleSaveAgent}
                            disabled={!stagedAgent || JSON.stringify(stagedAgent) === JSON.stringify(selectedAgent)}
                            className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50 ${stagedAgent && JSON.stringify(stagedAgent) !== JSON.stringify(selectedAgent)
                                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/25'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                }`}
                        >
                            Save Changes
                        </button>

                        <div className="relative dropdown-trigger">
                            <button
                                onClick={(e) => handleToggleDropdown(selectedAgent.id, e)}
                                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-6 py-2.5 rounded-xl font-black text-slate-700 dark:text-white flex items-center shadow-lg shadow-slate-200/50 dark:shadow-none hover:border-primary/30 transition-all uppercase tracking-wider text-xs"
                            >
                                Agent Actions
                                <EllipsisVerticalIcon className="w-4 h-4 ml-2" />
                            </button>
                        </div>
                    </div>
                }
            >
                <AgentDetailPage
                    agent={selectedAgent}
                    onBack={handleBackToList}
                    updateAgent={(agent) => setStagedAgent(agent)}
                    onDuplicate={async (agent) => {
                        const newAgent = await handleDuplicateAgent(agent);
                        if (newAgent) {
                            setSelectedAgent(null);
                            alert(`Agent "${newAgent.name}" created.`);
                        }
                    }}
                    onDelete={async (agentId) => {
                        handleDeleteRequest(agentId);
                    }}
                    userId={user.id}
                />
            </AppLayout>
        );
    }

    if (view === 'create') {
        return (
            <AppLayout
                breadcrumbs={[
                    { label: 'Dashboard', path: '/dashboard' },
                    { label: 'Agents', path: '/agents' },
                    { label: 'Create' }
                ]}
                pageTitle="Create Agent"
                pageDescription="Define a new AI persona for your voice calls."
            >
                <div className="max-w-2xl mx-auto py-8">
                    <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm">
                        <form onSubmit={handleCreateAgent}>
                            <div className="space-y-6">
                                <div>
                                    <label htmlFor="agentName" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Agent Name</label>
                                    <input
                                        type="text"
                                        id="agentName"
                                        value={newAgentName}
                                        onChange={(e) => setNewAgentName(e.target.value)}
                                        required
                                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                        placeholder="e.g. Customer Support AI"
                                    />
                                </div>
                            </div>
                            <div className="mt-8 flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setView('list')}
                                    className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-xl font-bold shadow-lg shadow-primary/20 transition-all"
                                >
                                    Create Persona
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Dashboard', path: '/dashboard' },
                { label: 'Agents' }
            ]}
            pageTitle="Agents"
            pageDescription="Manage your AI agents and their custom personality profiles."
            primaryAction={addButton}
        >
            <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden card-animate">
                {loading ? (
                    <div className="overflow-x-auto overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                                <tr>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Agent Persona</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Configuration</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Added Date</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                                    <th className="px-6 py-4 text-right"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                {[...Array(5)].map((_, i) => (
                                    <tr key={i}>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center space-x-4">
                                                <Skeleton width={40} height={40} variant="rounded" />
                                                <div className="space-y-2">
                                                    <Skeleton width={120} height={14} variant="text" />
                                                    <Skeleton width={80} height={10} variant="text" />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center space-x-3">
                                                <div className="flex -space-x-2">
                                                    <Skeleton width={24} height={24} variant="rounded" className="border border-white dark:border-slate-800" />
                                                    <Skeleton width={24} height={24} variant="rounded" className="border border-white dark:border-slate-800" />
                                                </div>
                                                <Skeleton width={60} height={12} variant="text" />
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="space-y-2">
                                                <Skeleton width={100} height={14} variant="text" />
                                                <Skeleton width={60} height={10} variant="text" />
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <Skeleton width={80} height={24} variant="rounded" />
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <Skeleton width={32} height={32} variant="rounded" className="ml-auto" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : agents.length === 0 ? (
                    <div className="p-20 text-center">
                        <div className="w-20 h-20 bg-slate-50 dark:bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-6">
                            <UserCircleIcon className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">No agents yet</h3>
                        <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-xs mx-auto">Create your first AI persona to handle your calls automatically.</p>
                        <button onClick={() => setView('create')} className="bg-primary text-white font-bold px-8 py-3 rounded-2xl shadow-lg shadow-primary/20">Create Agent</button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                                <tr>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Agent Persona</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Configuration</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Added Date</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                                    <th className="px-6 py-4 text-right"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                {agents.map((agent, idx) => (
                                    <tr
                                        key={agent.id}
                                        className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors cursor-pointer group"
                                        onClick={() => handleEditAgent(agent)}
                                    >
                                        <td className="px-6 py-5">
                                            <div className="flex items-center space-x-4">
                                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                                    <UserIcon className="h-5 w-5" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-800 dark:text-white">{agent.name}</p>
                                                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tight">{agent.model}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center space-x-3">
                                                <div className="flex -space-x-2">
                                                    <div className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500 border border-blue-100 dark:border-blue-900/50" title="Voice Enabled">
                                                        <SignalIcon className="h-3 w-3" />
                                                    </div>
                                                    <div className="w-6 h-6 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center text-purple-500 border border-purple-100 dark:border-purple-900/50" title="Tools Configured">
                                                        <ClockIcon className="h-3 w-3" />
                                                    </div>
                                                </div>
                                                <span className="text-[10px] font-bold text-slate-400">{agent.language}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center space-x-2">
                                                <CalendarIcon className="h-4 w-4 text-slate-300" />
                                                <div>
                                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{formatDateTime(agent.createdDate).date}</p>
                                                    <p className="text-[10px] text-slate-400">{formatDateTime(agent.createdDate).time}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            {agent.hasPhoneNumber ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-900/50">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse"></span>
                                                    Active
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mr-1.5"></span>
                                                    Inactive
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <button
                                                onClick={(e) => handleToggleDropdown(agent.id, e)}
                                                className="dropdown-trigger p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
                                            >
                                                <EllipsisVerticalIcon className="h-5 w-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {activeDropdown && (() => {
                const agent = agents.find(a => a.id === activeDropdown);
                if (!agent) return null;
                return createPortal(
                    <div
                        className="dropdown-menu absolute w-56 bg-white dark:bg-slate-800/95 backdrop-blur-md rounded-2xl shadow-2xl z-50 border border-slate-200 dark:border-slate-700 py-2 animate-in fade-in slide-in-from-top-2 duration-200"
                        style={{ top: `${dropdownPos.top}px`, left: `${dropdownPos.left}px` }}
                    >
                        <button onClick={(e) => { e.stopPropagation(); handleEditAgent(agent); }} className="w-full flex items-center space-x-3 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                            <PencilIcon className="h-4 w-4 text-slate-400" />
                            <span className="font-medium">Edit Details</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDuplicateAgent(agent); }} className="w-full flex items-center space-x-3 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                            <DocumentDuplicateIcon className="h-4 w-4 text-slate-400" />
                            <span className="font-medium">Duplicate Agent</span>
                        </button>
                        <div className="h-px bg-slate-100 dark:bg-slate-700 my-1 mx-2"></div>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteRequest(agent.id); }} className="w-full flex items-center space-x-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                            <TrashIcon className="h-4 w-4" />
                            <span className="font-medium">Delete Agent</span>
                        </button>
                    </div>,
                    document.body
                );
            })()}

            <Modal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                title="Confirm Deletion"
            >
                <div className="p-2">
                    <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                        <TrashIcon className="h-8 w-8 text-red-500" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white text-center mb-2">Delete Agent?</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-8">
                        Are you sure you want to delete <span className="font-bold text-slate-800 dark:text-white">"{agentToDelete?.name}"</span>? This action is permanent and cannot be undone.
                    </p>
                    <div className="flex gap-4">
                        <button onClick={() => setIsDeleteModalOpen(false)} className="flex-1 px-4 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-2xl transition-all">Cancel</button>
                        <button onClick={handleConfirmDelete} className="flex-1 bg-red-500 text-white font-bold px-4 py-3 rounded-2xl shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all">Delete Forever</button>
                    </div>
                </div>
            </Modal>

            {/* Upgrade Plan Modal — shown when credits are 0 or plan is expired */}
            <UpgradePlanModal reason={blockingReason} onClose={clearBlock} />
        </AppLayout>
    );
};

export default AgentPage;