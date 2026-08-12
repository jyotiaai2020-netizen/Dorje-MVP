import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const ids = body.connector_ids || [];
    const status = {};
    for (const id of ids) {
      try {
        await base44.asServiceRole.connectors.getCurrentAppUserConnection(id);
        status[id] = true;
      } catch {
        status[id] = false;
      }
    }
    return Response.json({ status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}