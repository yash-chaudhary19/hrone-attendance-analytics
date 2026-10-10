import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

export const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Interceptor to format errors consistently
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    let message = 'An unexpected error occurred.';
    if (error.response) {
      const data = error.response.data;
      if (data) {
        if (typeof data.detail === 'string') {
          message = data.detail;
        } else if (Array.isArray(data.detail)) {
          // FastAPI validation error format
          message = data.detail
            .map((err) => `${err.loc ? err.loc.join('.') : 'field'}: ${err.msg}`)
            .join(' | ');
        } else if (data.message) {
          message = data.message;
        }
      }
    } else if (error.request) {
      message = 'Backend API is currently unreachable. Please ensure the server is running on ' + baseURL;
    } else {
      message = error.message;
    }
    return Promise.reject(new Error(message));
  }
);

// 1. System
export const checkHealth = async () => {
  const res = await apiClient.get('/health');
  return res.data;
};

// 2. Employees
export const getEmployees = async (params = {}) => {
  const res = await apiClient.get('/employees', { params });
  return res.data; // { items, total, page, page_size }
};

export const createEmployee = async (data) => {
  const res = await apiClient.post('/employees', data);
  return res.data;
};

// 3. Attendance
export const listAttendance = async (params = {}) => {
  const res = await apiClient.get('/attendance', { params });
  return res.data; // { items, total, page, page_size }
};

export const punchIn = async (data) => {
  const res = await apiClient.post('/attendance/punch-in', data);
  return res.data;
};

export const punchOut = async (data) => {
  const res = await apiClient.post('/attendance/punch-out', data);
  return res.data;
};

export const regularizeAttendance = async (empCode, dateStr, data) => {
  const res = await apiClient.patch(`/attendance/${empCode}/${dateStr}`, data);
  return res.data;
};

// 4. Analytics
export const getEmployeeMonthly = async (empCode, month) => {
  const res = await apiClient.get(`/analytics/employees/${empCode}/monthly`, {
    params: { month },
  });
  return res.data;
};

export const getDepartmentSummary = async (month, department) => {
  const params = { month };
  if (department) params.department = department;
  const res = await apiClient.get('/analytics/departments/summary', { params });
  return res.data;
};

export const getLateLeaderboard = async (month, limit = 10, department = null) => {
  const params = { month, limit };
  if (department) params.department = department;
  const res = await apiClient.get('/analytics/leaderboard/late', { params });
  return res.data;
};

export const getDepartmentTrend = async (department, fromDate, toDate) => {
  const res = await apiClient.get(`/analytics/departments/${encodeURIComponent(department)}/trend`, {
    params: { from: fromDate, to: toDate },
  });
  return res.data;
};

// 5. Admin Explain
export const getExplain = async (endpoint, params = {}) => {
  const res = await apiClient.get(`/admin/explain/${endpoint}`, { params });
  return res.data;
};
