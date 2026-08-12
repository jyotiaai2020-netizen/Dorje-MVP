import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'skipped']);

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { source_type, source_id } = body;
    if (!source_type || !source_id) {
      return Response.json({ error: 'source_type and source_id are required' }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    const synced = [];

    const syncTask = async (task) => {
      if (!task || !task.due_at) return null;
      const due = new Date(task.due_at);
      if (isNaN(due.getTime())) return null;
      const dur = task.estimated_minutes || 30;
      const end = new Date(due.getTime() + dur * 60000);
      const cancelled = TERMINAL_STATUSES.has(task.status);
      const payload = {
        title: task.title,
        starts_at: due.toISOString(),
        ends_at: end.toISOString(),
        status: cancelled ? 'cancelled' : 'confirmed',
        task_id: task.id,
        area_id: task.area_id || null,
        provider: 'internal',
        sync_state: 'synced'
      };
      const existing = await svc.entities.ScheduleEvent.filter({ task_id: task.id });
      if (existing.length > 0) {
        return await svc.entities.ScheduleEvent.update(existing[0].id, payload);
      }
      return await svc.entities.ScheduleEvent.create(payload);
    };

    if (source_type === 'task') {
      const task = await svc.entities.task.get(source_id);
      const res = await syncTask(task);
      if (res) synced.push(res.id);
    } else if (source_type === 'area') {
      const tasks = await svc.entities.task.filter({ area_id: source_id });
      for (const t of tasks) {
        const res = await syncTask(t);
        if (res) synced.push(res.id);
      }
    } else {
      return Response.json({ error: 'source_type must be "task" or "area"' }, { status: 400 });
    }

    return Response.json({ synced, count: synced.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}