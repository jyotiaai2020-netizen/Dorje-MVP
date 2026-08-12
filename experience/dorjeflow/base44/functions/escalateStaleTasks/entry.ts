import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'skipped']);

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    const tasks = Array.isArray(body && body.tasks) ? body.tasks : [];
    if (!tasks.length) return Response.json({ checked: 0, escalated: 0 });

    const areaCache = new Map();
    const getArea = async (id) => {
      if (!id) return null;
      if (areaCache.has(id)) return areaCache.get(id);
      let a = null;
      try { a = await base44.asServiceRole.entities.area.get(id); } catch { a = null; }
      areaCache.set(id, a);
      return a;
    };

    let escalated = 0;
    for (const item of tasks) {
      if (!item || !item.id) continue;
      const task = await base44.asServiceRole.entities.task.get(item.id);
      if (TERMINAL_STATUSES.has(task.status)) continue; // resolved after notification

      const lastChange = task.last_status_change_at
        ? new Date(task.last_status_change_at).getTime()
        : new Date(task.created_date).getTime();
      const notifiedAt = task.stale_notified_at ? new Date(task.stale_notified_at).getTime() : 0;
      if (lastChange > notifiedAt) continue; // owner replied (status changed since notification)

      const area = task.area_id ? await getArea(task.area_id) : null;
      const managerEmail = area && area.manager_email;
      if (managerEmail) {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: managerEmail,
          subject: `Escalation: stale task "${task.title}"`,
          body: [
            `Hi,`,
            ``,
            `Task "${task.title}" has been active without a status update for over 7 days, and the owner did not respond to a status-update request within 48 hours.`,
            `Please review and follow up.`,
            ``,
            `— Student-LAD`
          ].join('\n')
        });
        escalated++;
      }
    }

    return Response.json({ checked: tasks.length, escalated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}