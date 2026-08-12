import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { content, edit_prompt } = body;
    if (!edit_prompt) return Response.json({ error: 'edit_prompt required' }, { status: 400 });
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are editing a document. Apply the user's instructions to the existing content and return the FULL updated document only — no explanations, no markdown fences.

Instructions: """${edit_prompt}"""

Existing content:
"""${content || ''}"""`
    });
    return Response.json({ content: result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}