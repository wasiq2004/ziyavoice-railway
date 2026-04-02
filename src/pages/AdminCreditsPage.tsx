import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import {
  CreditCardIcon,
  BanknotesIcon,
  ArrowTrendingUpIcon,
  PlusIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowPathIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { getWalletSummary, getWalletTransactions, addCredits } from '../utils/adminApi';

const AdminCreditsPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(true);
  const [showAddFund, setShowAddFund] = useState(false);
  const [fundUserId, setFundUserId] = useState('');
  const [fundAmount, setFundAmount] = useState('');
  const [fundDesc, setFundDesc] = useState('');
  const [processingFund, setProcessingFund] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [kpiData, setKpiData] = useState({ totalBalance: 0, totalDebited: 0, totalCredited: 0, totalUsers: 0 });
  const [transactions, setTransactions] = useState<any[]>([]);

  const getAdmin = () => {
    const raw = localStorage.getItem('ziya-user');
    return raw ? JSON.parse(raw) : null;
  };

  const fetchData = async () => {
    const admin = getAdmin();
    if (!admin) { navigate('/login'); return; }
    if (admin.role !== 'org_admin' && admin.role !== 'super_admin') { navigate('/login'); return; }

    const orgId = admin.role === 'org_admin' ? admin.organization_id : null;

    setLoading(true);
    try {
      const { summary } = await getWalletSummary(orgId);
      setKpiData({
        totalBalance: parseFloat(summary.totalBalance || '0'),
        totalDebited: parseFloat(summary.totalDebited || '0'),
        totalCredited: parseFloat(summary.totalCredited || '0'),
        totalUsers: summary.totalUsers || 0,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to fetch credit summary');
    } finally {
      setLoading(false);
    }

    setTxLoading(true);
    try {
      const { transactions: txns } = await getWalletTransactions(orgId);
      setTransactions(txns || []);
    } catch (err: any) {
      console.error('Transactions error:', err);
    } finally {
      setTxLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddFund = async () => {
    if (!fundUserId || !fundAmount || isNaN(Number(fundAmount)) || Number(fundAmount) <= 0) {
      setError('Please enter a valid User ID and credit amount.');
      return;
    }
    const admin = getAdmin();
    if (!admin) return;
    setProcessingFund(true);
    try {
      await addCredits(fundUserId.trim(), parseFloat(fundAmount), fundDesc || 'Admin credit allocation', admin.id);
      setSuccessMsg(`Successfully added ${fundAmount} credits to user ${fundUserId}`);
      setShowAddFund(false);
      setFundAmount('');
      setFundUserId('');
      setFundDesc('');
      setTimeout(() => setSuccessMsg(''), 4000);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to add credits');
    } finally {
      setProcessingFund(false);
    }
  };

  const filteredTxns = transactions.filter(t => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Purchased') return t.transaction_type === 'credit';
    if (activeFilter === 'Usage') return t.transaction_type === 'debit';
    return true;
  });

  const formatDate = (dateString: string) => dateString
    ? new Date(dateString).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  const formatCredits = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n || 0);

  return (
    <AppLayout
      breadcrumbs={[{ label: 'Admin', path: '/admin/dashboard' }, { label: 'Credit Management' }]}
      pageTitle="Credit Management"
      pageDescription="Monitor organization credit usage, view live transaction logs, and allocate credits to users."
      primaryAction={
        <div className="flex items-center gap-3">
          <button onClick={fetchData} className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
            <ArrowPathIcon className="w-4 h-4 mr-2" /> Refresh
          </button>
          <button
            onClick={() => setShowAddFund(true)}
            className="flex items-center px-5 py-2.5 bg-gradient-to-r from-primary to-emerald-500 text-white rounded-xl font-black text-sm shadow-xl shadow-emerald-500/20 hover:shadow-2xl hover:scale-105 transition-all"
          >
            <PlusIcon className="w-5 h-5 mr-2 stroke-2" />
            Assign Credits
          </button>
        </div>
      }
    >
      <div className="space-y-6 animate-in fade-in duration-500">

        {successMsg && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-800/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <PlusIcon className="w-5 h-5" />
            </div>
            <p className="text-emerald-800 dark:text-emerald-300 font-bold text-sm">{successMsg}</p>
          </div>
        )}
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl flex items-center gap-3 justify-between">
            <p className="text-red-700 dark:text-red-300 font-bold text-sm">{error}</p>
            <button onClick={() => setError('')}><XMarkIcon className="w-4 h-4 text-red-400" /></button>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Balance (All Users)', value: loading ? '—' : formatCredits(kpiData.totalBalance) + ' CR', icon: <BanknotesIcon className="w-3.5 h-3.5" />, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'hover:border-emerald-500/50' },
            { label: 'Total Credits Used', value: loading ? '—' : formatCredits(kpiData.totalDebited) + ' CR', icon: <ArrowTrendingUpIcon className="w-3.5 h-3.5" />, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'hover:border-amber-500/50' },
            { label: 'Total Credits Assigned', value: loading ? '—' : formatCredits(kpiData.totalCredited) + ' CR', icon: <CreditCardIcon className="w-3.5 h-3.5" />, color: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'hover:border-indigo-500/50' },
            { label: 'Total Users', value: loading ? '—' : kpiData.totalUsers.toString(), icon: <ArrowTrendingUpIcon className="w-3.5 h-3.5" />, color: 'text-primary', bg: 'bg-primary/10', border: 'hover:border-primary/50' },
          ].map((kpi, i) => (
            <div key={i} className={`bg-white dark:bg-slate-800/50 rounded-[1.5rem] p-4 border border-slate-200 dark:border-slate-700/50 shadow-sm relative overflow-hidden group ${kpi.border} transition-colors`}>
              <div className="flex items-center gap-2 mb-1">
                <div className={`h-6 w-6 rounded-lg ${kpi.bg} flex items-center justify-center ${kpi.color}`}>
                  {kpi.icon}
                </div>
                <h3 className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{kpi.label}</h3>
              </div>
              <p className={`text-xl font-extrabold mt-1 ${loading ? 'text-slate-300 dark:text-slate-600 animate-pulse' : 'text-slate-900 dark:text-white'}`}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Transactions Table */}
        <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <CreditCardIcon className="w-5 h-5 text-primary" />
              Live Transaction Log
            </h2>
            <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-900 rounded-xl">
              {['All', 'Purchased', 'Usage'].map(filter => (
                <button key={filter} onClick={() => setActiveFilter(filter)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeFilter === filter ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                  {filter === 'Purchased' ? 'Credits In' : filter === 'Usage' ? 'Credits Out' : 'All'}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-900/50">
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date & Time</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">User</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Amount (Credits)</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Balance After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {txLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={6} className="px-6 py-4"><div className="h-8 bg-slate-100 dark:bg-slate-900 rounded-xl" /></td>
                    </tr>
                  ))
                ) : filteredTxns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-bold">No transactions found.</td>
                  </tr>
                ) : filteredTxns.map((txn) => (
                  <tr key={txn.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-600 dark:text-slate-300">
                      {formatDate(txn.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-xs font-bold text-slate-800 dark:text-white">{txn.username || '—'}</div>
                      <div className="text-[10px] text-slate-400">{txn.email || ''}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-widest border ${
                        txn.transaction_type === 'credit'
                          ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                          : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                      }`}>
                        {txn.transaction_type === 'credit' ? <ArrowUpIcon className="w-3 h-3 mr-1" /> : <ArrowDownIcon className="w-3 h-3 mr-1" />}
                        {txn.transaction_type === 'credit' ? 'Credit In' : 'Credit Out'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-500 dark:text-slate-400 max-w-[200px] truncate">
                      {txn.description || txn.service_type || '—'}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-black ${txn.transaction_type === 'credit' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>
                      {txn.transaction_type === 'credit' ? '+' : '-'}{formatCredits(parseFloat(txn.amount || '0'))}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-slate-600 dark:text-slate-300">
                      {formatCredits(parseFloat(txn.balance_after || '0'))} CR
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Assign Credits Modal */}
      {showAddFund && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-8 w-full max-w-sm mx-4 border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-100 dark:bg-emerald-900/50 p-2 rounded-xl text-emerald-600 dark:text-emerald-400">
                  <BanknotesIcon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">Assign Credits</h3>
              </div>
              <button onClick={() => setShowAddFund(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">User ID</label>
                <input type="text" value={fundUserId} onChange={(e) => setFundUserId(e.target.value)}
                  placeholder="Paste User ID here..."
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-sm text-slate-900 dark:text-white transition-all" />
                <p className="text-[10px] text-slate-400 mt-1">Copy from the Customers page → View Details → System Identifier</p>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Amount (Credits)</label>
                <input type="number" min="1" step="1" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-900 dark:text-white placeholder-slate-400 transition-all text-lg" />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Note (Optional)</label>
                <input type="text" value={fundDesc} onChange={(e) => setFundDesc(e.target.value)}
                  placeholder="Reason for allocation..."
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-sm text-slate-900 dark:text-white transition-all" />
              </div>
            </div>

            <button onClick={handleAddFund} disabled={processingFund || !fundAmount || !fundUserId}
              className="w-full mt-6 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-black shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0">
              {processingFund ? 'Assigning...' : 'Assign Credits'}
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default AdminCreditsPage;
