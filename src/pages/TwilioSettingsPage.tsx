import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../utils/api';
// Ensure getApiPath is available
const { getApiPath } = api;
import { twilioNumberService } from '../services/twilioNumberService';
import AppLayout from '../components/AppLayout';
import {
  PhoneIcon,
  PlusIcon,
  TrashIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  GlobeAltIcon,
  InformationCircleIcon,
  ClipboardDocumentIcon,
  ArrowPathIcon,
  ServerIcon,
  CommandLineIcon,
  ShieldCheckIcon,
  BoltIcon
} from '@heroicons/react/24/outline';

interface TwilioConfig {
  appUrl: string;
  accountSid?: string;
  authToken?: string;
  apiKeySid?: string;
  apiKeySecret?: string;
}

interface TwilioAccount {
  id: string;
  name: string;
  accountSid: string;
  authToken: string;
  createdAt: string;
}

interface TwilioAccountNumber {
  phoneNumber: string;
  friendlyName: string;
  sid: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
}

const TwilioSettingsPage: React.FC = () => {
  const { user } = useAuth();
  const [config, setConfig] = useState<TwilioConfig>({
    appUrl: '',
  });
  const [twilioAccounts, setTwilioAccounts] = useState<TwilioAccount[]>([]);
  const [newAccount, setNewAccount] = useState({
    name: '',
    accountSid: '',
    authToken: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [selectedAccountForNumbers, setSelectedAccountForNumbers] = useState<TwilioAccount | null>(null);
  const [accountNumbers, setAccountNumbers] = useState<TwilioAccountNumber[]>([]);
  const [fetchingNumbers, setFetchingNumbers] = useState(false);
  const [addingNumber, setAddingNumber] = useState(false);
  const [selectedNumberToAdd, setSelectedNumberToAdd] = useState<string>('');

  useEffect(() => {
    loadConfig();
    loadTwilioAccounts();
  }, [user?.id]);

  const loadConfig = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const response = await fetch(`${api.getApiBaseUrl()}${getApiPath()}/twilio/config?userId=${user.id}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setConfig(data.data || { appUrl: '' });
        }
      }
    } catch (err) {
      console.error('Error loading config:', err);
      setMessage('Failed to load Twilio settings');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const loadTwilioAccounts = async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(`${api.getApiBaseUrl()}${getApiPath()}/twilio/accounts?userId=${user.id}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setTwilioAccounts(data.data || []);
        }
      }
    } catch (err) {
      console.error('Error loading Twilio accounts:', err);
    }
  };

  const handleSaveConfig = async () => {
    if (!user?.id || !config.appUrl.trim()) {
      setMessage('Please enter a valid webhook URL');
      setMessageType('error');
      return;
    }

    // Validate URL format
    try {
      new URL(config.appUrl);
    } catch {
      setMessage('Invalid URL format. Must start with http:// or https://');
      setMessageType('error');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${api.getApiBaseUrl()}${getApiPath()}/twilio/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          appUrl: config.appUrl,
          apiKeySid: config.apiKeySid || undefined,
          apiKeySecret: config.apiKeySecret || undefined,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setMessage('Webhook URL saved successfully!');
        setMessageType('success');
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage(data.message || 'Failed to save config');
        setMessageType('error');
      }
    } catch (err) {
      setMessage('Error saving configuration');
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddAccount = async () => {
    if (!user?.id || !newAccount.name || !newAccount.accountSid || !newAccount.authToken) {
      setMessage('Please fill in all account details');
      setMessageType('error');
      return;
    }

    if (!newAccount.accountSid.startsWith('AC')) {
      setMessage('Account SID should start with "AC"');
      setMessageType('error');
      return;
    }

    setSaving(true);
    try {
      // First validate the credentials
      const validateResponse = await fetch(`${api.getApiBaseUrl()}${getApiPath()}/validate-twilio-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountSid: newAccount.accountSid,
          authToken: newAccount.authToken,
        }),
      });

      if (!validateResponse.ok) {
        const errorData = await validateResponse.json();
        throw new Error(errorData.message || 'Invalid Twilio credentials');
      }

      // Save the account
      const response = await fetch(`${api.getApiBaseUrl()}${getApiPath()}/twilio/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          name: newAccount.name,
          accountSid: newAccount.accountSid,
          authToken: newAccount.authToken,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setMessage('Twilio account added successfully!');
        setMessageType('success');
        setNewAccount({ name: '', accountSid: '', authToken: '' });
        setShowAddAccount(false);
        loadTwilioAccounts();
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage(data.message || 'Failed to add account');
        setMessageType('error');
      }
    } catch (err) {
      setMessage('Error adding account: ' + (err as Error).message);
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!user?.id) return;

    if (!window.confirm('Are you sure you want to remove this Twilio account?')) {
      return;
    }

    try {
      const response = await fetch(`${api.getApiBaseUrl()}${getApiPath()}/twilio/accounts/${accountId}?userId=${user.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (data.success) {
        setMessage('Twilio account removed successfully!');
        setMessageType('success');
        loadTwilioAccounts();
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage(data.message || 'Failed to remove account');
        setMessageType('error');
      }
    } catch (err) {
      setMessage('Error removing account');
      setMessageType('error');
    }
  };

  const handleTestAccount = async (account: TwilioAccount) => {
    try {
      const response = await fetch(`${api.getApiBaseUrl()}${getApiPath()}/validate-twilio-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountSid: account.accountSid,
          authToken: account.authToken,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setMessage('Twilio credentials are valid!');
        setMessageType('success');
      } else {
        setMessage(data.message || 'Invalid Twilio credentials');
        setMessageType('error');
      }
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage('Error testing credentials');
      setMessageType('error');
    }
  };

  const handleFetchAccountNumbers = async (account: TwilioAccount) => {
    if (!user?.id) return;

    setFetchingNumbers(true);
    setSelectedAccountForNumbers(account);
    try {
      const numbers = await twilioNumberService.fetchAccountNumbers(user.id, account.accountSid);
      setAccountNumbers(numbers);
      setMessage('Fetched phone numbers successfully!');
      setMessageType('success');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage('Error fetching phone numbers: ' + (err as Error).message);
      setMessageType('error');
    } finally {
      setFetchingNumbers(false);
    }
  };

  const handleAddPhoneNumber = async () => {
    if (!user?.id || !selectedAccountForNumbers || !selectedNumberToAdd) {
      setMessage('Please select a phone number to add');
      setMessageType('error');
      return;
    }

    setAddingNumber(true);
    try {
      // Find the selected number details
      const selectedNumber = accountNumbers.find(num => num.phoneNumber === selectedNumberToAdd);
      if (!selectedNumber) {
        throw new Error('Selected phone number not found');
      }

      // Add the Twilio number from user's account (auto-verified)
      await twilioNumberService.addAccountNumber(
        user.id,
        selectedAccountForNumbers.accountSid,
        selectedNumber.phoneNumber,
        'us-west' // Default region, could be improved
      );

      setMessage('Phone number added successfully!');
      setMessageType('success');
      setSelectedNumberToAdd('');

      // Refresh the account numbers list
      await handleFetchAccountNumbers(selectedAccountForNumbers);

      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage('Error adding phone number: ' + (err as Error).message);
      setMessageType('error');
    } finally {
      setAddingNumber(false);
    }
  };

  if (loading) {
    return (
      <AppLayout
        breadcrumbs={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Twilio Settings' }]}
        pageTitle="Twilio Settings"
        pageDescription="Configure your Twilio accounts and webhook settings"
      >
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      breadcrumbs={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Twilio Settings' }]}
      pageTitle="Twilio Settings"
      pageDescription="Configure your Twilio accounts and webhook settings"
    >
      <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto">

        {message && (
          <div className={`rounded-xl p-4 flex items-center border ${messageType === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
              : 'bg-red-50 text-red-700 border-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800'
            }`}>
            {messageType === 'success' ? <CheckCircleIcon className="h-5 w-5 mr-3" /> : <ExclamationCircleIcon className="h-5 w-5 mr-3" />}
            <span className="font-medium">{message}</span>
          </div>
        )}

        {/* Twilio Accounts Section */}
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden card-animate">
          <div className="p-8 border-b border-slate-100 dark:border-slate-800/50 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/20">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <PhoneIcon className="h-5 w-5 text-primary" />
                Twilio Accounts
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage credentials for your Twilio integration.</p>
            </div>
            <button
              onClick={() => setShowAddAccount(!showAddAccount)}
              className="flex items-center space-x-2 bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-xl font-bold transition-all shadow-lg shadow-primary/20 text-sm"
            >
              <PlusIcon className="h-4 w-4" />
              <span>{showAddAccount ? 'Cancel' : 'Add Account'}</span>
            </button>
          </div>

          <div className="p-8">
            {/* Add Account Form */}
            {showAddAccount && (
              <div className="mb-8 bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4">New Account Credentials</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Friendly Name</label>
                    <input
                      type="text"
                      value={newAccount.name}
                      onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                      placeholder="e.g. My Primary Account"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Account SID</label>
                    <input
                      type="text"
                      value={newAccount.accountSid}
                      onChange={(e) => setNewAccount({ ...newAccount, accountSid: e.target.value })}
                      placeholder="AC..."
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/50 outline-none font-mono"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Auth Token</label>
                    <input
                      type="password"
                      value={newAccount.authToken}
                      onChange={(e) => setNewAccount({ ...newAccount, authToken: e.target.value })}
                      placeholder="••••••••••••••••••••••••"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/50 outline-none font-mono"
                    />
                  </div>
                </div>
                <div className="flex justify-end mt-6 gap-3">
                  <button
                    onClick={() => setShowAddAccount(false)}
                    className="px-4 py-2 text-slate-500 hover:text-slate-700 font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddAccount}
                    disabled={saving}
                    className="px-6 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl font-bold shadow-xl shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Validating...' : 'Connect Account'}
                  </button>
                </div>
              </div>
            )}

            {twilioAccounts.length > 0 ? (
              <div className="space-y-4">
                {twilioAccounts.map((account) => (
                  <div key={account.id} className={`rounded-2xl border transition-all duration-300 ${selectedAccountForNumbers?.id === account.id ? 'border-primary ring-1 ring-primary/20 bg-primary/5' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 hover:border-primary/30'}`}>
                    <div className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500">
                          <ServerIcon className="h-6 w-6" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 dark:text-white text-lg">{account.name}</h3>
                          <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400 mt-1">
                            <span className="font-mono bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded text-xs">
                              {account.accountSid.substring(0, 8)}...{account.accountSid.substring(account.accountSid.length - 4)}
                            </span>
                            <span>Added {new Date(account.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full md:w-auto">
                        <button
                          onClick={() => handleFetchAccountNumbers(account)}
                          className={`flex-1 md:flex-none px-4 py-2 rounded-xl text-sm font-bold border transition-all ${selectedAccountForNumbers?.id === account.id ? 'bg-primary text-white border-primary' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                        >
                          {selectedAccountForNumbers?.id === account.id ? 'Viewing Numbers' : 'View Numbers'}
                        </button>
                        <button
                          onClick={() => handleTestAccount(account)}
                          className="p-2 text-slate-400 hover:text-primary transition-colors bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-primary/10"
                          title="Test Connection"
                        >
                          <BoltIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteAccount(account.id)}
                          className="p-2 text-slate-400 hover:text-red-500 transition-colors bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Remove Account"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Phone Numbers Section */}
                    {selectedAccountForNumbers?.id === account.id && (
                      <div className="border-t border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-900/30 p-6 rounded-b-2xl animate-in slide-in-from-top-2">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Available Numbers</h4>

                        {fetchingNumbers ? (
                          <div className="flex justify-center py-6">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
                          </div>
                        ) : accountNumbers.length > 0 ? (
                          <div className="space-y-4">
                            <div className="flex gap-3">
                              <select
                                value={selectedNumberToAdd}
                                onChange={(e) => setSelectedNumberToAdd(e.target.value)}
                                className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                              >
                                <option value="">Select a number to import...</option>
                                {accountNumbers.map((num) => (
                                  <option key={num.sid} value={num.phoneNumber}>
                                    {num.phoneNumber} {num.friendlyName ? `(${num.friendlyName})` : ''}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={handleAddPhoneNumber}
                                disabled={addingNumber || !selectedNumberToAdd}
                                className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
                              >
                                {addingNumber ? 'Importing...' : 'Import Number'}
                              </button>
                            </div>

                            <div className="max-h-60 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800">
                              <table className="w-full text-sm">
                                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Number</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Name</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Capabilities</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                  {accountNumbers.map((num) => (
                                    <tr key={num.sid} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                      <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">{num.phoneNumber}</td>
                                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{num.friendlyName || '-'}</td>
                                      <td className="px-4 py-3">
                                        <div className="flex gap-1">
                                          {num.capabilities.voice && <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-[10px] font-bold">Voice</span>}
                                          {num.capabilities.sms && <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-[10px] font-bold">SMS</span>}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-6 text-slate-400 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                            <p className="text-sm">No phone numbers found in this account.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-slate-50 dark:bg-slate-900/20 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                  <ServerIcon className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-1">No Accounts Connected</h3>
                <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-sm mx-auto">Connect your Twilio account to start managing phone numbers and making calls.</p>
                <button
                  onClick={() => setShowAddAccount(true)}
                  className="bg-primary text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all"
                >
                  Connect First Account
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Webhook Configuration */}
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden card-animate">
          <div className="p-8 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/20">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <GlobeAltIcon className="h-5 w-5 text-primary" />
              Webhook Configuration
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Configure where Twilio sends callbacks for call status and events.</p>
          </div>

          <div className="p-8">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-2xl p-4 mb-6 flex items-start gap-3">
              <InformationCircleIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
                <strong>Why this matters:</strong> This URL allows ZIYA VOICE to receive real-time updates about calls (answers, hangups, recordings). Without this, call status tracking will not work.
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Webhook URL</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className={`h-2.5 w-2.5 rounded-full ${config.appUrl ? 'bg-green-500' : 'bg-slate-300'}`}></span>
                      </div>
                      <input
                        type="text"
                        value={config.appUrl}
                        onChange={(e) => setConfig({ ...config, appUrl: e.target.value })}
                        placeholder="https://your-domain.com"
                        className="w-full pl-8 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/50 outline-none font-mono"
                      />
                    </div>
                    <button
                      onClick={handleSaveConfig}
                      disabled={saving}
                      className="bg-primary hover:bg-primary-dark text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-xl shadow-primary/20 transition-all disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">Enter the base URL of your application (e.g. <span className="font-mono">https://api.ziyavoice.com</span>)</p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 flex flex-col justify-center">
                  <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Current Status</h4>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${config.appUrl ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                      {config.appUrl ? 'Configured' : 'Not Set'}
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-1">
                    {config.appUrl ? config.appUrl : 'No URL defined'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Information Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <CommandLineIcon className="h-5 w-5 text-slate-400" />
              Setup Guide
            </h3>
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                  Local Development
                </h4>
                <ol className="list-decimal list-inside text-sm text-slate-600 dark:text-slate-400 space-y-1">
                  <li>Run <code className="bg-white dark:bg-slate-800 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700">ngrok http 3000</code></li>
                  <li>Copy the HTTPS URL from ngrok</li>
                  <li>Paste into Webhook URL above</li>
                </ol>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Production
                </h4>
                <ol className="list-decimal list-inside text-sm text-slate-600 dark:text-slate-400 space-y-1">
                  <li>Deploy your application</li>
                  <li>Copy your production domain</li>
                  <li>Paste into Webhook URL above</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <ShieldCheckIcon className="h-5 w-5 text-slate-400" />
              Troubleshooting
            </h3>
            <div className="space-y-3">
              <details className="group">
                <summary className="flex justify-between items-center font-medium cursor-pointer list-none text-sm text-slate-700 dark:text-slate-300">
                  <span>Callbacks not received?</span>
                  <span className="transition group-open:rotate-180">
                    <svg fill="none" height="24" shapeRendering="geometricPrecision" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24"><path d="M6 9l6 6 6-6"></path></svg>
                  </span>
                </summary>
                <p className="text-xs text-slate-500 mt-2 pl-4 border-l-2 border-slate-200 dark:border-slate-700">
                  Ensure your URL is publicly accessible. If using ngrok, the URL changes every time you restart unless you have a paid plan.
                </p>
              </details>
              <details className="group">
                <summary className="flex justify-between items-center font-medium cursor-pointer list-none text-sm text-slate-700 dark:text-slate-300">
                  <span>Status not updating?</span>
                  <span className="transition group-open:rotate-180">
                    <svg fill="none" height="24" shapeRendering="geometricPrecision" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24"><path d="M6 9l6 6 6-6"></path></svg>
                  </span>
                </summary>
                <p className="text-xs text-slate-500 mt-2 pl-4 border-l-2 border-slate-200 dark:border-slate-700">
                  Check server logs to see if the webhook endpoint is returning a 200 OK status.
                </p>
              </details>
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Endpoint Info</h4>
                <code className="block bg-slate-50 dark:bg-slate-900 p-3 rounded-xl text-xs font-mono text-slate-600 dark:text-slate-400 break-all">
                  POST {config.appUrl}/api/twilio/webhook
                </code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default TwilioSettingsPage;