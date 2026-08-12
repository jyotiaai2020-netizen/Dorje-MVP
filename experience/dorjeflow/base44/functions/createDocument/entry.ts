import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { name, content, file_type, area } = body;
    if (!name) return Response.json({ error: 'name required' }, { status: 400 });
    const doc = await base44.entities.Document.create({
      name,
      content: content || '',
      file_type: file_type || 'txt',
      area: area || 'Workspace',
      status: 'Draft'
    });
    return Response.json({ document: doc });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}