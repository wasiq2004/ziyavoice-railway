import React from 'react';

interface KPICardProps {
    title: string;
    value: string | number;
    percentage?: string;
    color: 'green' | 'blue' | 'red' | 'gray' | 'purple';
}

const KPICard: React.FC<KPICardProps> = ({ title, value, percentage, color }) => {
    const colorClasses = {
        green: 'bg-green-500/10 text-green-500 border-green-500/20',
        blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
        red: 'bg-red-500/10 text-red-500 border-red-500/20',
        gray: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
        purple: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    };

    const dotClasses = {
        green: 'bg-green-500',
        blue: 'bg-blue-500',
        red: 'bg-red-500',
        gray: 'bg-slate-500',
        purple: 'bg-purple-500',
    };

    return (
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-[1.5rem] p-3 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="flex items-center justify-between mb-1.5">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
                <div className={`w-1.5 h-1.5 rounded-full ${dotClasses[color]}`}></div>
            </div>
            <div className="flex items-baseline space-x-2">
                <h3 className="text-xl font-black text-slate-900 dark:text-white leading-none tracking-tight">
                    {value}
                </h3>
                {percentage && (
                    <span className={`text-[9px] font-bold ${color === 'red' ? 'text-red-500' : 'text-green-500'}`}>
                        {percentage}
                    </span>
                )}
            </div>
        </div>
    );
};

export default KPICard;
