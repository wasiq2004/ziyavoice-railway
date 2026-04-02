import React from 'react';
import Breadcrumb, { BreadcrumbItem } from './Breadcrumb';

interface PageHeaderProps {
    title: string;
    breadcrumbs?: BreadcrumbItem[];
    children?: React.ReactNode;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, breadcrumbs, children }) => {
    return (
        <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex-1">
                    {breadcrumbs && breadcrumbs.length > 0 && (
                        <div className="mb-2">
                            <Breadcrumb items={breadcrumbs} />
                        </div>
                    )}
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-white">
                        {title}
                    </h1>
                </div>
                {children && (
                    <div className="ml-4">
                        {children}
                    </div>
                )}
            </div>
            {/* Horizontal separator line */}
            <div className="h-px bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700"></div>
        </div>
    );
};

export default PageHeader;
