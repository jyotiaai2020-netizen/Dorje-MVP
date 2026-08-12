import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'skipped']);

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const now = Date.now();

    const tasks = await base44.asServiceRole.entities.task.list('-created_date', 500);

    let remindersSent = 0;
    let escalations = 0;
    const userCache = new Map();

    const getUser = async (id) => {
      if (!id) return null;
      if (userCache.has(id)) return userCache.get(id);
      let u = null;
      try { u = await base44.asServiceRole.entities.User.get(id); } catch { u = null; }
      userCache.set(id, u);
      return u;
    };

    for (const task of tasks) {
      if (!task.due_at) continue;
      const due = new Date(task.due_at).getTime();
      if (isNaN(due)) continue;
      if (due >= now) continue;            // not overdue yet
      if (TERMINAL_STATUSES.has(task.status)) continue;

      const owner = await getUser(task.created_by_id);
      const ownerEmail = owner && owner.email;

      // 1. Reminder to the user.
      if (ownerEmail) {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: ownerEmail,
          subject: `Overdue task reminder: ${task.title}`,
          body: [
            `Hi ${owner.full_name || 'there'},`,
            ``,
            `Your task "${task.title}" was due on ${task.due_at} and is still incomplete.`,
            `Please update its status or complete it as soon as possible.`,
            ``,
            `— Student-LAD`
          ].join('\n')
        });
        remindersSent++;
      }

      // 2. Escalate after 3 more days overdue.
      const overdueMs = now - due;
      if (overdueMs >= THREE_DAYS_MS && task.priority !== 'critical') {
        const managerEmail = owner && owner.manager_email;
        if (managerEmail) {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: managerEmail,
            subject: `Escalation: overdue task "${task.title}"`,
            body: [
              `Hi,`,
              ``,
              `Task "${task.title}" assigned to ${ownerEmail || 'a team member'} is now ${Math.floor(overdueMs / DAY_MS)} days overdue and remains incomplete.`,
              `The task priority has been raised to Critical for your review.`,
              ``,
              `— Student-LAD`
            ].join('\n')
          });
        }
        await base44.asServiceRole.entities.task.update(task.id, { priority: 'critical' });
        escalations++;
      }
    }

    return Response.json({ processed: tasks.length, reminders_sent: remindersSent, escalations });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}