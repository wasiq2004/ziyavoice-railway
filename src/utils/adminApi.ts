import { getApiBaseUrl, getApiPath } from './api';

const API_BASE_URL = `${getApiBaseUrl()}${getApiPath()}`;

const appendOrgId = (params?: URLSearchParams): string => {
  let queryStr = '';
  // Only add orgId from localStorage if it's not already set in params
  if (!params?.has('orgId')) {
    const userStr = localStorage.getItem('ziya-user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.role === 'org_admin' && user.organization_id) {
          if (params) {
            params.append('orgId', user.organization_id.toString());
          } else {
            queryStr = `?orgId=${user.organization_id}`;
          }
        }
      } catch (e) {
        // Ignore parse error
      }
    }
  }
  return params ? `?${params.toString()}` : queryStr;
};

export interface Admin {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'billing' | 'org_admin';
}

export interface UserListItem {
  id: string;
  email: string;
  username: string;
  created_at: string;
  role: string;
  status: 'active' | 'inactive' | 'locked';
  elevenlabs_usage: number;
  gemini_usage: number;
  deepgram_usage: number;
}

export interface ServiceLimit {
  service_name: 'elevenlabs' | 'gemini' | 'deepgram';
  monthly_limit: number | null;
  daily_limit: number | null;
  is_enabled: boolean;
}

export interface ServiceUsage {
  service_name: string;
  total_usage: number;
}

export interface BillingRecord {
  id: string;
  user_id: string;
  billing_period_start: string;
  billing_period_end: string;
  elevenlabs_usage: number;
  gemini_usage: number;
  deepgram_usage: number;
  platform_fee: number;
  total_amount: number;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  notes: string;
  created_at: string;
}

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  monthlyRevenue: number;
  pendingBilling: number;
  serviceUsage: {
    service_name: string;
    user_count: number;
    total_usage: number;
  }[];
}

// Admin Authentication
export const adminLogin = async (email: string, password: string): Promise<Admin> => {
  const response = await fetch(`${API_BASE_URL}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  // Validate content type before parsing JSON
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Login failed');
  }

  const data = await response.json();
  return data.admin;
};

// Get dashboard statistics
export const getDashboardStats = async (): Promise<DashboardStats> => {
  const response = await fetch(`${API_BASE_URL}/admin/stats${appendOrgId()}`);

  // Validate content type before parsing JSON
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }

  if (!response.ok) { let errorMessage = 'Failed to fetch dashboard stats'; try { const errorData = await response.json(); if (errorData && errorData.error) { errorMessage = errorData.error; } else if (errorData && errorData.message) { errorMessage = errorData.message; } } catch (e) { } throw new Error(errorMessage); }

  const data = await response.json();
  return data.stats;
};

// Get all users with pagination
export const getUsers = async (page: number = 1, limit: number = 50, search: string = '', orgId?: string | null) => {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    search
  });
  if (orgId) {
    params.append('orgId', orgId);
  }

  const response = await fetch(`${API_BASE_URL}/admin/users${appendOrgId(params)}`);

  // Validate content type before parsing JSON
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }

  if (!response.ok) { let errorMessage = 'Failed to fetch users'; try { const errorData = await response.json(); if (errorData && errorData.error) { errorMessage = errorData.error; } else if (errorData && errorData.message) { errorMessage = errorData.message; } } catch (e) { } throw new Error(errorMessage); }

  const data = await response.json();
  return {
    users: data.users as UserListItem[],
    pagination: data.pagination
  };
};

// Get user details
export const getUserDetails = async (userId: string) => {
  const response = await fetch(`${API_BASE_URL}/admin/users/${userId}`);

  // Validate content type before parsing JSON
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }

  if (!response.ok) { let errorMessage = 'Failed to fetch user details'; try { const errorData = await response.json(); if (errorData && errorData.error) { errorMessage = errorData.error; } else if (errorData && errorData.message) { errorMessage = errorData.message; } } catch (e) { } throw new Error(errorMessage); }

  const data = await response.json();
  return {
    user: data.user,
    limits: data.limits as ServiceLimit[],
    usage: data.usage as ServiceUsage[],
    billing: data.billing as BillingRecord[]
  };
};

// Set service limit
export const setServiceLimit = async (
  userId: string,
  serviceName: string,
  monthlyLimit: number | null,
  dailyLimit: number | null,
  isEnabled: boolean,
  adminId: string
) => {
  const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/limits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceName,
      monthlyLimit,
      dailyLimit,
      isEnabled,
      adminId
    })
  });

  // Validate content type before parsing JSON
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }

  if (!response.ok) { let errorMessage = 'Failed to set service limit'; try { const errorData = await response.json(); if (errorData && errorData.error) { errorMessage = errorData.error; } else if (errorData && errorData.message) { errorMessage = errorData.message; } } catch (e) { } throw new Error(errorMessage); }

  return response.json();
};

// Get service limits
export const getServiceLimits = async (userId: string) => {
  const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/limits`);

  // Validate content type before parsing JSON
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }

  if (!response.ok) { let errorMessage = 'Failed to fetch service limits'; try { const errorData = await response.json(); if (errorData && errorData.error) { errorMessage = errorData.error; } else if (errorData && errorData.message) { errorMessage = errorData.message; } } catch (e) { } throw new Error(errorMessage); }

  const data = await response.json();
  return data.limits;
};

