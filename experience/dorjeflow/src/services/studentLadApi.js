const environment = import.meta.env || {};
const configuredProvider = environment.VITE_RUNTIME_PROVIDER;
export const runtimeProvider = configuredProvider === 'base44' ? 'base44' : 'student-lad';

const apiRoot = (environment.VITE_STUDENT_LAD_API_URL || 'http://127.0.0.1:8100/api/v1').replace(/\/$/, '');
const TOKEN_KEY = 'lotus_token';

function authorizationHeaders() {
  const token = typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function refreshAccessToken() {
  const response = await fetch(`${apiRoot}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json' } });
  if (!response.ok) {
    if (typeof window !== 'undefined') window.localStorage.removeItem(TOKEN_KEY);
    return null;
  }
  const result = await response.json().catch(() => ({}));
  if (!result?.access_token) return null;
  if (typeof window !== 'undefined') window.localStorage.setItem(TOKEN_KEY, result.access_token);
  return result.access_token;
}

async function authenticatedFetch(url, options = {}) {
  const { skipAuthRefresh, ...fetchOptions } = options;
  const initialHeaders = { ...authorizationHeaders(), ...(fetchOptions.headers || {}) };
  let response = await fetch(url, { ...fetchOptions, headers: initialHeaders, credentials: 'include' });
  if (response.status !== 401 || skipAuthRefresh) return response;
  const token = await refreshAccessToken();
  if (!token) throw new StudentLadApiError('Your Student-LAD session has expired. Sign in at this DorjeFlow address, then try again.', 401, null);
  response = await fetch(url, { ...fetchOptions, credentials: 'include', headers: { ...(fetchOptions.headers || {}), Authorization: `Bearer ${token}` } });
  return response;
}

export class StudentLadApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'StudentLadApiError';
    this.status = status;
    this.body = body;
  }
}

async function request(path, options = {}) {
  const headers = { Accept: 'application/json', ...authorizationHeaders(), ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await authenticatedFetch(`${apiRoot}${path}`, {
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

async function analyzeAttachment({ filename, instruction, text_content, content_type }) {
  const extractedText = typeof text_content === 'string' ? text_content.trim() : '';
  if (extractedText.length < 20) throw new StudentLadApiError('At least 20 characters of extracted document text are required.', 422, null);
  if (extractedText.length > 50_000) throw new StudentLadApiError('Extracted document text must not exceed 50,000 characters.', 413, null);
  const response = await authenticatedFetch(`${apiRoot}/dorje-ai/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'text/plain', 'Content-Type': 'application/json', ...authorizationHeaders() },
    body: JSON.stringify({
      message: instruction || 'Summarize this document with key points and suggested next steps.',
      conversation_id: 'dorjeflow-attachment-review',
      mode: 'Fast Chat',
      files: [{ name: filename, type: content_type || 'text/plain', content: extractedText, source_label: 'Locally extracted by DorjeFlow' }],
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try { detail = JSON.parse(text)?.detail || detail; } catch { /* plain error body */ }
    throw new StudentLadApiError(detail, response.status, text);
  }
  return { response: text };
}

async function generateWorkspaceText(message) {
  const response = await authenticatedFetch(`${apiRoot}/dorje-ai/chat`, {
    method: 'POST', credentials: 'include', headers: { Accept: 'text/plain', 'Content-Type': 'application/json', ...authorizationHeaders() },
    body: JSON.stringify({ message, conversation_id: 'dorjeflow-workspace', mode: 'Fast Chat', files: [] }),
  });
  const text = await response.text();
  if (!response.ok) throw new StudentLadApiError(`Workspace AI request failed (${response.status}).`, response.status, text);
  if (!text.trim()) throw new StudentLadApiError('Workspace AI returned an empty response.', 502, null);
  return text;
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
    login: async (email, password) => {
      const result = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }), skipAuthRefresh: true });
      if (!result?.access_token) throw new StudentLadApiError('Student-LAD did not return an access token.', 502, result);
      window.localStorage.setItem(TOKEN_KEY, result.access_token);
      return result;
    },
    register: ({ email, password, fullName }) => request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, full_name: fullName }), skipAuthRefresh: true }),
    logout: async () => {
      try { return await request('/auth/logout', { method: 'POST' }); }
      finally { window.localStorage.removeItem(TOKEN_KEY); }
    },
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
  attachments: { analyze: analyzeAttachment },
  ai: { generate: generateWorkspaceText },
};
