import React from 'react';
import { ExclamationTriangleIcon, CreditCardIcon, ArrowUpCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

interface UpgradePlanModalProps {
    reason: 'insufficient_credits' | 'plan_expired' | null;
    onClose: () => void;
}

const UpgradePlanModal: React.FC<UpgradePlanModalProps> = ({ reason, onClose }) => {
    const navigate = useNavigate();

    if (!reason) return null;

    const isExpired = reason === 'plan_expired';

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-8 animate-in fade-in zoom-in-95 duration-300 relative">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    id="close-upgrade-modal-btn"
                >
                    <XMarkIcon className="w-5 h-5" />
                </button>

                {/* Icon */}
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 ${isExpired
                        ? 'bg-amber-100 dark:bg-amber-900/30'
                        : 'bg-red-100 dark:bg-red-900/30'
                    }`}>
                    <ExclamationTriangleIcon className={`w-8 h-8 ${isExpired
                            ? 'text-amber-500 dark:text-amber-400'
                            : 'text-red-500 dark:text-red-400'
                        }`} />
                </div>

                {/* Title */}
                <h2 className="text-xl font-black text-slate-900 dark:text-white text-center mb-3">
                    {isExpired ? 'Your Plan Has Expired' : 'Insufficient Credits'}
                </h2>

                {/* Message */}
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6 leading-relaxed">
                    {isExpired
                        ? 'Your plan has expired. Please purchase a new plan or add funds to continue using the platform.'
                        : 'You have run out of credits. Please purchase a plan or add funds to continue using the platform.'
                    }
                </p>

                {/* Divider */}
                <div className="h-px bg-slate-100 dark:bg-slate-800 mb-6" />

                {/* Action Buttons */}
                <div className="flex flex-col gap-3">
                    <button
                        id="view-plans-btn"
                        onClick={() => { navigate('/credits'); onClose(); }}
                        className="w-full flex items-center justify-center gap-2.5 py-3.5 bg-gradient-to-r from-primary to-blue-600 text-white rounded-2xl font-black text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/25"
                    >
                        <ArrowUpCircleIcon className="w-5 h-5" />
                        View Plans
                    </button>
                    <button
                        id="add-credits-btn"
                        onClick={() => { navigate('/credits'); onClose(); }}
                        className="w-full flex items-center justify-center gap-2.5 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white rounded-2xl font-black text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700"
                    >
                        <CreditCardIcon className="w-5 h-5" />
                        Add Credits
                    </button>
                </div>

                {/* Helper text */}
                <p className="text-[10px] text-slate-400 text-center mt-4">
                    Contact support if you need immediate assistance
                </p>
            </div>
        </div>
    );
};

export default UpgradePlanModal;