// Create billing record
export const createBillingRecord = async (
  userId: string,
  periodStart: string,
  periodEnd: string,
  usageData: {
    elevenlabs?: number;
    gemini?: number;
    deepgram?: number;
  },
  platformFee: number,
  adminId: string
) => {
  const response = await fetch(`${API_BASE_URL}/admin/billing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      periodStart,
      periodEnd,
      usageData,
      platformFee,
      adminId
    })
  });

  // Validate content type before parsing JSON
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }

  if (!response.ok) { let errorMessage = 'Failed to create billing record'; try { const errorData = await response.json(); if (errorData && errorData.error) { errorMessage = errorData.error; } else if (errorData && errorData.message) { errorMessage = errorData.message; } } catch (e) { } throw new Error(errorMessage); }

  return response.json();
};

// Update billing status
export const updateBillingStatus = async (
  billingId: string,
  status: string,
  notes: string,
  adminId: string
) => {
  const response = await fetch(`${API_BASE_URL}/admin/billing/${billingId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status,
      notes,
      adminId
    })
  });

  // Validate content type before parsing JSON
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }

  if (!response.ok) { let errorMessage = 'Failed to update billing status'; try { const errorData = await response.json(); if (errorData && errorData.error) { errorMessage = errorData.error; } else if (errorData && errorData.message) { errorMessage = errorData.message; } } catch (e) { } throw new Error(errorMessage); }

  return response.json();
};

// Add credits to user wallet
export const addCredits = async (
  userId: string,
  amount: number,
  description: string,
  adminId: string
): Promise<{ success: boolean; newBalance: number }> => {
  const response = await fetch(`${API_BASE_URL}/admin/wallet/add-credits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      amount,
      description,
      adminId
    })
  });

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to add credits');
  }

  return response.json();
};

// Get user wallet balance
export const getUserBalance = async (userId: string): Promise<number> => {
  const response = await fetch(`${API_BASE_URL}/wallet/balance/${userId}`);

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }

  if (!response.ok) { let errorMessage = 'Failed to fetch user balance'; try { const errorData = await response.json(); if (errorData && errorData.error) { errorMessage = errorData.error; } else if (errorData && errorData.message) { errorMessage = errorData.message; } } catch (e) { } throw new Error(errorMessage); }

  const data = await response.json();
  return data.balance;
};

// Get user resources (Agents, Campaigns)
export const getUserResources = async (userId: string): Promise<{ agents: any[]; campaigns: any[] }> => {
  const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/resources`);

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }

  if (!response.ok) { let errorMessage = 'Failed to fetch user resources'; try { const errorData = await response.json(); if (errorData && errorData.error) { errorMessage = errorData.error; } else if (errorData && errorData.message) { errorMessage = errorData.message; } } catch (e) { } throw new Error(errorMessage); }

  return response.json();
};

