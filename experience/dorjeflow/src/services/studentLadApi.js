const environment = import.meta.env || {};
const configuredProvider = environment.VITE_RUNTIME_PROVIDER;
export const runtimeProvider = configuredProvider === 'base44' ? 'base44' : 'student-lad';

const apiRoot = (environment.VITE_STUDENT_LAD_API_URL || 'http://127.0.0.1:8100/api/v1').replace(/\/$/, '');

export class StudentLadApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'StudentLadApiError';
    this.status = status;
    this.body = body;
  }
}

async function request(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${apiRoot}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!response.ok) {
    const detail = typeof body === 'object' && body?.detail ? body.detail : `Request failed (${response.status})`;
    throw new StudentLadApiError(detail, response.status, body);
  }
  return body;
}

export function toDorjeTask(task) {
  const due = task.dueAt || task.due_at || null;
  const dueDate = due ? new Date(due) : null;
  return {
    id: task.id,
    title: task.title,
    area: task.category || 'Academic',
    time: dueDate && !Number.isNaN(dueDate.valueOf()) ? dueDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Open',
    duration: task.estimatedMinutes || 30,
    due: dueDate && !Number.isNaN(dueDate.valueOf()) ? dueDate.toLocaleDateString() : 'Unscheduled',
    priority: task.priority || 'normal',
    status: task.status === 'active' ? 'planned' : task.status,
    color: task.sensitive ? 'coral' : 'blue',
    points: Math.max(1, Math.round((task.progressPercent || 20) / 20)),
    dependsOn: null,
    authoritative: true,
  };
}

export const studentLadApi = {
  auth: {
    me: () => request('/auth/me'),
    login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: ({ email, password, fullName }) => request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, full_name: fullName }) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
  },
  tasks: {
    list: async () => {
      const result = await request('/tasks?scope=all');
      return (result?.items || []).map(toDorjeTask);
    },
    create: async (task) => {
      const reminder = await request('/reminders', {
        method: 'POST',
        body: JSON.stringify({ title: task.title, priority: task.priority === 'medium' ? 'normal' : task.priority || 'normal', source: 'dorjeflow' }),
      });
      return toDorjeTask(reminder);
    },
    setCompleted: (id, completed) => request(`/reminders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: completed ? 'completed' : 'active' }),
    }),
  },
  actions: {
    preview: (message, source = 'text') => request('/kamal/actions/preview', { method: 'POST', body: JSON.stringify({ message, source }) }),
    execute: (action) => request('/kamal/actions/execute', { method: 'POST', body: JSON.stringify({ action }) }),
    undo: (undoToken) => request('/kamal/actions/undo', { method: 'POST', body: JSON.stringify({ undo_token: undoToken }) }),
  },
};
