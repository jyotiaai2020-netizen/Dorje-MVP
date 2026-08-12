import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const THIRTY_SEVEN_DAYS_MS = 37 * 24 * 60 * 60 * 1000;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const now = Date.now();
    const cutoff30 = new Date(now - THIRTY_DAYS_MS).toISOString();
    const cutoff37 = new Date(now - THIRTY_SEVEN_DAYS_MS).toISOString();

    const users = await base44.asServiceRole.entities.User.list();

    // Activity = audit event (excluding our own we_miss_you markers) or document update in last 30 days.
    const recentAuditRaw = await base44.asServiceRole.entities.AuditEvent.filter({ created_date: { $gte: cutoff30 } });
    const activeViaAudit = new Set(
      recentAuditRaw.filter(a => a.event_type !== 'we_miss_you_sent').map(a => a.created_by_id).filter(Boolean)
    );

    const recentDocs = await base44.asServiceRole.entities.Document.filter({ updated_date: { $gte: cutoff30 } });
    const activeViaDoc = new Set(recentDocs.map(d => d.created_by_id).filter(Boolean));

    // Don't re-spam users already sent a we-miss-you within the 30+7 day window.
    const sentMarkers = await base44.asServiceRole.entities.AuditEvent.filter({
      event_type: 'we_miss_you_sent',
      created_date: { $gte: cutoff37 }
    });
    const alreadySent = new Set(sentMarkers.map(m => m.metadata && m.metadata.user_id).filter(Boolean));

    const emailed = [];
    for (const user of users) {
      if (activeViaAudit.has(user.id) || activeViaDoc.has(user.id)) continue;
      if (alreadySent.has(user.id)) continue;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: user.email,
        subject: 'We miss you at Student-LAD',
        body: [
          `Hi ${user.full_name || 'there'},`,
          ``,
          `We noticed it's been a little while since you last used Student-LAD.`,
          `Your areas, plans, and documents are right where you left them — and Dorje is ready to help whenever you are.`,
          ``,
          `Come back whenever you're ready.`,
          ``,
          `— The Student-LAD team`
        ].join('\n')
      });

      await base44.asServiceRole.entities.AuditEvent.create({
        event_type: 'we_miss_you_sent',
        target_type: 'User',
        target_id: user.id,
        description: 'We miss you email sent to a user with no audit event or document update in 30 days.',
        severity: 'info',
        metadata: { user_id: user.id, email: user.email }
      });

      emailed.push({ id: user.id, email: user.email, full_name: user.full_name });
    }

    return Response.json({ users: emailed, count: emailed.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}