// Update user status
export const updateUserStatus = async (
  userId: string,
  status: 'active' | 'inactive' | 'locked',
  adminId: string
): Promise<{ success: boolean; message: string }> => {
  const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, adminId })
  });

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to update user status');
  }

  return response.json();
};

// Admin-led Password Reset
export const resetUserPassword = async (
  userId: string,
  newPassword: string,
  adminId: string
): Promise<{ success: boolean; message: string }> => {
  const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword, adminId })
  });

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to reset password');
  }

  return response.json();
};

// Get audit logs
export const getAuditLogs = async (page = 1, limit = 50): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/admin/logs?page=${page}&limit=${limit}`);

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }

  if (!response.ok) { let errorMessage = 'Failed to fetch audit logs'; try { const errorData = await response.json(); if (errorData && errorData.error) { errorMessage = errorData.error; } else if (errorData && errorData.message) { errorMessage = errorData.message; } } catch (e) { } throw new Error(errorMessage); }

  return response.json();
};

/**
 * Impersonate a user (Login as user)
 */
export const impersonateUser = async (userId: string, adminId: string): Promise<{ success: boolean; user: any }> => {
  const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/impersonate?adminId=${adminId}`);

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to impersonate user');
  }

  return response.json();
};


// Delete a user permanently (admin)
export const deleteUser = async (userId: string, adminId: string): Promise<{ success: boolean; message: string }> => {
  const response = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminId })
  });
  const ct = response.headers.get('content-type');
  if (!ct?.includes('application/json')) throw new Error('Invalid server response');
  if (!response.ok) { const e = await response.json(); throw new Error(e.message || 'Failed to delete user'); }
  return response.json();
};

// Create a new user under org (admin panel)
export const createAdminUser = async (email: string, username: string, password: string, organization_id?: string | null): Promise<{ success: boolean; user: any }> => {
  const response = await fetch(`${API_BASE_URL}/admin/create-user`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, username, password, organization_id })
  });
  const ct = response.headers.get('content-type');
  if (!ct?.includes('application/json')) throw new Error('Invalid server response');
  if (!response.ok) { const e = await response.json(); throw new Error(e.message || 'Failed to create user'); }
  return response.json();
};

// Get org-level wallet summary
export const getWalletSummary = async (orgId?: string | null): Promise<{ success: boolean; summary: any }> => {
  const qs = orgId ? `?orgId=${orgId}` : '';
  const response = await fetch(`${API_BASE_URL}/admin/wallet/summary${qs}`);
  const ct = response.headers.get('content-type');
  if (!ct?.includes('application/json')) throw new Error('Invalid server response');
  if (!response.ok) { const e = await response.json(); throw new Error(e.message || 'Failed to fetch wallet summary'); }
  return response.json();
};

// Get org-level wallet transaction log
export const getWalletTransactions = async (orgId?: string | null, type?: string): Promise<{ success: boolean; transactions: any[] }> => {
  const params = new URLSearchParams({ limit: '100' });
  if (orgId) params.append('orgId', orgId);
  if (type && type !== 'All') params.append('type', type);
  const response = await fetch(`${API_BASE_URL}/admin/wallet/transactions?${params.toString()}`);
  const ct = response.headers.get('content-type');
  if (!ct?.includes('application/json')) throw new Error('Invalid server response');
  if (!response.ok) { const e = await response.json(); throw new Error(e.message || 'Failed to fetch transactions'); }
  return response.json();
};
// ==================== Plan Management ====================

