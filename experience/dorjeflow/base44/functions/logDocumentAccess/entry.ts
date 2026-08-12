import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    const documentId = body.document_id;
    if (!documentId) return Response.json({ error: 'document_id is required' }, { status: 400 });

    const document = await base44.entities.Document.get(documentId);

    // 1. Audit every access.
    const audit = await base44.entities.AuditEvent.create({
      event_type: 'document_accessed',
      target_type: 'Document',
      target_id: document.id,
      description: `Document "${document.name}" accessed by ${user.email}.`,
      severity: document.confidential ? 'warning' : 'info',
      metadata: {
        document_name: document.name,
        area: document.area || null,
        confidential: !!document.confidential,
        accessor_id: user.id,
        accessor_email: user.email,
        accessor_area: user.area || null
      }
    });

    // 2. Confidential breach: confidential doc accessed by a non-admin outside its assigned area.
    const docArea = document.area || null;
    const userArea = user.area || null;
    const isAdmin = user.role === 'admin';
    const outsideArea = docArea !== null && userArea !== null && docArea !== userArea;

    let breach = false;
    if (document.confidential && outsideArea && !isAdmin) {
      breach = true;

      // Notify all admins.
      const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
      const adminEmails = admins.map(a => a.email).filter(Boolean);
      for (const adminEmail of adminEmails) {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: adminEmail,
          subject: `Confidential document breach: ${document.name}`,
          body: [
            `Confidential document "${document.name}" (assigned area: ${docArea}) was accessed by ${user.email} (area: ${userArea || 'none'}).`,
            ``,
            `The document has been locked and a justification request has been added to the user's dashboard.`,
            ``,
            `— Student-LAD security`
          ].join('\n')
        });
      }

      // Lock the document.
      await base44.asServiceRole.entities.Document.update(document.id, { locked: true });

      // Add a justification action request to the accessing user's dashboard.
      await base44.asServiceRole.entities.ActionRequest.create({
        title: `Justify access to confidential document: ${document.name}`,
        description: `You accessed the confidential document "${document.name}" (assigned area: ${docArea}). Please justify the reason for this access so an admin can review it.`,
        status: 'open',
        assignee_email: user.email,
        project_lead_email: adminEmails[0] || ''
      });
    }

    return Response.json({ audit_event_id: audit.id, breach, locked: breach });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}