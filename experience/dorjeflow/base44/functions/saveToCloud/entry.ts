import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { file_url, name, provider, connector_id, file_id } = body;
    if (!provider || !connector_id) return Response.json({ error: 'provider and connector_id required' }, { status: 400 });
    if (!file_id && (!file_url || !name)) return Response.json({ error: 'file_url+name or file_id required' }, { status: 400 });

    let arrayBuffer;
    let contentType = 'application/octet-stream';

    if (file_id) {
      // Update existing file: fetch current content from the editor via file_url
      if (file_url) {
        const fileRes = await fetch(file_url);
        if (!fileRes.ok) return Response.json({ error: 'Failed to fetch file' }, { status: 502 });
        arrayBuffer = await fileRes.arrayBuffer();
        contentType = fileRes.headers.get('content-type') || contentType;
      } else {
        arrayBuffer = new ArrayBuffer(0);
      }
    } else {
      const fileRes = await fetch(file_url);
      if (!fileRes.ok) return Response.json({ error: 'Failed to fetch file' }, { status: 502 });
      arrayBuffer = await fileRes.arrayBuffer();
      contentType = fileRes.headers.get('content-type') || contentType;
    }

    const { accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(connector_id);

    if (provider === 'google') {
      if (file_id) {
        // Update existing file content
        const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${file_id}?uploadType=media&fields=id,webViewLink`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': contentType },
          body: arrayBuffer
        });
        const data = await res.json();
        if (!res.ok) return Response.json({ error: data.error?.message || 'Drive update failed' }, { status: res.status });
        return Response.json({ id: data.id, link: data.webViewLink, updated: true });
      }
      const boundary = 'boundary_' + Math.random().toString(36).slice(2);
      const encoder = new TextEncoder();
      const metadataPart = encoder.encode(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name })}\r\n`
      );
      const fileHeader = encoder.encode(`--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`);
      const fileBytes = new Uint8Array(arrayBuffer);
      const closing = encoder.encode(`\r\n--${boundary}--\r\n`);
      const payload = new Uint8Array(metadataPart.length + fileHeader.length + fileBytes.length + closing.length);
      payload.set(metadataPart, 0);
      payload.set(fileHeader, metadataPart.length);
      payload.set(fileBytes, metadataPart.length + fileHeader.length);
      payload.set(closing, metadataPart.length + fileHeader.length + fileBytes.length);
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: payload
      });
      const data = await res.json();
      if (!res.ok) return Response.json({ error: data.error?.message || 'Drive upload failed' }, { status: res.status });
      return Response.json({ id: data.id, link: data.webViewLink });
    }

    if (provider === 'onedrive') {
      if (file_id) {
        const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${file_id}/content`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': contentType },
          body: arrayBuffer
        });
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) return Response.json({ error: data?.error?.message || 'OneDrive update failed' }, { status: res.status });
        return Response.json({ id: data?.id, link: data?.webUrl, updated: true });
      }
      const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(name)}:/content`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': contentType },
        body: arrayBuffer
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) return Response.json({ error: data?.error?.message || 'OneDrive upload failed' }, { status: res.status });
      return Response.json({ id: data?.id, link: data?.webUrl });
    }

    return Response.json({ error: 'unknown provider' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}