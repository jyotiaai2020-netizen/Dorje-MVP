import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

function toBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { provider, connector_id, file_id, mime } = body;
    if (!provider || !connector_id || !file_id) return Response.json({ error: 'provider, connector_id, file_id required' }, { status: 400 });
    const { accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(connector_id);
    let res;
    let outMime = mime;
    if (provider === 'google') {
      if (mime === 'application/vnd.google-apps.document') {
        outMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        res = await fetch(`https://www.googleapis.com/drive/v3/files/${file_id}/export?mimeType=${encodeURIComponent(outMime)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      } else if (mime === 'application/vnd.google-apps.spreadsheet') {
        outMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        res = await fetch(`https://www.googleapis.com/drive/v3/files/${file_id}/export?mimeType=${encodeURIComponent(outMime)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      } else {
        res = await fetch(`https://www.googleapis.com/drive/v3/files/${file_id}?alt=media`, { headers: { Authorization: `Bearer ${accessToken}` } });
      }
    } else {
      res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${file_id}/content`, { headers: { Authorization: `Bearer ${accessToken}` } });
    }
    if (!res.ok) return Response.json({ error: 'download failed' }, { status: res.status });
    const buf = new Uint8Array(await res.arrayBuffer());
    return Response.json({ base64: toBase64(buf), mime: outMime || 'application/octet-stream' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}