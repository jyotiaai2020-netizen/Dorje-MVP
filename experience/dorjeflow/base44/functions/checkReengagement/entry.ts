import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    let users = [];
    try {
      const body = await req.json();
      users = Array.isArray(body && body.users) ? body.users : [];
    } catch {
      users = [];
    }
    if (!users.length) return Response.json({ checked: 0, contacted: 0 });

    const cutoff7 = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

    const recentAuditRaw = await base44.asServiceRole.entities.AuditEvent.filter({ created_date: { $gte: cutoff7 } });
    const activeViaAudit = new Set(
      recentAuditRaw.filter(a => a.event_type !== 'we_miss_you_sent').map(a => a.created_by_id).filter(Boolean)
    );

    const recentDocs = await base44.asServiceRole.entities.Document.filter({ updated_date: { $gte: cutoff7 } });
    const activeViaDoc = new Set(recentDocs.map(d => d.created_by_id).filter(Boolean));

    let contacted = 0;
    for (const user of users) {
      if (!user || !user.id) continue;
      const reengaged = activeViaAudit.has(user.id) || activeViaDoc.has(user.id);
      if (!reengaged) continue;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: user.email,
        subject: 'Need help with a specific area?',
        body: [
          `Hi ${user.full_name || 'there'},`,
          ``,
          `Great to see you back in Student-LAD!`,
          `Is there a specific area you'd like help with — an assignment, a plan, a document, or something else?`,
          `Reply and let us know, or ask Dorje directly in the Workspace.`,
          ``,
          `— The Student-LAD team`
        ].join('\n')
      });
      contacted++;
    }

    return Response.json({ checked: users.length, contacted });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}