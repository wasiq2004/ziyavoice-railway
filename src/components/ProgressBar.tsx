import React from 'react';

interface ProgressBarProps {
    completed: number;
    failed: number;
    inProgress: number;
    pending: number;
    total: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ completed, failed, inProgress, pending, total }) => {
    const getWidth = (value: number) => (total > 0 ? (value / total) * 100 : 0);

    return (
        <div className="space-y-4">
            <div className="w-full h-3 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden flex shadow-inner">
                <div
                    className="h-full bg-green-500 transition-all duration-500 ease-out"
                    style={{ width: `${getWidth(completed)}%` }}
                    title={`Completed: ${completed}`}
                ></div>
                <div
                    className="h-full bg-red-500 transition-all duration-500 ease-out"
                    style={{ width: `${getWidth(failed)}%` }}
                    title={`Failed: ${failed}`}
                ></div>
                <div
                    className="h-full bg-blue-500 transition-all duration-500 ease-out"
                    style={{ width: `${getWidth(inProgress)}%` }}
                    title={`In Progress: ${inProgress}`}
                ></div>
                <div
                    className="h-full bg-slate-400 dark:bg-slate-700 transition-all duration-500 ease-out shadow-inner"
                    style={{ width: `${getWidth(pending)}%` }}
                    title={`Pending: ${pending}`}
                ></div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center space-x-6">
                    <div className="flex items-center space-x-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Active</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Failed</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Rejected</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">1 to 1 Scheduled</span>
                    </div>
                </div>
                <div className="text-sm font-black text-slate-700 dark:text-white transition-all">
                    {completed + failed + inProgress}/{total} processed <span className="text-primary ml-1">({total > 0 ? Math.round(((completed + failed + inProgress) / total) * 100) : 0}%)</span>
                </div>
            </div>
        </div>
    );
};

export default ProgressBar;
