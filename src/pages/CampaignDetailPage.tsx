import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  PlayIcon,
  StopIcon,
  ChevronLeftIcon,
  PhoneIcon,
  UserCircleIcon
} from '@heroicons/react/24/outline';
import AppLayout from '../components/AppLayout';
import KPICard from '../components/KPICard';
import LeadsTable from '../components/LeadsTable';
import AddLeadModal from '../components/AddLeadModal';
import ImportLeadsModal from '../components/ImportLeadsModal';
import { fetchCampaign, startCampaign, stopCampaign, deleteRecord, addRecord, getApiBaseUrl, getApiPath, importCSV, setCallerPhone, updateCampaign } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const CampaignDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [campaign, setCampaign] = useState<any>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Helper: map raw DB records to lead objects
  const mapRecords = (records: any[]) =>
    records.map((r: any) => ({
      id: r.id,
      name: r.name,
      phone: r.phone_number || r.phone,
      email: r.email || '',
      status: r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : 'Pending',
      attempts: r.attempts || 0,
      intent: r.intent || null,
      schedule_time: r.schedule_time || null,
    }));

  // Load campaign + agents + phone numbers
  useEffect(() => {
    const loadData = async () => {
      if (!id || !user?.id) return;
      try {
        setLoading(true);
        const apiUrl = getApiBaseUrl();

        // Parallel fetch: campaign + agents + phone numbers
        const [campaignRes, agentsRes, phoneRes] = await Promise.all([
          fetchCampaign(id, user.id),
          fetch(`${apiUrl}${getApiPath()}/agents?userId=${user.id}`),
          fetch(`${apiUrl}${getApiPath()}/phone-numbers?userId=${user.id}`),
        ]);

        // Campaign
        if (campaignRes.success && campaignRes.data) {
          setCampaign(campaignRes.data.campaign);
          setLeads(mapRecords(campaignRes.data.records || []));
        }

        // Agents — handle both {agents:[]} and legacy {data:[]}
        if (agentsRes.ok) {
          const agentsData = await agentsRes.json();
          const agentList = agentsData.agents || agentsData.data || [];
          if (agentsData.success && Array.isArray(agentList)) {
            setAgents(agentList);
          }
        }

        // Phone numbers — handle both {phoneNumbers:[]} and legacy {data:[]}
        if (phoneRes.ok) {
          const phoneData = await phoneRes.json();
          const phoneList = phoneData.phoneNumbers || phoneData.data || [];
          if (phoneData.success && Array.isArray(phoneList)) {
            setPhoneNumbers(phoneList);
          }
        }

      } catch (error) {
        console.error('Error loading campaign details:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id, user?.id]);

  // Live polling: refresh leads every 5 seconds when campaign is running
  useEffect(() => {
    const startPolling = () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = setInterval(async () => {
        if (!id || !user?.id) return;
        try {
          const refreshResponse = await fetchCampaign(id, user.id);
          if (refreshResponse.success && refreshResponse.data) {
            setCampaign(refreshResponse.data.campaign);
            setLeads(mapRecords(refreshResponse.data.records || []));
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 5000);
    };

    const stopPolling = () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };

    if (campaign?.status === 'running') {
      startPolling();
    } else {
      stopPolling();
    }

    return () => stopPolling();
  }, [campaign?.status, id, user?.id]);

  const handleAgentChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!id || !user?.id) return;
    const newAgentId = e.target.value;
    try {
      await updateCampaign(id, user.id, { agent_id: newAgentId });
      setCampaign({ ...campaign, agent_id: newAgentId });
    } catch (error) {
      console.error('Failed to update agent:', error);
      alert('Failed to update assigned agent');
    }
  };

  const handlePhoneNumberChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!id || !user?.id) return;
    const newPhoneNumberId = e.target.value;
    try {
      const selectedPhone = phoneNumbers.find((pn: any) => pn.id === newPhoneNumberId);
      const resolvedAgentId =
        selectedPhone?.agent_id ||
        selectedPhone?.agentId ||
        campaign.agent_id ||
        '';

      const response = await setCallerPhone(
        id,
        user.id,
        newPhoneNumberId,
        resolvedAgentId || undefined
      );

      const updatedCampaign = response?.campaign || response?.data || null;
      if (updatedCampaign) {
        setCampaign(updatedCampaign);
      } else {
        setCampaign({
          ...campaign,
          phone_number_id: newPhoneNumberId,
          agent_id: resolvedAgentId || campaign.agent_id,
        });
      }
    } catch (error) {
      console.error('Failed to update phone number:', error);
      alert('Failed to update assigned phone number');
    }
  };

  const handleToggleCampaign = async () => {
    if (!id || !user?.id || !campaign) return;
    try {
      setIsProcessing(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      
      const isRunning = campaign.status === 'running';
      const actionLabel = isRunning ? 'stopped' : 'started';

      try {
        const response = isRunning
          ? await stopCampaign(id, user.id)
          : await startCampaign(id, user.id);

        if (response.success) {
          setSuccessMessage(`Campaign ${actionLabel} successfully!`);
          
          // Refresh data immediately
          const refreshResponse = await fetchCampaign(id, user.id);
          if (refreshResponse.success && refreshResponse.data) {
            setCampaign(refreshResponse.data.campaign);
            setLeads(mapRecords(refreshResponse.data.records || []));
          }
          
          // Clear success message after 3 seconds
          setTimeout(() => setSuccessMessage(null), 3000);
        } else {
          const errorMsg = response.message || `Failed to ${isRunning ? 'stop' : 'start'} campaign`;
          setErrorMessage(errorMsg);
        }
      } catch (error: any) {
        // Extract user-friendly error message
        const errorMsg = error.message || `Failed to ${isRunning ? 'stop' : 'start'} campaign`;
        setErrorMessage(errorMsg);
        console.error('Campaign operation error:', error);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddLead = async (data: any) => {
    if (!id || !user?.id) return;
    try {
      const response = await addRecord(id, user.id, data.phone, data.name, data.email);
      if (response.success) {
        const refreshResponse = await fetchCampaign(id, user.id);
        if (refreshResponse.success && refreshResponse.data) {
          setLeads(mapRecords(refreshResponse.data.records || []));
        }
        setIsAddLeadModalOpen(false);
      }
    } catch (error) {
      console.error('Error adding lead:', error);
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!id || !user?.id) return;
    if (window.confirm('Delete this lead?')) {
      try {
        const response = await deleteRecord(id, leadId, user.id);
        if (response.success) {
          setLeads(leads.filter(l => l.id !== leadId));
        }
      } catch (error) {
        console.error('Error deleting lead:', error);
      }
    }
  };

  const handleImportLeads = async (file: File) => {
    if (!id || !user?.id) return;
    try {
      const text = await file.text();
      const response = await importCSV(id, user.id, text);
      if (response.success) {
        alert(`Successfully imported ${response.count} leads.`);
        setIsImportModalOpen(false);
        const refreshResponse = await fetchCampaign(id, user.id);
        if (refreshResponse.success && refreshResponse.data) {
          setLeads(mapRecords(refreshResponse.data.records || []));
        }
      } else {
        alert('Import failed. Please try again.');
      }
    } catch (error: any) {
      console.error('Error importing leads:', error);
      alert('Failed to import leads. Please try again.');
    }
  };

  const handleExport = () => {
    if (!id || !user?.id) return;
    window.location.href = `${getApiBaseUrl()}${getApiPath()}/campaigns/${id}/export?userId=${user.id}`;
  };

  if (loading) {
    return (
      <AppLayout
        breadcrumbs={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Projects', path: '/campaigns' },
          { label: 'Loading...' }
        ]}
        pageTitle="Loading..."
      >
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  if (!campaign) {
    return (
      <AppLayout
        breadcrumbs={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Projects', path: '/campaigns' },
          { label: 'Not Found' }
        ]}
        pageTitle="Project Not Found"
      >
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold">Campaign not found</h2>
          <button onClick={() => navigate('/campaigns')} className="mt-4 text-primary font-bold">
            Back to Campaigns
          </button>
        </div>
      </AppLayout>
    );
  }

  // Compute stats from live leads data
  const rejectedCount = leads.filter(l => l.status.toLowerCase() === 'rejected').length;
  const oneOnOneCount = leads.filter(l => l.intent === '1_on_1_session_requested').length;

  const campaignStats = {
    total: campaign.total_contacts || 0,
    completed: campaign.completed_calls || 0,
    failed: campaign.failed_calls || 0,
    pending: Math.max(0, (campaign.total_contacts || 0) - (campaign.completed_calls || 0) - (campaign.failed_calls || 0)),
    successful: campaign.successful_calls || 0,
    rejected: campaign.rejected_count ?? rejectedCount,
    oneOnOne: campaign.one_on_one_count ?? oneOnOneCount,
  };

  const isRunning = campaign.status === 'running';

  const actionButtons = (
    <div className="flex flex-col items-end gap-3">
      <div className="flex items-center space-x-3">
        <button
          onClick={() => navigate('/campaigns')}
          className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all font-bold group"
        >
          <ChevronLeftIcon className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
        </button>
        <button
          disabled={isProcessing}
          onClick={handleToggleCampaign}
          className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl font-black transition-all shadow-lg uppercase tracking-wider text-xs ${isRunning
            ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/25 disabled:bg-red-400 disabled:hover:bg-red-400'
            : 'bg-green-500 hover:bg-green-600 text-white shadow-green-500/25 disabled:bg-green-400 disabled:hover:bg-green-400'
            } ${isProcessing ? 'opacity-75 cursor-not-allowed' : ''}`}
        >
          {isProcessing ? (
            <>
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>{isRunning ? 'Stopping...' : 'Starting...'}</span>
            </>
          ) : (
            <>
              {isRunning ? (
                <>
                  <StopIcon className="h-4 w-4" />
                  <span>Stop Campaign</span>
                </>
              ) : (
                <>
                  <PlayIcon className="h-4 w-4" />
                  <span>Start Campaign</span>
                </>
              )}
            </>
          )}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${isRunning ? 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-900/50' : 'bg-slate-50 dark:bg-slate-900/20 border-slate-100 dark:border-slate-800'}`}>
          <div className={`w-1 h-1 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`}></div>
          <span className="text-[8px] uppercase font-black text-slate-500 dark:text-slate-400 tracking-wider">
            {campaign.status || 'Draft'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/50 rounded-lg">
          <div className="w-1 h-1 rounded-full bg-green-500"></div>
          <span className="text-[8px] uppercase font-black text-slate-500 dark:text-slate-400 tracking-wider">Active</span>
          <span className="text-xs font-black text-green-600 dark:text-green-400">{campaignStats.successful}</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/50 rounded-lg">
          <div className="w-1 h-1 rounded-full bg-red-500"></div>
          <span className="text-[8px] uppercase font-black text-slate-500 dark:text-slate-400 tracking-wider">Failed</span>
          <span className="text-xs font-black text-red-600 dark:text-red-400">{campaignStats.failed}</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/50 rounded-lg">
          <div className="w-1 h-1 rounded-full bg-amber-500"></div>
          <span className="text-[8px] uppercase font-black text-slate-500 dark:text-slate-400 tracking-wider">Rejected</span>
          <span className="text-xs font-black text-amber-600 dark:text-amber-400">{campaignStats.rejected}</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/50 rounded-lg">
          <div className="w-1 h-1 rounded-full bg-blue-500"></div>
          <span className="text-[8px] uppercase font-black text-slate-500 dark:text-slate-400 tracking-wider">1-to-1</span>
          <span className="text-xs font-black text-blue-600 dark:text-blue-400">{campaignStats.oneOnOne}</span>
        </div>
      </div>
    </div>
  );

  return (
    <AppLayout
      breadcrumbs={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Projects', path: '/campaigns' },
        { label: campaign.name }
      ]}
      pageTitle={campaign.name}
      pageDescription="Monitor real-time performance and lead outreach"
      primaryAction={actionButtons}
    >
      <div className="py-6 space-y-8">
        {/* Error Message Alert */}
        {errorMessage && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-lg p-4 flex items-start gap-3">
            <div className="text-red-600 dark:text-red-400 mt-0.5">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-red-900 dark:text-red-200">Error</h3>
              <p className="text-red-800 dark:text-red-300 text-sm">{errorMessage}</p>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}

        {/* Success Message Alert */}
        {successMessage && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/50 rounded-lg p-4 flex items-start gap-3">
            <div className="text-green-600 dark:text-green-400 mt-0.5">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-green-800 dark:text-green-300 text-sm font-medium">{successMessage}</p>
            </div>
          </div>
        )}
        {/* Configuration Section */}
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 mb-6">
          <h3 className="text-lg font-black text-slate-900 dark:text-white mb-4">Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
            {/* Agent Dropdown */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                <UserCircleIcon className="w-4 h-4" />
                Assigned Agent
              </label>
              <div className="relative">
                <select
                  value={campaign.agent_id || ''}
                  onChange={handleAgentChange}
                  className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all cursor-pointer"
                >
                  <option value="">Select an Agent</option>
                  {Array.isArray(agents) && agents.map((agent: any) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Phone Number Dropdown */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                <PhoneIcon className="w-4 h-4" />
                Caller Phone Number
              </label>
              <div className="relative">
                <select
                  value={campaign.phone_number_id || ''}
                  onChange={handlePhoneNumberChange}
                  className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all cursor-pointer"
                >
                  <option value="">Select a Phone Number</option>
                  {Array.isArray(phoneNumbers) && phoneNumbers.map((pn: any) => (
                    <option key={pn.id} value={pn.id}>
                      {pn.phone_number}
                      {pn.region ? ` (${pn.region.toUpperCase()})` : ''}
                      {!pn.verified ? ' — ⚠ unverified' : ''}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </div>
              {phoneNumbers.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 font-medium">
                  No phone numbers found. Add one in Settings → Twilio.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* KPI Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Active" value={campaignStats.successful} color="green" />
          <KPICard title="Failed" value={campaignStats.failed} color="red" />
          <KPICard title="Rejected" value={campaignStats.rejected} color="gray" />
          <KPICard title="1 to 1 Scheduled" value={campaignStats.oneOnOne} color="blue" />
        </div>

        {/* Leads Table Section */}
        <LeadsTable
          leads={leads}
          onAddLead={() => setIsAddLeadModalOpen(true)}
          onImportLeads={() => setIsImportModalOpen(true)}
          onExport={handleExport}
          onEditLead={(lead) => console.log('Edit', lead)}
          onDeleteLead={handleDeleteLead}
          stats={{
            completed: campaignStats.completed,
            failed: campaignStats.failed,
            inProgress: 0,
            pending: campaignStats.pending
          }}
        />
      </div>

      <AddLeadModal
        isOpen={isAddLeadModalOpen}
        onClose={() => setIsAddLeadModalOpen(false)}
        onSave={handleAddLead}
      />
      <ImportLeadsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleImportLeads}
      />
    </AppLayout>
  );
};

export default CampaignDetailPage;
