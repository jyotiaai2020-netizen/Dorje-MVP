import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    // Scheduled workflow job — runs with service-role access, no end-user session.
    const openRequests = await base44.asServiceRole.entities.ActionRequest.filter({ status: 'open' });

    let followupsSent = 0;
    let escalations = 0;
    const nowIso = new Date().toISOString();

    for (const request of openRequests) {
      const count = request.followup_count || 0;

      if (count < 3) {
        // Still within the follow-up window: remind the assignee.
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: request.assignee_email,
          subject: `Follow-up needed: ${request.title}`,
          body: [
            `Hi,`,
            ``,
            `This is a friendly reminder that action request "${request.title}" is still open.`,
            `Description: ${request.description || '(no description provided)'}`,
            ``,
            `This is follow-up ${count + 1} of 3. Please provide an update or close the request.`,
            ``,
            `— Student-LAD`
          ].join('\n')
        });
        await base44.asServiceRole.entities.ActionRequest.update(request.id, {
          followup_count: count + 1,
          last_followup_date: nowIso
        });
        followupsSent++;
      } else {
        // Three follow-ups already sent and still open: escalate.
        await base44.asServiceRole.entities.AuditEvent.create({
          event_type: 'action_request_escalation',
          target_type: 'ActionRequest',
          target_id: request.id,
          description: `Action request "${request.title}" remains open after 3 follow-ups. Escalated to project lead.`,
          severity: 'high',
          metadata: {
            title: request.title,
            assignee_email: request.assignee_email,
            project_lead_email: request.project_lead_email,
            followup_count: count,
            last_followup_date: request.last_followup_date
          }
        });
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: request.project_lead_email,
          subject: `Escalation: "${request.title}" still open after 3 follow-ups`,
          body: [
            `Hi,`,
            ``,
            `Action request "${request.title}" remains open after 3 follow-up emails to ${request.assignee_email}.`,
            `Description: ${request.description || '(no description provided)'}`,
            ``,
            `An audit event has been recorded. Please review, reassign, or intervene as needed.`,
            ``,
            `— Student-LAD`
          ].join('\n')
        });
        escalations++;
      }
    }

    return Response.json({
      processed: openRequests.length,
      followups_sent: followupsSent,
      escalations
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}