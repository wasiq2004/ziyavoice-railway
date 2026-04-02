import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import {
    CircleStackIcon,
    PlusIcon,
    PencilIcon,
    TrashIcon,
    ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { listPlans, createPlan, updatePlan, deletePlan } from '../utils/adminApi';

const SuperAdminPlansPage: React.FC = () => {
    const navigate = useNavigate();
    const [plans, setPlans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editPlan, setEditPlan] = useState<any | null>(null);
    const [form, setForm] = useState({ plan_name: '', credit_limit: '', validity_days: '', plan_type: '' });
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);

    const userStr = localStorage.getItem('ziya-user');
    const currentUser = userStr ? JSON.parse(userStr) : null;

    useEffect(() => {
        if (!currentUser || currentUser.role !== 'super_admin') { navigate('/login'); return; }
        fetchPlans();
    }, [navigate]);

    const fetchPlans = async () => {
        setLoading(true);
        try {
            const data = await listPlans();
            setPlans(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const openCreate = () => {
        setEditPlan(null);
        setForm({ plan_name: '', credit_limit: '', validity_days: '', plan_type: '' });
        setFormError('');
        setShowModal(true);
    };

    const openEdit = (plan: any) => {
        setEditPlan(plan);
        setForm({
            plan_name: plan.plan_name,
            credit_limit: String(plan.credit_limit),
            validity_days: String(plan.validity_days),
            plan_type: plan.plan_type || '',
        });
        setFormError('');
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.plan_name || !form.credit_limit || !form.validity_days) {
            setFormError('Plan name, credit limit, and validity days are required');
            return;
        }
        setSaving(true);
        setFormError('');
        try {
            const payload = {
                plan_name: form.plan_name,
                credit_limit: parseFloat(form.credit_limit),
                validity_days: parseInt(form.validity_days),
                plan_type: form.plan_type || undefined,
            };
            if (editPlan) {
                await updatePlan(editPlan.id, payload, currentUser.id);
            } else {
                await createPlan(payload, currentUser.id);
            }
            setShowModal(false);
            fetchPlans();
        } catch (err: any) {
            setFormError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (plan: any) => {
        if (!window.confirm(`Delete plan "${plan.plan_name}"? This cannot be undone.`)) return;
        try {
            await deletePlan(plan.id, currentUser.id);
            fetchPlans();
        } catch (err: any) {
            alert('Failed: ' + err.message);
        }
    };

    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Super Admin', path: '/superadmin/dashboard' },
                { label: 'Platform Plans' },
            ]}
            pageTitle="Platform Plans"
            pageDescription="Create and manage subscription plans available on the platform."
            primaryAction={
                <div className="flex gap-3">
                    <button onClick={fetchPlans} className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 font-bold text-sm hover:bg-slate-50 transition-all">
                        <ArrowPathIcon className="w-4 h-4 mr-2" />Refresh
                    </button>
                    <button
                        onClick={openCreate}
                        className="flex items-center px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-black text-sm shadow-lg shadow-emerald-500/20 hover:shadow-xl transition-all"
                    >
                        <PlusIcon className="w-4 h-4 mr-2" />New Plan
                    </button>
                </div>
            }
        >
            <div className="space-y-6 animate-in fade-in duration-500">
                {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl text-red-700 dark:text-red-400 text-sm">{error}</div>
                )}

                {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[...Array(3)].map((_, i) => <div key={i} className="h-40 bg-slate-100 dark:bg-slate-700/50 rounded-3xl animate-pulse" />)}
                    </div>
                ) : plans.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <CircleStackIcon className="w-12 h-12 mb-4 text-slate-300 dark:text-slate-600" />
                        <p className="font-bold text-slate-500 dark:text-slate-400 mb-4">No plans yet</p>
                        <button onClick={openCreate} className="px-5 py-2 bg-emerald-500 text-white rounded-xl font-bold text-sm hover:bg-emerald-600 transition-all">
                            Create First Plan
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {plans.map((plan) => (
                            <div key={plan.id} className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all overflow-hidden">
                                <div className="p-6">
                                    <div className="flex items-start justify-between mb-4">
                                        <div>
                                            <h3 className="font-black text-slate-900 dark:text-white text-lg">{plan.plan_name}</h3>
                                            {plan.plan_type && (
                                                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">{plan.plan_type}</span>
                                            )}
                                        </div>
                                        <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                            <CircleStackIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex justify-between">
                                            <span className="text-xs text-slate-400 font-semibold uppercase tracking-widest">Credits</span>
                                            <span className="font-black text-slate-900 dark:text-white">{plan.credit_limit.toLocaleString()} CR</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-xs text-slate-400 font-semibold uppercase tracking-widest">Validity</span>
                                            <span className="font-black text-slate-900 dark:text-white">{plan.validity_days} days</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="border-t border-slate-100 dark:border-slate-800 p-4 flex gap-2">
                                    <button
                                        onClick={() => openEdit(plan)}
                                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                                    >
                                        <PencilIcon className="w-4 h-4" />Edit
                                    </button>
                                    <button
                                        onClick={() => handleDelete(plan)}
                                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                    >
                                        <TrashIcon className="w-4 h-4" />Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Create / Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-8 w-full max-w-md mx-4 border border-slate-200 dark:border-slate-700">
                        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-6">
                            {editPlan ? `Edit: ${editPlan.plan_name}` : 'Create New Plan'}
                        </h3>
                        {formError && (
                            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm font-medium">{formError}</div>
                        )}
                        <div className="space-y-4">
                            {[
                                { key: 'plan_name', label: 'Plan Name', type: 'text', placeholder: 'e.g., Starter Plan' },
                                { key: 'credit_limit', label: 'Credit Limit', type: 'number', placeholder: 'e.g., 500' },
                                { key: 'validity_days', label: 'Validity (Days)', type: 'number', placeholder: 'e.g., 30' },
                                { key: 'plan_type', label: 'Plan Type (optional)', type: 'text', placeholder: 'e.g., trial, paid, enterprise' },
                            ].map((field) => (
                                <div key={field.key}>
                                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{field.label}</label>
                                    <input
                                        type={field.type}
                                        value={(form as any)[field.key]}
                                        onChange={(e) => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium text-slate-900 dark:text-white"
                                        placeholder={field.placeholder}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setShowModal(false)} className="flex-1 py-3 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">Cancel</button>
                            <button onClick={handleSave} disabled={saving} className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-black shadow-lg shadow-emerald-500/30 hover:shadow-xl transition-all disabled:opacity-60">
                                {saving ? 'Saving...' : editPlan ? 'Update Plan' : 'Create Plan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppLayout>
    );
};

export default SuperAdminPlansPage;
