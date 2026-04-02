import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import CampaignCard from '../components/CampaignCard';
import CreateCampaignModal from '../components/CreateCampaignModal';
import { PlusIcon, InboxIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import Skeleton from '../components/Skeleton';
import { fetchCampaigns, createCampaign, deleteCampaign } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { usePlanAccess } from '../utils/usePlanAccess';
import UpgradePlanModal from '../components/UpgradePlanModal';

interface Campaign {
    id: string;
    name: string;
    status: 'Draft' | 'Active' | 'Paused' | 'Completed';
    totalLeads: number;
    progress: number;
    createdDate: string;
}

const CampaignsPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { checkAccess, blockingReason, clearBlock } = usePlanAccess();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
    const [searchQuery, setSearchQuery] = useState('');

    const loadCampaigns = async () => {
        if (!user?.id) return;
        try {
            setLoading(true);
            const response = await fetchCampaigns(user.id);
            console.log('Fetched campaigns response:', response);
            if (response.success && response.data) {
                const mapped: Campaign[] = response.data.map((c: any) => {
                    let displayStatus: Campaign['status'] = 'Completed';
                    const backendStatus = (c.status || '').toLowerCase();

                    if (backendStatus === 'running' || backendStatus === 'active' || backendStatus === 'starting') {
                        displayStatus = 'Active';
                    } else if (backendStatus === 'draft' || backendStatus === 'idle' || backendStatus === 'initiated') {
                        displayStatus = 'Draft';
                    } else if (backendStatus === 'paused' || backendStatus === 'stopped') {
                        displayStatus = 'Paused';
                    } else if (backendStatus === 'completed') {
                        displayStatus = 'Completed';
                    } else {
                        displayStatus = backendStatus === 'cancelled' ? 'Completed' : 'Draft';
                    }

                    return {
                        id: c.id,
                        name: c.name,
                        status: displayStatus,
                        totalLeads: c.total_contacts || 0,
                        progress: c.total_contacts > 0 ? Math.round((c.completed_calls / c.total_contacts) * 100) : 0,
                        createdDate: new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
                    };
                });
                setCampaigns(mapped);
            }
        } catch (error) {
            console.error('Error loading campaigns:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCampaigns();
    }, [user?.id]);

    const handleCreateCampaign = async (data: any) => {
        if (!user?.id) return;

        const allowed = await checkAccess(user.id);
        if (!allowed) return;

        try {
            const response = await createCampaign(user.id, data.name, data.agentId, data.concurrentCalls, data.retryAttempts);
            if (response.success) {
                await loadCampaigns();
                setIsCreateModalOpen(false);
            }
        } catch (error) {
            console.error('Error creating campaign:', error);
        }
    };

    const handleDeleteCampaign = async (id: string) => {
        if (!user?.id) return;
        if (window.confirm('Are you sure you want to delete this campaign?')) {
            try {
                const response = await deleteCampaign(id, user.id);
                if (response.success) {
                    setCampaigns(campaigns.filter(c => c.id !== id));
                }
            } catch (error) {
                console.error('Error deleting campaign:', error);
            }
        }
    };

    const filteredCampaigns = campaigns.filter(c => {
        const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesSearch) return false;

        if (activeTab === 'active') {
            return c.status !== 'Completed';
        } else {
            return c.status === 'Completed';
        }
    });

    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Dashboard', path: '/dashboard' },
                { label: 'Campaigns' }
            ]}
            pageTitle="Campaigns"
            pageDescription="Manage and monitor your outbound campaigns with AI voice agents."
            primaryAction={
                <div className="flex items-center space-x-3">
                    {/* Tab Switcher */}
                    <div className="flex p-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                        <button
                            onClick={() => setActiveTab('active')}
                            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all duration-200 ${activeTab === 'active'
                                ? 'bg-white dark:bg-slate-700 text-primary shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                        >
                            Active
                        </button>
                        <button
                            onClick={() => setActiveTab('archived')}
                            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all duration-200 ${activeTab === 'archived'
                                ? 'bg-white dark:bg-slate-700 text-primary shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                        >
                            Archived
                        </button>
                    </div>

                    {/* Search Bar */}
                    <div className="relative group hidden sm:block">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm font-medium w-48 transition-all"
                        />
                    </div>

                    <button
                        onClick={async () => {
                            if (!user) return;
                            const allowed = await checkAccess(user.id);
                            if (!allowed) return;
                            setIsCreateModalOpen(true);
                        }}
                        className="flex items-center space-x-2 bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-xl font-bold transition-all duration-300 shadow-lg shadow-primary/25"
                    >
                        <PlusIcon className="h-5 w-5" />
                        <span>Create Campaign</span>
                    </button>
                </div>
            }
        >
            <div className="space-y-6">

                <div className="min-h-[400px]">
                    {loading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4">
                                    <div className="flex justify-between items-start">
                                        <Skeleton width={120} height={20} variant="text" />
                                        <Skeleton width={60} height={20} variant="rounded" />
                                    </div>
                                    <div className="space-y-2">
                                        <Skeleton width="100%" height={8} variant="rounded" />
                                        <div className="flex justify-between">
                                            <Skeleton width={40} height={10} variant="text" />
                                            <Skeleton width={40} height={10} variant="text" />
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center pt-2">
                                        <Skeleton width={80} height={12} variant="text" />
                                        <div className="flex space-x-2">
                                            <Skeleton width={32} height={32} variant="circle" />
                                            <Skeleton width={32} height={32} variant="circle" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : filteredCampaigns.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-20 bg-white dark:bg-slate-800/30 rounded-[40px] border-2 border-dashed border-slate-100 dark:border-slate-800 shadow-inner">
                            <div className="w-24 h-24 bg-slate-50 dark:bg-slate-900 rounded-3xl flex items-center justify-center mb-8 border border-slate-100 dark:border-slate-800 shadow-sm">
                                <InboxIcon className="h-12 w-12 text-slate-300 dark:text-slate-600" />
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">No projects found</h3>
                            <p className="text-slate-500 dark:text-slate-400 mb-10 text-center max-w-md font-medium leading-relaxed">
                                {searchQuery
                                    ? `No campaigns match your search "${searchQuery}"`
                                    : activeTab === 'active'
                                        ? "You don't have any active projects at the moment."
                                        : "You don't have any archived projects."}
                            </p>
                            {!searchQuery && activeTab === 'active' && (
                                <button
                                    onClick={async () => {
                                        if (!user) return;
                                        const allowed = await checkAccess(user.id);
                                        if (!allowed) return;
                                        setIsCreateModalOpen(true);
                                    }}
                                    className="bg-primary hover:bg-primary-dark text-white font-black py-4 px-10 rounded-2xl transition-all duration-300 shadow-2xl shadow-primary/30 transform hover:scale-105 active:scale-95 uppercase tracking-wider text-sm"
                                >
                                    Get Started
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 stagger-children">
                            {filteredCampaigns.map((campaign) => (
                                <CampaignCard
                                    key={campaign.id}
                                    id={campaign.id}
                                    name={campaign.name}
                                    status={campaign.status}
                                    totalLeads={campaign.totalLeads}
                                    progress={campaign.progress}
                                    createdDate={campaign.createdDate}
                                    onView={(id) => navigate(`/campaigns/${id}`)}
                                    onDelete={handleDeleteCampaign}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <CreateCampaignModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSave={handleCreateCampaign}
            />

            {/* Upgrade Plan Modal */}
            <UpgradePlanModal reason={blockingReason} onClose={clearBlock} />
        </AppLayout>
    );
};

export default CampaignsPage;