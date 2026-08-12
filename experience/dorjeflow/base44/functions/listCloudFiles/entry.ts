import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { provider, connector_id, query } = body;
    if (!provider || !connector_id) return Response.json({ error: 'provider and connector_id required' }, { status: 400 });
    const { accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(connector_id);
    let files = [];
    if (provider === 'google') {
      let q = "trashed=false and (mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document' or mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType='application/vnd.google-apps.document' or mimeType='application/vnd.google-apps.spreadsheet')";
      if (query) q += ` and name contains '${query.replace(/'/g, "\\'")}'`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&pageSize=100`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await res.json();
      if (!res.ok) return Response.json({ error: data.error?.message || 'list failed' }, { status: res.status });
      files = (data.files || []).map(f => ({ id: f.id, name: f.name, mime: f.mimeType, provider: 'google' }));
    } else if (provider === 'onedrive') {
      let url;
      if (query) {
        url = `https://graph.microsoft.com/v1.0/me/drive/root/microsoft.graph.search(q='${encodeURIComponent(query)}')?$select=name,id,file,folder`;
      } else {
        url = `https://graph.microsoft.com/v1.0/me/drive/root/children?$select=name,id,file,folder`;
      }
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await res.json();
      if (!res.ok) return Response.json({ error: data.error?.message || 'list failed' }, { status: res.status });
      const items = (data.value || []).filter(i => i.file && !i.folder);
      files = items.map(f => ({ id: f.id, name: f.name, mime: f.file?.mimeType || '', provider: 'onedrive' }));
    } else {
      return Response.json({ error: 'unknown provider' }, { status: 400 });
    }
    return Response.json({ files });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}