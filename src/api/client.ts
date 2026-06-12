// Simple robust API client wrapper for Construction Project Management ERP
const API_BASE = '/api';

export function getAuthToken(): string | null {
  return localStorage.getItem('erp_token');
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem('erp_token', token);
  } else {
    localStorage.removeItem('erp_token');
  }
}

export function getCurrentUser() {
  const userJson = localStorage.getItem('erp_user');
  if (userJson) {
    try {
      return JSON.parse(userJson);
    } catch {
      return null;
    }
  }
  return null;
}

export function setCurrentUser(user: any): void {
  if (user) {
    localStorage.setItem('erp_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('erp_user');
  }
}

async function request(endpoint: string, options: RequestInit = {}) {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errMsg = 'Something went wrong';
    try {
      const data = await response.json();
      errMsg = data.error || errMsg;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  return response.json();
}

export const api = {
  // Auth
  login: (credentials: any) => request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  me: () => request('/auth/me'),
  
  // Users
  getUsers: () => request('/users'),
  createUser: (userData: any) => request('/users', { method: 'POST', body: JSON.stringify(userData) }),
  toggleUserStatus: (id: string, status: string) => request(`/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateProfile: (profileData: any) => request('/users/profile', { method: 'PUT', body: JSON.stringify(profileData) }),

  // Projects
  getProjects: () => request('/projects'),
  createProject: (p: any) => request('/projects', { method: 'POST', body: JSON.stringify(p) }),
  updateProject: (id: string, p: any) => request(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(p) }),
  deleteProject: (id: string) => request(`/projects/${id}`, { method: 'DELETE' }),

  // Tasks
  getTasks: (projectId?: string) => request(`/tasks${projectId ? `?projectId=${projectId}` : ''}`),
  createTask: (t: any) => request('/tasks', { method: 'POST', body: JSON.stringify(t) }),
  updateTask: (id: string, t: any) => request(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(t) }),
  deleteTask: (id: string) => request(`/tasks/${id}`, { method: 'DELETE' }),

  // Expenses
  getExpenses: (projectId?: string, taskId?: string) => {
    let q = '';
    if (projectId || taskId) {
      const params = new URLSearchParams();
      if (projectId) params.append('projectId', projectId);
      if (taskId) params.append('taskId', taskId);
      q = `?${params.toString()}`;
    }
    return request(`/expenses${q}`);
  },
  createExpense: (e: any) => request('/expenses', { method: 'POST', body: JSON.stringify(e) }),
  updateExpense: (id: string, e: any) => request(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(e) }),
  deleteExpense: (id: string) => request(`/expenses/${id}`, { method: 'DELETE' }),

  // Crew
  getCrew: (status?: 'active' | 'inactive') => {
    const q = status ? `?status=${status}` : '';
    return request(`/crew${q}`);
  },
  createCrewMember: (data: any) => request('/crew', { method: 'POST', body: JSON.stringify(data) }),
  bulkCrew: (data: { members: any[] }) => request('/crew/bulk', { method: 'POST', body: JSON.stringify(data) }),
  updateCrewMember: (id: string, data: any) => request(`/crew/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCrewMember: (id: string) => request(`/crew/${id}`, { method: 'DELETE' }),

  // Attendance
  getAttendance: (projectId?: string, taskId?: string, date?: string) => {
    const params = new URLSearchParams();
    if (projectId) params.append('projectId', projectId);
    if (taskId) params.append('taskId', taskId);
    if (date) params.append('date', date);
    return request(`/attendance?${params.toString()}`);
  },
  createAttendance: (a: any) => request('/attendance', { method: 'POST', body: JSON.stringify(a) }),
  bulkAttendance: (data: any) => request('/attendance/bulk', { method: 'POST', body: JSON.stringify(data) }),
  updateAttendance: (id: string, a: any) => request(`/attendance/${id}`, { method: 'PUT', body: JSON.stringify(a) }),
  deleteAttendance: (id: string) => request(`/attendance/${id}`, { method: 'DELETE' }),

  // Payments
  getPayments: (projectId?: string, taskId?: string) => {
    const params = new URLSearchParams();
    if (projectId) params.append('projectId', projectId);
    if (taskId) params.append('taskId', taskId);
    return request(`/payments?${params.toString()}`);
  },
  createPayment: (p: any) => request('/payments', { method: 'POST', body: JSON.stringify(p) }),
  updatePayment: (id: string, p: any) => request(`/payments/${id}`, { method: 'PUT', body: JSON.stringify(p) }),
  deletePayment: (id: string) => request(`/payments/${id}`, { method: 'DELETE' }),

  // Accountant
  getOfficeFunds: () => request('/office/funds'),
  postOfficeFund: (data: any) => request('/office/funds', { method: 'POST', body: JSON.stringify(data) }),
  getPaymentRequests: () => request('/payment-requests'),
  createPaymentRequest: (data: any) => request('/payment-requests', { method: 'POST', body: JSON.stringify(data) }),
  updatePaymentRequest: (id: string, data: any) => request(`/payment-requests/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePaymentRequest: (id: string) => request(`/payment-requests/${id}`, { method: 'DELETE' }),

  // Reports Summary
  getReportSummary: () => request('/reports/summary')
};
