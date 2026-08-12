import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { filename, instruction, text_content } = await req.json();
    if (!filename) return Response.json({ error: 'filename required' }, { status: 400 });
    if (typeof text_content !== 'string' || text_content.trim().length < 20) return Response.json({ error: 'At least 20 characters of extracted document text are required.' }, { status: 422 });
    if (text_content.length > 50_000) return Response.json({ error: 'Extracted document text must not exceed 50,000 characters.' }, { status: 413 });

    const prompt = `${instruction || 'Review this document.'}

Provide a concise summary, key points, and suggested next steps. Base every statement on the supplied document. If content is unreadable or missing, say so instead of inventing details.

    Document name: ${filename}\n\nExtracted document text:\n${text_content}`;
    const result = await base44.integrations.Core.InvokeLLM({ prompt });
    const response = typeof result === 'string' ? result : result?.response || result?.data?.response || '';
    if (!response) return Response.json({ error: 'The document produced no readable response.' }, { status: 422 });
    return Response.json({ response });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to analyze attachment.' }, { status: 500 });
  }
}