export interface UserPlan {
  plan_type: 'trial' | 'paid' | 'enterprise' | null;
  plan_valid_until: string | null;
  trial_started_at: string | null;
  is_expired?: boolean;
  days_left?: number | null;
}

/**
 * Get a user's current plan/trial status (admin)
 */
export const getUserPlan = async (userId: string): Promise<UserPlan & { success: boolean }> => {
  const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/plan`);
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to fetch user plan');
  }
  return response.json();
};

/**
 * Update a user's plan type and/or validity (admin)
 * Pass extend_days to extend from current expiry, or plan_valid_until for specific date.
 */
export const updateUserPlan = async (
  userId: string,
  options: {
    plan_type?: 'trial' | 'paid' | 'enterprise';
    plan_valid_until?: string;
    extend_days?: number;
  },
  adminId: string
): Promise<{ success: boolean; plan: UserPlan }> => {
  const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/plan`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...options, adminId })
  });
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to update user plan');
  }
  return response.json();
};
// ==================== Plan Management ====================

export interface Plan {
  id: string;
  plan_name: string;
  credit_limit: number;
  validity_days: number;
  plan_type?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanAccessInfo {
  success: boolean;
  can_access: boolean;
  credits_balance: number;
  plan_valid_until: string | null;
  is_expired: boolean;
  has_credits: boolean;
  plan_type: string | null;
  blocking_reason: 'insufficient_credits' | 'plan_expired' | null;
}

/** Get all plans */
export const listPlans = async (): Promise<Plan[]> => {
  const response = await fetch(`${API_BASE_URL}/admin/plans`);
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) throw new Error('Non-JSON response');
  if (!response.ok) {
    const e = await response.json();
    throw new Error(e.message || 'Failed to fetch plans');
  }
  const data = await response.json();
  return data.plans;
};

/** Create a new plan */
export const createPlan = async (
  payload: { plan_name: string; credit_limit: number; validity_days: number; plan_type?: string },
  adminId: string
): Promise<Plan> => {
  const response = await fetch(`${API_BASE_URL}/admin/plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, adminId })
  });
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) throw new Error('Non-JSON response');
  if (!response.ok) {
    const e = await response.json();
    throw new Error(e.message || 'Failed to create plan');
  }
  const data = await response.json();
  return data.plan;
};

/** Update an existing plan */
export const updatePlan = async (
  planId: string,
  payload: { plan_name?: string; credit_limit?: number; validity_days?: number; plan_type?: string },
  adminId: string
): Promise<Plan> => {
  const response = await fetch(`${API_BASE_URL}/admin/plans/${planId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, adminId })
  });
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) throw new Error('Non-JSON response');
  if (!response.ok) {
    const e = await response.json();
    throw new Error(e.message || 'Failed to update plan');
  }
  const data = await response.json();
  return data.plan;
};

/** Delete a plan */
export const deletePlan = async (planId: string, adminId: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/admin/plans/${planId}?adminId=${encodeURIComponent(adminId)}`, {
    method: 'DELETE'
  });
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) throw new Error('Non-JSON response');
  if (!response.ok) {
    const e = await response.json();
    throw new Error(e.message || 'Failed to delete plan');
  }
};

/** Assign a plan to a user */
export const assignPlanToUser = async (
  userId: string,
  planId: string,
  adminId: string
): Promise<{ success: boolean; message: string; user: any }> => {
  const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/assign-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId, adminId })
  });
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) throw new Error('Non-JSON response');
  if (!response.ok) {
    const e = await response.json();
    throw new Error(e.message || 'Failed to assign plan');
  }
  return response.json();
};

/** Check if a user has valid plan access (credits > 0 AND plan not expired) */
export const checkUserPlanAccess = async (userId: string): Promise<PlanAccessInfo> => {
  const response = await fetch(`${API_BASE_URL}/users/plan-access/${userId}`);
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) throw new Error('Non-JSON response');
  if (!response.ok) {
    const e = await response.json();
    throw new Error(e.message || 'Failed to check plan access');
  }
  return response.json();
};

/** Create a new user under an organization (used by org admins) */
export const createUser = async (payload: {
  email: string;
  username: string;
  password: string;
  organization_id?: number | null;
}): Promise<{ success: boolean; message: string; userId: string }> => {
  const response = await fetch(`${API_BASE_URL}/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) throw new Error('Non-JSON response from server');
  if (!response.ok) {
    throw new Error(e.message || 'Failed to create user');
  }
  return response.json();
};

