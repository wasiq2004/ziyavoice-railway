import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import TopNavbar from './TopNavbar';
import Breadcrumb, { BreadcrumbItem } from './Breadcrumb';

interface AppLayoutProps {
    children: React.ReactNode;
    breadcrumbs: BreadcrumbItem[];
    pageTitle: string;
    pageDescription?: string;
    primaryAction?: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({
    children,
    breadcrumbs,
    pageTitle,
    pageDescription,
    primaryAction
}) => {
    // Sidebar state
    const [isSidebarCollapsed, setSidebarCollapsed] = useState(() => {
        const saved = localStorage.getItem('ziya-sidebar-collapsed');
        return saved === 'true';
    });

    // Sync sidebar state with localStorage
    useEffect(() => {
        localStorage.setItem('ziya-sidebar-collapsed', String(isSidebarCollapsed));
    }, [isSidebarCollapsed]);

    const toggleSidebar = () => {
        setSidebarCollapsed(!isSidebarCollapsed);
    };

    const handleStopImpersonating = () => {
        const originalSup = localStorage.getItem('ziya-original-superadmin');
        const originalAdmin = localStorage.getItem('ziya-impersonation-admin');
        if (originalSup) {
            localStorage.setItem('ziya-user', originalSup);
            localStorage.removeItem('ziya-original-superadmin');
            window.location.href = '/superadmin/dashboard';
        } else if (originalAdmin) {
            localStorage.setItem('ziya-user', originalAdmin);
            localStorage.removeItem('ziya-impersonation-admin');
            window.location.href = '/admin/dashboard';
        }
    };

    const isImpersonating = !!localStorage.getItem('ziya-original-superadmin') || !!localStorage.getItem('ziya-impersonation-admin');

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-darkbg text-slate-800 dark:text-slate-200 font-sans relative overflow-x-hidden transition-colors duration-300">
            {/* {isImpersonating && (
                <div className="bg-red-500 text-white text-center py-2 text-sm font-bold flex justify-center items-center gap-4 z-[9999] relative">
                    You are currently impersonating a user. 
                    <button onClick={handleStopImpersonating} className="bg-white text-red-500 px-3 py-1 rounded text-xs hover:bg-red-50 transition-colors">
                        Return to Super Admin
                    </button>
                </div>
            )} */}
            
            {/* Sidebar component */}
            <Sidebar
                isCollapsed={isSidebarCollapsed}
                setCollapsed={setSidebarCollapsed}
            />

            {/* Navbar component */}
            <TopNavbar
                breadcrumbs={breadcrumbs}
                pageTitle={pageTitle}
                pageDescription={pageDescription}
                isSidebarCollapsed={isSidebarCollapsed}
                primaryAction={primaryAction}
                toggleSidebar={toggleSidebar}
            />

            {/* Main Content Area */}
            <main
                className={`transition-all duration-300 ease-in-out pt-[72px] ${isSidebarCollapsed ? 'ml-20' : 'ml-64'}`}
            >
                <div className="container-wrapper py-6 md:py-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    {/* Page Header - Moved under the nav bar line */}
                    <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
                        <div className="flex flex-col items-start space-y-1">
                            <div className="mb-2">
                                <Breadcrumb items={breadcrumbs} />
                            </div>
                            <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white leading-tight">
                                {pageTitle}
                            </h1>
                            {pageDescription && (
                                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 max-w-2xl">
                                    {pageDescription}
                                </p>
                            )}
                        </div>
                        {primaryAction && (
                            <div className="flex items-center">
                                {primaryAction}
                            </div>
                        )}
                    </div>

                    {/* Unified Container for all content */}
                    <div className="space-y-6">
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AppLayout;
