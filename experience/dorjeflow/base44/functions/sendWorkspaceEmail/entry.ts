import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const to = body.to;
    const subject = body.subject;
    const emailBody = body.body || '';
    const attachmentName = body.attachment_name;
    if (!to || !subject) return Response.json({ error: 'to and subject required' }, { status: 400 });
    let fullBody = emailBody;
    if (attachmentName) {
      fullBody += `\n\n— Attached document: ${attachmentName} (open the Documents page in the app to view or download)`;
    }
    await base44.integrations.Core.SendEmail({ to, subject, body: fullBody });
    return Response.json({ sent: true, to });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}