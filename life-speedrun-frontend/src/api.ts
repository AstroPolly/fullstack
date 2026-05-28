// src/api.ts
const API_BASE = 'http://localhost:8000';

const handleResponse = async (res: Response) => {
  if (!res.ok) {
    const contentType = res.headers.get('content-type');
    let errorData: any;
    try {
      errorData = contentType?.includes('application/json') 
        ? await res.json() 
        : await res.text();
    } catch {
      errorData = await res.text();
    }
    
    // Логируем только то, что реально есть у Response
    console.error('❌ API Error Details:', {
      status: res.status,
      statusText: res.statusText,
      url: res.url,
      body: errorData
    });
    
    // Формируем читаемое сообщение для UI
    const message = 
      errorData?.detail?.[0]?.msg ||  // FastAPI validation error (первая ошибка)
      errorData?.detail ||              // FastAPI simple error
      errorData?.msg ||
      (typeof errorData === 'string' ? errorData : `HTTP ${res.status}`);
      
    throw new Error(message);
  }
  return res.json();
};

export interface EventPayload {
  title: string;
  startTime: string;
  endTime: string;
  date: string;
  isRange: boolean;
  isRecurring: boolean;
  recurrenceDays: number;
  reminder: boolean;
  reminderMinutes: number;
  color: string;
  description: string | null;
  tags: number[];
}

export interface Event {
  id: number;
  title: string;
  startTime: string;
  endTime: string;
  date: string;
  isRange: boolean;
  isRecurring: boolean;
  recurrenceDays: number;
  reminder: boolean;
  reminderMinutes: number;
  color: string;
  description: string | null;
  tags: number[];
  completed: boolean;
  notes: string | null;
  duration_seconds: number | null;
}

export interface FileInfo {
  id: number;
  file_name: string;
  file_size: number;
  content_type: string;
  created_at: string;
}

export interface FileUploadResponse {
  id: number;
  file_name: string;
  file_size: number;
  content_type: string;
  download_url: string;
  created_at: string;
}

export interface PaginatedEvents {
  items: Event[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface EventsQueryParams {
  page?: number;
  page_size?: number;
  search?: string;
  completed?: boolean;
  color?: string;
  date_from?: string;
  date_to?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export const api = {
  // Auth
  register: async (email: string, password: string) => {
  const res = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }, // ← обязательно!
    body: JSON.stringify({ email, password })
  });
  return handleResponse(res);
  },

  verify: (email: string, code: string) =>
    fetch(`${API_BASE}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    }).then(handleResponse),

  login: async (email: string, password: string) => {
  const formData = new URLSearchParams();
  formData.append('username', email);  // ← было 'email', надо 'username'!
  formData.append('password', password);
  
  const res = await fetch(`${API_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString()
  });
  return handleResponse(res);
  },

  me: (token: string) =>
    fetch(`${API_BASE}/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(handleResponse),

  // Events with filtering, search, sorting, pagination
  getEvents: (token: string, params: EventsQueryParams = {}) => {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.page_size) queryParams.append('page_size', params.page_size.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.completed !== undefined) queryParams.append('completed', params.completed.toString());
    if (params.color) queryParams.append('color', params.color);
    if (params.date_from) queryParams.append('date_from', params.date_from);
    if (params.date_to) queryParams.append('date_to', params.date_to);
    if (params.sort_by) queryParams.append('sort_by', params.sort_by);
    if (params.sort_order) queryParams.append('sort_order', params.sort_order);
    
    return fetch(`${API_BASE}/events?${queryParams.toString()}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(handleResponse) as Promise<PaginatedEvents>;
  },

  // Legacy getEventsByDate for backward compatibility
  getEventsByDate: (token: string, date: string) =>
    fetch(`${API_BASE}/events?date=${date}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(handleResponse),

  createEvent: (token: string, event: EventPayload) =>
    fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    }).then(handleResponse),

  updateEvent: (token: string, eventId: number, updateData: {
    actual_start_time?: string;
    actual_end_time?: string;
    completed?: boolean;
    notes?: string;
  }) =>
    fetch(`${API_BASE}/events/${eventId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    }).then(handleResponse),

  deleteEvent: (token: string, eventId: number) =>
    fetch(`${API_BASE}/events/${eventId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(handleResponse),

  // Files
  uploadFile: (token: string, eventId: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetch(`${API_BASE}/events/${eventId}/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    }).then(handleResponse) as Promise<FileUploadResponse>;
  },

  getEventFiles: (token: string, eventId: number) =>
    fetch(`${API_BASE}/events/${eventId}/files`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(handleResponse) as Promise<FileInfo[]>,

  downloadFile: (token: string, url: string) =>
    fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    }),

  deleteFile: (token: string, eventId: number, fileId: number) =>
    fetch(`${API_BASE}/events/${eventId}/files/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(handleResponse),

  // Token helpers
  setToken: (token: string) => localStorage.setItem('jwt_token', token),
  getToken: () => localStorage.getItem('jwt_token'),
  clearToken: () => localStorage.removeItem('jwt_token')
};