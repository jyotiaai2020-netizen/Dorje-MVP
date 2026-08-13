const STORAGE_KEY = 'dorjeflow_workspace_documents';

function readDocuments() {
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function writeDocuments(documents) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(documents.slice(0, 100)));
}

export const localWorkspaceDocuments = {
  list() {
    return readDocuments().sort((a, b) => String(b.updated_date).localeCompare(String(a.updated_date)));
  },
  create({ name, content = '', file_type = 'txt', area = 'Workspace' }) {
    const now = new Date().toISOString();
    const document = { id: `DOC-${Date.now()}-${Math.random().toString(16).slice(2)}`, name, content, file_type, area, status: 'Draft', created_date: now, updated_date: now };
    writeDocuments([document, ...readDocuments()]);
    return document;
  },
  update(id, changes) {
    let updated = null;
    const documents = readDocuments().map((document) => {
      if (document.id !== id) return document;
      updated = { ...document, ...changes, updated_date: new Date().toISOString() };
      return updated;
    });
    if (!updated) throw new Error('The selected local document no longer exists.');
    writeDocuments(documents);
    return updated;
  },
};
