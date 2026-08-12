import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    const taskId = body.task_id;
    if (!taskId) return Response.json({ error: 'task_id is required' }, { status: 400 });

    const nowIso = new Date().toISOString();
    await base44.asServiceRole.entities.task.update(taskId, {
      last_status_change_at: nowIso,
      stale_notified_at: null
    });
    return Response.json({ task_id: taskId, last_status_change_at: nowIso });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}