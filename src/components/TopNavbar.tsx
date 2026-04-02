import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import Breadcrumb, { BreadcrumbItem } from './Breadcrumb';
import {
    BellIcon,
    UserCircleIcon,
    Cog6ToothIcon,
    ArrowLeftOnRectangleIcon,
    CreditCardIcon,
    SunIcon,
    MoonIcon
} from '@heroicons/react/24/outline';
import { useTheme } from '../contexts/ThemeContext';
import { getApiBaseUrl, getApiPath } from '../utils/api';

interface TopNavbarProps {
    breadcrumbs: BreadcrumbItem[];
    pageTitle: string;
    pageDescription?: string;
    isSidebarCollapsed: boolean;
    toggleSidebar: () => void;
    primaryAction?: React.ReactNode;
}

const TopNavbar: React.FC<TopNavbarProps> = ({
    breadcrumbs,
    pageTitle,
    pageDescription,
    isSidebarCollapsed,
    primaryAction
}) => {
    const { user, signOut } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    const [adminUser, setAdminUser] = useState<any>(null);

    useEffect(() => {
        const storedAdmin = localStorage.getItem('ziya-user');
        if (storedAdmin) {
            const parsed = JSON.parse(storedAdmin);
            if (parsed.role === 'org_admin' || parsed.role === 'super_admin') {
                setAdminUser(parsed);
            }
        }
    }, []);

    const currentUser = user || adminUser;

    const dropdownRef = useRef<HTMLDivElement>(null);
    const notificationRef = useRef<HTMLDivElement>(null);

    const [notifications, setNotifications] = useState<any[]>([]);

    const fetchNotifications = async () => {
        if (!user) return;
        try {
            const res = await fetch(`${getApiBaseUrl()}${getApiPath()}/notifications/failures?userId=${user.id}`);
            const data = await res.json();
            if (data.success && data.notifications) {
                // filter out deleted ones
                const deletedMapStr = localStorage.getItem('ziya_deleted_notifications') || '{}';
                const readMapStr = localStorage.getItem('ziya_read_notifications') || '{}';

                try {
                    const deletedMap = JSON.parse(deletedMapStr);
                    const readMap = JSON.parse(readMapStr);

                    const filtered = data.notifications.filter((n: any) => !deletedMap[n.id] || deletedMap[n.id] < new Date(n.timeRaw).getTime());
                    const output = filtered.map((n: any) => {
                        // Check if it's read by looking if we have read this exact time pattern.
                        let isRead = false;
                        if (readMap[n.id] && readMap[n.id] >= new Date(n.timeRaw).getTime()) {
                            isRead = true;
                        }
                        return { ...n, read: isRead };
                    });

                    setNotifications(output);
                } catch (e) {
                    setNotifications(data.notifications);
                }
            }
        } catch (error) {
            console.error('Error fetching notifications:', error);
        }
    };

    useEffect(() => {
        if (user) {
            fetchNotifications();
            const interval = setInterval(fetchNotifications, 60000); // Poll every minute
            return () => clearInterval(interval);
        }
    }, [user]);

    const unreadCount = notifications.filter(n => !n.read).length;

    const handleMarkAllRead = () => {
        const readMapStr = localStorage.getItem('ziya_read_notifications') || '{}';
        const readMap = JSON.parse(readMapStr);

        notifications.forEach(n => {
            readMap[n.id] = new Date(n.timeRaw).getTime();
        });
        localStorage.setItem('ziya_read_notifications', JSON.stringify(readMap));
        setNotifications(notifications.map(n => ({ ...n, read: true })));
    };

    const handleClearNotifications = () => {
        const deletedMapStr = localStorage.getItem('ziya_deleted_notifications') || '{}';
        const deletedMap = JSON.parse(deletedMapStr);
        notifications.forEach(n => {
            deletedMap[n.id] = new Date(n.timeRaw).getTime();
        });
        localStorage.setItem('ziya_deleted_notifications', JSON.stringify(deletedMap));
        setNotifications([]);
    };



    // Get organization name from email domain
    const getOrganizationName = (email: string | undefined): string => {
        if (!email) return 'Organization';
        const domain = email.split('@')[1];
        if (!domain) return 'Organization';
        const name = domain.split('.')[0];
        return name.charAt(0).toUpperCase() + name.slice(1);
    };

    // Get user initials
    const getUserInitials = (email: string | undefined, username: string | undefined): string => {
        if (username) return username.charAt(0).toUpperCase();
        if (email) return email.charAt(0).toUpperCase();
        return 'U';
    };

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
            if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
                setIsNotificationOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = async () => {
        try {
            await signOut();
            navigate('/login');
        } catch (error) {
            console.error('Error logging out:', error);
        }
    };

    return (
        <div className={`fixed top-0 right-0 h-[72px] bg-white dark:bg-darkbg-surface border-b border-slate-200 dark:border-slate-800/50 z-30 transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'left-20' : 'left-64'}`}>
            <div className="h-full container-wrapper flex items-center justify-end">
                {/* Right Side - Search, Notifications, Profile */}
                <div className="flex items-center space-x-3 md:space-x-5">


                    {/* Theme Toggle Button */}
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-primary dark:hover:text-primary transition-all duration-200"
                        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    >
                        {theme === 'dark' ? (
                            <SunIcon className="w-6 h-6" />
                        ) : (
                            <MoonIcon className="w-6 h-6" />
                        )}
                    </button>

                    {/* Notification Icon */}
                    <div className="relative" ref={notificationRef}>
                        <button
                            onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                            className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-primary dark:hover:text-primary transition-all duration-200 relative"
                        >
                            <BellIcon className="w-6 h-6" />
                            {unreadCount > 0 && (
                                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900 animate-pulse"></span>
                            )}
                        </button>

                        {/* Notification Dropdown */}
                        {isNotificationOpen && (
                            <div className="absolute right-0 mt-3 w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 py-3 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="px-5 py-2 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">Notifications</p>
                                    <div className="flex gap-2">
                                        {unreadCount > 0 && (
                                            <button
                                                onClick={handleMarkAllRead}
                                                className="text-[10px] text-primary font-bold hover:underline uppercase tracking-wide"
                                            >
                                                Mark read
                                            </button>
                                        )}
                                        {notifications.length > 0 && (
                                            <button
                                                onClick={handleClearNotifications}
                                                className="text-[10px] text-slate-400 font-bold hover:text-red-500 transition-colors uppercase tracking-wide"
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="max-h-80 overflow-y-auto">
                                    {notifications.length > 0 ? (
                                        notifications.map((notification) => (
                                            <div
                                                key={notification.id}
                                                className={`px-5 py-4 border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${!notification.read ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}
                                            >
                                                <div className="flex justify-between items-start mb-1">
                                                    <p className={`text-sm ${!notification.read ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-300'}`}>
                                                        {notification.title}
                                                    </p>
                                                    <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap ml-2">{notification.time}</span>
                                                </div>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
                                                    {notification.message}
                                                </p>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="px-5 py-8 text-center">
                                            <div className="bg-slate-50 dark:bg-slate-900 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                                <BellIcon className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                                            </div>
                                            <p className="text-sm font-bold text-slate-900 dark:text-white">No notifications</p>
                                            <p className="text-xs text-slate-500 mt-1">You're all caught up!</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* User Profile Dropdown */}
                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="flex items-center space-x-3 p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200"
                        >
                            {currentUser?.profile_image ? (
                                <img src={currentUser.profile_image} alt="Profile" className="w-10 h-10 rounded-xl object-cover shadow-lg shadow-primary/20" />
                            ) : (
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-primary/20">
                                    {getUserInitials(currentUser?.email, currentUser?.username)}
                                </div>
                            )}
                            <div className="hidden md:block text-left">
                                <p className="text-sm font-bold text-slate-900 dark:text-white leading-none mb-1">
                                    {currentUser?.full_name || currentUser?.name || currentUser?.username || currentUser?.email?.split('@')[0] || 'User'}
                                </p>
                                {/* <p className="text-[10px] text-primary font-bold uppercase tracking-wider">
                                    {adminUser ? 'System Administrator' : getOrganizationName(currentUser?.email)}
                                </p> */}
                            </div>
                            <svg
                                className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {/* Dropdown Menu */}
                        {isDropdownOpen && (
                            <div className="absolute right-0 mt-3 w-64 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                {/* User Info */}
                                <div className="px-5 py-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700">
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                                        {currentUser?.username || currentUser?.name || currentUser?.email?.split('@')[0] || 'User'}
                                    </p>
                                    <p className="text-xs text-slate-500 truncate mt-1">
                                        {currentUser?.email || 'user@example.com'}
                                    </p>
                                </div>

                                {/* Menu Items */}
                                <div className="p-2">
                                    {adminUser ? (
                                        adminUser.role === 'org_admin' && (
                                            <button
                                                onClick={() => {
                                                    navigate('/admin/dashboard');
                                                    setIsDropdownOpen(false);
                                                }}
                                                className="w-full px-3 py-2.5 text-left text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl flex items-center space-x-3 transition-colors"
                                            >
                                                <Cog6ToothIcon className="h-5 w-5 text-slate-400" />
                                                <span className="font-medium">Admin Dashboard</span>
                                            </button>
                                        )
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => {
                                                    navigate('/settings');
                                                    setIsDropdownOpen(false);
                                                }}
                                                className="w-full px-3 py-2.5 text-left text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl flex items-center space-x-3 transition-colors"
                                            >
                                                <UserCircleIcon className="h-5 w-5 text-slate-400" />
                                                <span className="font-medium">My Profile</span>
                                            </button>

                                            <button
                                                onClick={() => {
                                                    navigate('/settings');
                                                    setIsDropdownOpen(false);
                                                }}
                                                className="w-full px-3 py-2.5 text-left text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl flex items-center space-x-3 transition-colors"
                                            >
                                                <Cog6ToothIcon className="h-5 w-5 text-slate-400" />
                                                <span className="font-medium">User Profile</span>
                                            </button>

                                            <button
                                                onClick={() => {
                                                    navigate('/credits');
                                                    setIsDropdownOpen(false);
                                                }}
                                                className="w-full px-3 py-2.5 text-left text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl flex items-center space-x-3 transition-colors"
                                            >
                                                <CreditCardIcon className="h-5 w-5 text-slate-400" />
                                                <span className="font-medium">Billing & Usage</span>
                                            </button>
                                        </>
                                    )}
                                </div>

                                {/* Logout Button */}
                                <div className="p-2 border-t border-slate-100 dark:border-slate-700">
                                    <button
                                        onClick={handleLogout}
                                        className="w-full px-3 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl flex items-center space-x-3 transition-colors"
                                    >
                                        <ArrowLeftOnRectangleIcon className="h-5 w-5" />
                                        <span className="font-bold">Sign Out</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TopNavbar;
