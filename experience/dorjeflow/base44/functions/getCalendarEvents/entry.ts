import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const PROVIDER_COLOR = {
  internal: 'teal',
  google: 'violet',
  microsoft: 'blue',
  outlook: 'blue'
};

const toHHMM = (iso) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const toISODate = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // User-scoped tasks + areas define what this user owns.
    const tasks = await base44.entities.task.list('-created_date', 500);
    const areas = await base44.entities.area.list('-created_date', 500);
    const taskIds = new Set(tasks.map((t) => t.id));
    const areaIds = new Set(areas.map((a) => a.id));

    // Service-role ScheduleEvents include workflow-synced ones (created by the system).
    const all = await base44.asServiceRole.entities.ScheduleEvent.list('-created_date', 500);
    const mine = all.filter(
      (e) =>
        (e.task_id && taskIds.has(e.task_id)) ||
        (e.area_id && areaIds.has(e.area_id)) ||
        e.created_by_id === user.id
    );

    const events = mine
      .filter((e) => e.starts_at && e.ends_at && e.status !== 'cancelled')
      .map((e) => ({
        id: 'sync-' + e.id,
        title: e.title,
        date: toISODate(e.starts_at),
        start: toHHMM(e.starts_at),
        end: toHHMM(e.ends_at),
        color: PROVIDER_COLOR[e.provider] || 'teal',
        synced: true,
        source: e.provider || 'internal'
      }));

    return Response.json({ events });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}