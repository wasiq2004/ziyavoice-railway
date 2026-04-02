import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    PlusIcon,
    PencilIcon,
    TrashIcon,
    ArrowPathIcon,
    CircleStackIcon,
    CalendarDaysIcon,
    CheckBadgeIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import AppLayout from '../components/AppLayout';
import Skeleton from '../components/Skeleton';
import { Admin } from '../utils/adminApi';
import { listPlans, createPlan, updatePlan, deletePlan, Plan } from '../utils/adminApi';

const PLAN_TYPE_OPTIONS = ['trial', 'paid', 'enterprise', ''];

const PlanTypeBadge: React.FC<{ type?: string | null }> = ({ type }) => {
    const map: Record<string, string> = {
        trial: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/40',
        paid: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/40',
        enterprise: 'bg-purple-50 text-purple-600 border-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800/40',
    };
    const cls = (type && map[type]) || 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
    return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${cls}`}>
            {type || 'None'}
        </span>
    );
};

const emptyForm = { plan_name: '', credit_limit: '', validity_days: '', plan_type: '' };

const AdminPlansPage: React.FC = () => {
    const navigate = useNavigate();
    const [admin, setAdmin] = useState<Admin | null>(null);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // Create / Edit Modal
    const [showModal, setShowModal] = useState(false);
    const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');

    // Delete confirmation
    const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        const adminData = localStorage.getItem('ziya-user');
        if (!adminData) { navigate('/login'); return; }
        const parsed = JSON.parse(adminData);
        if (parsed.role !== 'org_admin' && parsed.role !== 'super_admin') {
            navigate('/login');
            return;
        }
        setAdmin(parsed);
    }, [navigate]);

    useEffect(() => {
        if (admin) fetchPlans();
    }, [admin]);

    const fetchPlans = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await listPlans();
            setPlans(data);
        } catch (err: any) {
            setError(err.message || 'Failed to load plans');
        } finally {
            setLoading(false);
        }
    };

    const showSuccess = (msg: string) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(''), 3500);
    };

    const openCreateModal = () => {
        setEditingPlan(null);
        setForm(emptyForm);
        setFormError('');
        setShowModal(true);
    };

    const openEditModal = (plan: Plan) => {
        setEditingPlan(plan);
        setForm({
            plan_name: plan.plan_name,
            credit_limit: String(plan.credit_limit),
            validity_days: String(plan.validity_days),
            plan_type: plan.plan_type || '',
        });
        setFormError('');
        setShowModal(true);
    };

    const handleSubmit = async () => {
        setFormError('');
        if (!form.plan_name.trim()) { setFormError('Plan name is required'); return; }
        const credits = parseInt(form.credit_limit);
        const days = parseInt(form.validity_days);
        if (!credits || credits <= 0) { setFormError('Credit limit must be a positive number'); return; }
        if (!days || days <= 0) { setFormError('Validity days must be a positive number'); return; }

        setSubmitting(true);
        try {
            const payload = {
                plan_name: form.plan_name.trim(),
                credit_limit: credits,
                validity_days: days,
                plan_type: form.plan_type || undefined,
            };

            if (editingPlan) {
                await updatePlan(editingPlan.id, payload, admin!.id);
                showSuccess(`Plan "${form.plan_name}" updated successfully`);
            } else {
                await createPlan(payload, admin!.id);
                showSuccess(`Plan "${form.plan_name}" created successfully`);
            }

            setShowModal(false);
            fetchPlans();
        } catch (err: any) {
            setFormError(err.message || 'Operation failed');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await deletePlan(deleteTarget.id, admin!.id);
            showSuccess(`Plan "${deleteTarget.plan_name}" deleted`);
            setDeleteTarget(null);
            fetchPlans();
        } catch (err: any) {
            setError(err.message || 'Failed to delete plan');
            setDeleteTarget(null);
        } finally {
            setDeleting(false);
        }
    };

    const formatDate = (d: string) =>
        new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    if (!admin) return null;

    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Admin', path: '/admin/dashboard' },
                { label: 'Plans' },
            ]}
            pageTitle="Plans"
            pageDescription="Create and manage reusable subscription plans. Assign them to users to automatically set credits and validity."
            primaryAction={
                <div className="flex items-center space-x-3">
                    <button
                        onClick={fetchPlans}
                        className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-all font-bold text-sm shadow-sm"
                    >
                        <ArrowPathIcon className="w-4 h-4 mr-2" />
                        Refresh
                    </button>
                    <button
                        onClick={openCreateModal}
                        className="flex items-center px-5 py-2 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
                    >
                        <PlusIcon className="w-4 h-4 mr-2" />
                        Create Plan
                    </button>
                </div>
            }
        >
            <div className="space-y-6 animate-in fade-in duration-500">
                {/* Status Messages */}
                {successMsg && (
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30 rounded-2xl text-green-700 dark:text-green-400 text-sm font-medium flex items-center gap-2">
                        <CheckBadgeIcon className="w-5 h-5 flex-shrink-0" />
                        {successMsg}
                    </div>
                )}
                {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-2xl text-red-700 dark:text-red-400 text-sm font-medium">
                        {error}
                    </div>
                )}

                {/* Plans Grid */}
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 p-6">
                                <Skeleton width={180} height={20} className="mb-4" />
                                <Skeleton width={120} height={14} className="mb-2" />
                                <Skeleton width={100} height={14} className="mb-6" />
                                <Skeleton width="100%" height={40} />
                            </div>
                        ))}
                    </div>
                ) : plans.length === 0 ? (
                    <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 p-16 text-center">
                        <CircleStackIcon className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-2">No Plans Yet</h3>
                        <p className="text-slate-400 text-sm mb-6">Create your first plan to enable plan assignment for users.</p>
                        <button
                            onClick={openCreateModal}
                            className="inline-flex items-center px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
                        >
                            <PlusIcon className="w-4 h-4 mr-2" />
                            Create First Plan
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {plans.map((plan) => (
                            <div
                                key={plan.id}
                                className="group bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md hover:border-primary/30 dark:hover:border-primary/30 transition-all duration-300"
                            >
                                {/* Plan Header */}
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex-1">
                                        <h3 className="text-lg font-black text-slate-900 dark:text-white group-hover:text-primary transition-colors leading-tight">
                                            {plan.plan_name}
                                        </h3>
                                        <div className="mt-1.5">
                                            <PlanTypeBadge type={plan.plan_type} />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 ml-2">
                                        <button
                                            onClick={() => openEditModal(plan)}
                                            title="Edit Plan"
                                            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-primary/10 hover:text-primary transition-colors"
                                        >
                                            <PencilIcon className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => setDeleteTarget(plan)}
                                            title="Delete Plan"
                                            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Plan Details */}
                                <div className="space-y-3 mt-5">
                                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-2xl">
                                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                            <CircleStackIcon className="w-4 h-4 text-emerald-500" />
                                            <span className="text-xs font-bold uppercase tracking-wide">Credit Limit</span>
                                        </div>
                                        <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                                            {plan.credit_limit.toLocaleString()} CR
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-2xl">
                                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                            <CalendarDaysIcon className="w-4 h-4 text-blue-500" />
                                            <span className="text-xs font-bold uppercase tracking-wide">Validity</span>
                                        </div>
                                        <span className="text-sm font-black text-blue-600 dark:text-blue-400">
                                            {plan.validity_days} days
                                        </span>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
                                    <span className="text-[10px] text-slate-400 font-medium">
                                        Created {formatDate(plan.created_at)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Create / Edit Plan Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg p-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                                    {editingPlan ? 'Edit Plan' : 'Create New Plan'}
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    {editingPlan ? `Editing: ${editingPlan.plan_name}` : 'Fill in the plan details below'}
                                </p>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>

                        {formError && (
                            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 rounded-xl text-red-600 dark:text-red-400 text-sm font-medium">
                                {formError}
                            </div>
                        )}

                        <div className="space-y-4">
                            {/* Plan Name */}
                            <div>
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">
                                    Plan Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    id="plan-name-input"
                                    type="text"
                                    value={form.plan_name}
                                    onChange={(e) => setForm({ ...form, plan_name: e.target.value })}
                                    placeholder="e.g. Starter Plan, Growth Plan"
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white font-bold text-sm outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                                />
                            </div>

                            {/* Credit Limit */}
                            <div>
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">
                                    Credit Limit <span className="text-red-500">*</span>
                                </label>
                                <input
                                    id="credit-limit-input"
                                    type="number"
                                    min="1"
                                    value={form.credit_limit}
                                    onChange={(e) => setForm({ ...form, credit_limit: e.target.value })}
                                    placeholder="e.g. 500"
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white font-bold text-sm outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                                />
                                <p className="text-[10px] text-slate-500 mt-1">Number of credits assigned when this plan is applied to a user</p>
                            </div>

                            {/* Validity Days */}
                            <div>
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">
                                    Validity (Days) <span className="text-red-500">*</span>
                                </label>
                                <input
                                    id="validity-days-input"
                                    type="number"
                                    min="1"
                                    value={form.validity_days}
                                    onChange={(e) => setForm({ ...form, validity_days: e.target.value })}
                                    placeholder="e.g. 30"
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white font-bold text-sm outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                                />
                                <p className="text-[10px] text-slate-500 mt-1">Number of days the plan remains active from the date of assignment</p>
                            </div>

                            {/* Plan Type */}
                            <div>
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">
                                    Plan Type (Optional)
                                </label>
                                <select
                                    id="plan-type-select"
                                    value={form.plan_type}
                                    onChange={(e) => setForm({ ...form, plan_type: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white font-bold text-sm outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                                >
                                    <option value="">None</option>
                                    <option value="trial">Trial</option>
                                    <option value="paid">Paid</option>
                                    <option value="enterprise">Enterprise</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button
                                id="submit-plan-btn"
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="flex-1 py-3 bg-primary text-white rounded-2xl font-black text-sm hover:bg-primary/90 disabled:opacity-50 transition-all shadow-lg shadow-primary/20"
                            >
                                {submitting ? (editingPlan ? 'Updating...' : 'Creating...') : (editingPlan ? 'Update Plan' : 'Create Plan')}
                            </button>
                            <button
                                onClick={() => setShowModal(false)}
                                disabled={submitting}
                                className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-2xl font-black text-sm hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-all"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteTarget && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="text-center">
                            <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <TrashIcon className="w-7 h-7 text-red-500" />
                            </div>
                            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">Delete Plan?</h3>
                            <p className="text-sm text-slate-500 mb-1">
                                You are about to delete:
                            </p>
                            <p className="text-base font-bold text-slate-800 dark:text-white mb-1">
                                "{deleteTarget.plan_name}"
                            </p>
                            <p className="text-xs text-slate-400 mb-6">
                                This action cannot be undone. Plans with active users cannot be deleted.
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                id="confirm-delete-plan-btn"
                                className="flex-1 py-3 bg-red-600 text-white rounded-2xl font-black text-sm hover:bg-red-700 disabled:opacity-50 transition-all shadow-lg shadow-red-600/20"
                            >
                                {deleting ? 'Deleting...' : 'Yes, Delete'}
                            </button>
                            <button
                                onClick={() => setDeleteTarget(null)}
                                disabled={deleting}
                                className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-2xl font-black text-sm hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-all"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppLayout>
    );
};

export default AdminPlansPage;
