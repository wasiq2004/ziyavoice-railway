import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import CampaignsPage from './pages/CampaignsPage';
import CampaignDetailPage from './pages/CampaignDetailPage';
import AgentPage from './pages/AgentPage';
import PhoneNoPage from './pages/PhoneNoPage';
import SettingsPage from './pages/SettingsPage';
import ApiPage from './pages/ApiPage';
import CreditsPage from './pages/CreditsPage';
import DashboardPage from './pages/DashboardPage';
import ReportsPage from './pages/ReportsPage';
import SchedulePage from './pages/SchedulePage';
import UserSupportPage from './pages/UserSupportPage';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminCreditsPage from './pages/AdminCreditsPage';
import AdminReportsPage from './pages/AdminReportsPage';
import AdminSettingsPage from './pages/AdminSettingsPage';
import AdminSupportPage from './pages/AdminSupportPage';

// Super Admin Pages
import SuperAdminDashboardPage from './pages/SuperAdminDashboardPage';
import SuperAdminOrganizationsPage from './pages/SuperAdminOrganizationsPage';
import SuperAdminPricingPage from './pages/SuperAdminPricingPage';
import SuperAdminCreditsPage from './pages/SuperAdminCreditsPage';
import SuperAdminSupportPage from './pages/SuperAdminSupportPage';
import SuperAdminSettingsPage from './pages/SuperAdminSettingsPage';


/** Guard for Org Admin routes (/admin/*) — checks role = org_admin in ziya-user */
const OrgAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const userStr = localStorage.getItem('ziya-user');
    if (!userStr) return <Navigate to="/login" replace />;
    const user = JSON.parse(userStr);
    // Allow both org_admin and super_admin (super admin can view org admin UI too)
    if (user.role !== 'org_admin' && user.role !== 'super_admin') {
        return <Navigate to="/login" replace />;
    }
    return <>{children}</>;
};

const SuperAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const userStr = localStorage.getItem('ziya-user');
    if (!userStr) return <Navigate to="/login" replace />;
    const user = JSON.parse(userStr);
    if (user.role !== 'super_admin') return <Navigate to="/login" replace />;
    return <>{children}</>;
};

// ─── App ─────────────────────────────────────────────────────────────────────

const App: React.FC = () => {
    return (
        <ThemeProvider>
            <AuthProvider>
                <Routes>
                    {/* ── Public ───────────────────────────────────── */}
                    <Route path="/login" element={<LoginPage />} />

                    {/* ── Super Admin Routes (/superadmin/*) ───────── */}
                    <Route path="/superadmin/dashboard" element={<SuperAdminRoute><SuperAdminDashboardPage /></SuperAdminRoute>} />
                    <Route path="/superadmin/organizations" element={<SuperAdminRoute><SuperAdminOrganizationsPage /></SuperAdminRoute>} />
                    <Route path="/superadmin/pricing" element={<SuperAdminRoute><SuperAdminPricingPage /></SuperAdminRoute>} />
                    <Route path="/superadmin/credits" element={<SuperAdminRoute><SuperAdminCreditsPage /></SuperAdminRoute>} />
                    <Route path="/superadmin/support" element={<SuperAdminRoute><SuperAdminSupportPage /></SuperAdminRoute>} />
                    <Route path="/superadmin/settings" element={<SuperAdminRoute><SuperAdminSettingsPage /></SuperAdminRoute>} />

                    {/* ── Org Admin Routes (/admin/*) ───────────────── */}
                    <Route path="/admin/dashboard" element={<OrgAdminRoute><AdminDashboardPage /></OrgAdminRoute>} />
                    <Route path="/admin/users" element={<OrgAdminRoute><AdminUsersPage /></OrgAdminRoute>} />
                    <Route path="/admin/credits" element={<OrgAdminRoute><AdminCreditsPage /></OrgAdminRoute>} />
                    <Route path="/admin/reports" element={<OrgAdminRoute><AdminReportsPage /></OrgAdminRoute>} />
                    <Route path="/admin/settings" element={<OrgAdminRoute><AdminSettingsPage /></OrgAdminRoute>} />
                    <Route path="/admin/support" element={<OrgAdminRoute><AdminSupportPage /></OrgAdminRoute>} />

                    {/* ── User Routes (/dashboard, /agents, etc.) ──── */}
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                    <Route path="/campaigns" element={<ProtectedRoute><CampaignsPage /></ProtectedRoute>} />
                    <Route path="/campaigns/:id" element={<ProtectedRoute><CampaignDetailPage /></ProtectedRoute>} />
                    <Route path="/agents" element={<ProtectedRoute><AgentPage /></ProtectedRoute>} />
                    <Route path="/phone-numbers" element={<ProtectedRoute><PhoneNoPage /></ProtectedRoute>} />
                    <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
                    <Route path="/schedule" element={<ProtectedRoute><SchedulePage /></ProtectedRoute>} />
                    <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                    <Route path="/api" element={<ProtectedRoute><ApiPage /></ProtectedRoute>} />
                    <Route path="/credits" element={<ProtectedRoute><CreditsPage /></ProtectedRoute>} />
                    <Route path="/support" element={<ProtectedRoute><UserSupportPage /></ProtectedRoute>} />

                    {/* ── Fallback ──────────────────────────────────── */}
                    <Route path="*" element={<Navigate to="/login" replace />} />
                </Routes>
            </AuthProvider>
        </ThemeProvider>
    );
};

export default App;
