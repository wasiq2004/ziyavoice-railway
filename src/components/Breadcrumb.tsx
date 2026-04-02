import React from 'react';
import { useNavigate } from 'react-router-dom';

export interface BreadcrumbItem {
    label: string;
    path?: string;
}

interface BreadcrumbProps {
    items: BreadcrumbItem[];
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({ items }) => {
    const navigate = useNavigate();

    return (
        <nav className="flex items-center space-x-2 text-sm">
            {items.map((item, index) => (
                <React.Fragment key={index}>
                    {index > 0 && (
                        <svg
                            className="w-4 h-4 text-slate-400 dark:text-slate-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    )}
                    {item.path && index < items.length - 1 ? (
                        <button
                            onClick={() => navigate(item.path!)}
                            className="text-slate-600 dark:text-slate-400 hover:text-primary dark:hover:text-primary transition-colors font-medium"
                        >
                            {item.label}
                        </button>
                    ) : (
                        <span className={`${index === items.length - 1
                                ? 'text-slate-800 dark:text-white font-semibold'
                                : 'text-slate-600 dark:text-slate-400'
                            }`}>
                            {item.label}
                        </span>
                    )}
                </React.Fragment>
            ))}
        </nav>
    );
};

export default Breadcrumb;
