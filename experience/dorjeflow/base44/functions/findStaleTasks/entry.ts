import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'skipped']);

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const now = Date.now();
    const cutoff = now - SEVEN_DAYS_MS;

    const tasks = await base44.asServiceRole.entities.task.list('-created_date', 500);
    const userCache = new Map();
    const getUser = async (id) => {
      if (!id) return null;
      if (userCache.has(id)) return userCache.get(id);
      let u = null;
      try { u = await base44.asServiceRole.entities.User.get(id); } catch { u = null; }
      userCache.set(id, u);
      return u;
    };

    const notified = [];
    for (const task of tasks) {
      if (TERMINAL_STATUSES.has(task.status)) continue;
      if (task.stale_notified_at) continue; // already asked this stale cycle

      const lastChange = task.last_status_change_at
        ? new Date(task.last_status_change_at).getTime()
        : new Date(task.created_date).getTime();
      if (isNaN(lastChange) || lastChange > cutoff) continue; // status changed within 7 days

      const owner = await getUser(task.created_by_id);
      const ownerEmail = owner && owner.email;
      if (ownerEmail) {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: ownerEmail,
          subject: `Status update needed: ${task.title}`,
          body: [
            `Hi ${owner.full_name || 'there'},`,
            ``,
            `Your task "${task.title}" hasn't had a status change in 7 days and is still active.`,
            `Please reply with an update on its progress.`,
            ``,
            `— Student-LAD`
          ].join('\n')
        });
      }

      const nowIso = new Date(now).toISOString();
      await base44.asServiceRole.entities.task.update(task.id, { stale_notified_at: nowIso });
      notified.push({ id: task.id, title: task.title, owner_email: ownerEmail, area_id: task.area_id });
    }

    return Response.json({ tasks: notified, count: notified.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}