/** Create a new support ticket */
export const createSupportTicket = async (payload: {
  subject: string;
  category?: string;
  priority?: string;
  message: string;
  created_by: string;
  created_by_role: 'user' | 'org_admin' | 'super_admin';
  target_role: 'org_admin' | 'super_admin';
  organization_id?: number | null;
}): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/support/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) throw new Error('Non-JSON response');
  if (!response.ok) { const e = await response.json(); throw new Error(e.message || 'Failed to create ticket'); }
  return response.json();
};

/** List support tickets (scoped by role) */
export const listSupportTickets = async (params: {
  created_by?: string;
  created_by_role?: string;
  target_role?: string;
  organization_id?: number | null;
  page?: number;
  limit?: number;
}): Promise<{ tickets: any[]; pagination: any }> => {
  const q = new URLSearchParams();
  if (params.created_by) q.set('created_by', params.created_by);
  if (params.created_by_role) q.set('created_by_role', params.created_by_role);
  if (params.target_role) q.set('target_role', params.target_role);
  if (params.organization_id) q.set('organization_id', params.organization_id.toString());
  if (params.page) q.set('page', params.page.toString());
  if (params.limit) q.set('limit', params.limit.toString());
  
  const response = await fetch(`${API_BASE_URL}/support/tickets?${q}`);
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) throw new Error('Non-JSON response');
  if (!response.ok) { const e = await response.json(); throw new Error(e.message || 'Failed to fetch tickets'); }
  const data = await response.json();
  return { tickets: data.tickets, pagination: data.pagination };
};

/** Get a single ticket with replies */
export const getSupportTicket = async (ticketId: string): Promise<{ ticket: any; replies: any[] }> => {
  const response = await fetch(`${API_BASE_URL}/support/tickets/${ticketId}`);
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) throw new Error('Non-JSON response');
  if (!response.ok) { const e = await response.json(); throw new Error(e.message || 'Failed to fetch ticket'); }
  return response.json();
};

/** Reply to a support ticket */
export const replyToSupportTicket = async (
  ticketId: string,
  message: string,
  user_id: string,
  user_role: 'user' | 'org_admin' | 'super_admin'
): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/support/tickets/${ticketId}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, user_id, user_role }),
  });
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) throw new Error('Non-JSON response');
  if (!response.ok) { const e = await response.json(); throw new Error(e.message || 'Failed to reply'); }
  return response.json();
};

/** Update ticket status */
export const updateTicketStatus = async (ticketId: string, status: string): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/support/tickets/${ticketId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) throw new Error('Non-JSON response');
  if (!response.ok) { const e = await response.json(); throw new Error(e.message || 'Failed to update status'); }
  return response.json();
};

// ==================== Company Management ====================

export interface Company {
  id: string;
  name: string;
}

/**
 * Get all companies for a user
 */
export const getUserCompanies = async (userId: string): Promise<Company[]> => {
  const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/companies`);
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to fetch user companies');
  }
  const data = await response.json();
  return data.companies || [];
};

/**
 * Login as a user with a specific company
 */
export const loginAsUserCompany = async (userId: string, companyId: string, adminId: string): Promise<{ success: boolean; user: any }> => {
  const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/login-as-company`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, adminId })
  });
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to login to company');
  }
  return response.json();
};

// End of adminApi.ts