import React from 'react';
import TopNavbar from './TopNavbar';
import { BreadcrumbItem } from './Breadcrumb';

interface MainLayoutProps {
    children: React.ReactNode;
    breadcrumbs: BreadcrumbItem[];
    pageTitle: string;
    pageDescription?: string;
}

const MainLayout: React.FC<MainLayoutProps> = ({
    children,
    breadcrumbs,
    pageTitle,
    pageDescription
}) => {
    return (
        <>
            <TopNavbar
                breadcrumbs={breadcrumbs}
                pageTitle={pageTitle}
                pageDescription={pageDescription}
            />

            {/* Main Content Area with top margin for fixed navbar */}
            <div className="pt-[70px]">
                <div className="p-6 max-w-[1400px] mx-auto">
                    {/* Page Header Section */}
                    <div className="mb-6">
                        {/* Horizontal separator line */}
                        <div className="h-px bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 mb-6"></div>
                    </div>

                    {/* Page Content */}
                    <div className="space-y-6">
                        {children}
                    </div>
                </div>
            </div>
        </>
    );
};

export default MainLayout;
