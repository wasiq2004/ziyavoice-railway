import React from 'react';
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';

interface CampaignCardProps {
    id: string;
    name: string;
    status: 'Draft' | 'Active' | 'Paused' | 'Completed';
    totalLeads: number;
    progress: number;
    createdDate: string;
    onView: (id: string) => void;
    onDelete?: (id: string) => void;
}

const CampaignCard: React.FC<CampaignCardProps> = ({
    id,
    name,
    status,
    totalLeads,
    progress,
    createdDate,
    onView,
    onDelete
}) => {

    const statusColors = {
        Draft: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-900/50 dark:text-slate-400 dark:border-slate-800',
        Active: 'bg-green-50 text-green-600 border-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/50',
        Paused: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/50',
        Completed: 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/50',
    };

    return (
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm hover:shadow-xl hover:border-primary/30 transition-all duration-300 group relative overflow-hidden card-animate">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white group-hover:text-primary transition-colors truncate max-w-[200px]">
                        {name}
                    </h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Created {createdDate}</p>
                </div>
                <div className="flex items-center space-x-1 relative z-20">
                    <button
                        onClick={(e) => { e.stopPropagation(); onView(id); }}
                        className="p-2 rounded-xl text-slate-400 hover:bg-primary/10 hover:text-primary transition-all group/btn"
                        title="Edit Campaign"
                    >
                        <PencilSquareIcon className="h-5 w-5" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete?.(id); }}
                        className="p-2 rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all group/btn"
                        title="Delete Campaign"
                    >
                        <TrashIcon className="h-5 w-5" />
                    </button>
                </div>
            </div>

            <div className="flex items-center space-x-3 mb-6">
                <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${statusColors[status]}`}>
                    {status}
                </span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    {totalLeads} Total Leads
                </span>
            </div>

            <div className="space-y-4">
                <div className="flex justify-between items-end">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Progress</span>
                    <span className="text-xs font-black text-primary">{progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary transition-all duration-500 ease-out shadow-[0_0_8px_rgba(26,115,232,0.5)]"
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>
            </div>

            {/* Click overlap protection */}
            <div
                className="absolute inset-0 z-0 cursor-pointer"
                onClick={() => onView(id)}
            ></div>
        </div>
    );
};

export default CampaignCard;
