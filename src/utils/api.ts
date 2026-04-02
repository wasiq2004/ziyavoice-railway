/**
 * ⭐ SINGLE SOURCE OF TRUTH FOR BACKEND URL ⭐
 * Change this URL to update the backend URL everywhere in the application
 */

export const getAuthHeaders = (extraHeaders: Record<string, any> = {}) => {
  const headers: Record<string, any> = { ...extraHeaders };
  const selectedCompany = localStorage.getItem('x-company-id');
  if (selectedCompany) {
    headers['x-company-id'] = selectedCompany;
  }
  return headers;
};

export const getAuthParams = () => {
  try {
    const userStr = localStorage.getItem('ziya-user');
    if (userStr) {
      const user = JSON.parse(userStr);
      if (user.role) return `&role=${user.role}`;
    }
  } catch (e) { }
  return '';
};

export const getApiBaseUrl = () => {
  return (import.meta as any).env?.VITE_API_BASE_URL;
};

export const getApiPath = () => {
  return (import.meta as any).env?.VITE_API_PATH;
};

export const fetchCampaigns = async (userId: string) => {
  const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/campaigns?userId=${userId}${getAuthParams()}`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  // Validate content type before parsing JSON
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }
  return response.json();
};

export const fetchScheduledCalls = async (userId: string) => {
  const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/scheduled-calls?userId=${userId}${getAuthParams()}`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }
  return response.json();
};

export const rescheduleCall = async (contactId: string, newTime: string) => {
  const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/scheduled-calls/reschedule`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ contactId, newTime })
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to reschedule lead');
  }
  return response.json();
};

export const deleteScheduledCall = async (contactId: string) => {
  const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/scheduled-calls/${contactId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to delete scheduled call');
  }
  return response.json();
};

export const createCampaign = async (userId: string, name: string, agentId?: string, concurrentCalls?: number, retryAttempts?: number) => {
  const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/campaigns`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ userId, name, agentId, concurrentCalls, retryAttempts })
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  // Validate content type before parsing JSON
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }
  return response.json();
};

export const fetchCampaign = async (id: string, userId: string) => {
  const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/campaigns/${id}?userId=${userId}${getAuthParams()}`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  // Validate content type before parsing JSON
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }
  return response.json();
};

export const updateCampaign = async (id: string, userId: string, data: any) => {
  const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/campaigns/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ userId, ...data })
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to update campaign');
  }
  return response.json();
};

export const setCallerPhone = async (id: string, userId: string, callerPhone: string, agentId?: string) => {
  const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/campaigns/${id}/set-caller-phone`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ userId, callerPhone, agentId })
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  // Validate content type before parsing JSON
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }
  return response.json();
};

// Import CSV content (raw string)
export const importCSV = async (id: string, userId: string, csvContent: string) => {
  const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/campaigns/${id}/import-csv`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ userId, csvContent }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to import CSV');
  }
  return response.json();
};

export const importRecords = async (id: string, userId: string, csvData: any[]) => {
  const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/campaigns/${id}/import`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ userId, csvData })
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  // Validate content type before parsing JSON
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }
  return response.json();
};

export const addRecord = async (id: string, userId: string, phone: string, name?: string, email?: string) => {
  const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/campaigns/${id}/records`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ userId, phone, name, email })
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  // Validate content type before parsing JSON
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }
  return response.json();
};

export const deleteRecord = async (campaignId: string, recordId: string, userId: string) => {
  const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/campaigns/${campaignId}/records/${recordId}`, {
    method: 'DELETE',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ userId })
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  // Validate content type before parsing JSON
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }
  return response.json();
};

// Helper function to transform DB errors to user-friendly messages
const transformCampaignError = (error: any): string => {
  const errorMessage = error.message || '';
  
  // Map backend errors to user-friendly messages
  const errorMap: Record<string, string> = {
    'already running': 'Campaign is already running',
    'already executed': 'Campaign has already been executed',
    'campaign is already': 'Campaign operation in progress',
    'insufficient balance': 'Insufficient credits to start campaign',
    'no pending or retryable contacts': 'No leads to call. Please add leads to the campaign first',
    'no active/verified twilio number': 'No verified phone number. Please configure a Twilio number first',
    'please set a caller phone number': 'Please assign a phone number to this campaign',
    'not found': 'Campaign not found',
    'access denied': 'You do not have permission to access this campaign',
  };

  // Check if error message matches any known error pattern
  const lowerError = errorMessage.toLowerCase();
  for (const [key, value] of Object.entries(errorMap)) {
    if (lowerError.includes(key)) {
      return value;
    }
  }

  // Default friendly message for generic errors
  return 'Failed to process campaign. Please try again.';
};

export const startCampaign = async (id: string, userId: string) => {
  try {
    const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/campaigns/${id}/start`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ userId })
    });
    
    let responseData;
    try {
      responseData = await response.json();
    } catch (e) {
      throw new Error('Server error: Unable to process response');
    }

    if (!response.ok) {
      const errorMessage = responseData?.message || `HTTP error! status: ${response.status}`;
      throw new Error(errorMessage);
    }

    return responseData;
  } catch (error: any) {
    // Re-throw with transformed message
    const userMessage = transformCampaignError(error);
    const customError = new Error(userMessage);
    (customError as any).originalError = error;
    throw customError;
  }
};

export const stopCampaign = async (id: string, userId: string) => {
  try {
    const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/campaigns/${id}/stop`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ userId })
    });

    let responseData;
    try {
      responseData = await response.json();
    } catch (e) {
      throw new Error('Server error: Unable to process response');
    }

    if (!response.ok) {
      const errorMessage = responseData?.message || `HTTP error! status: ${response.status}`;
      throw new Error(errorMessage);
    }

    return responseData;
  } catch (error: any) {
    // Re-throw with transformed message
    const userMessage = transformCampaignError(error);
    const customError = new Error(userMessage);
    (customError as any).originalError = error;
    throw customError;
  }
};

export const fetchRecords = async (id: string, page: number = 1, limit: number = 20) => {
  const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/campaigns/${id}/records?page=${page}&limit=${limit}`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  // Validate content type before parsing JSON
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }
  return response.json();
};

export const deleteCampaign = async (id: string, userId: string) => {
  const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/campaigns/${id}?userId=${userId}${getAuthParams()}`, {
    method: 'DELETE',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' })
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  // Validate content type before parsing JSON
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }
  return response.json();
};

export const updateConcurrentCalls = async (id: string, userId: string, concurrentCalls: number) => {
  const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/campaigns/${id}/concurrent-calls`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ userId, concurrentCalls })
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  // Validate content type before parsing JSON
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from server');
  }
  return response.json();
};