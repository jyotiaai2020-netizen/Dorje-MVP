import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const command = body.command;
    if (!command) return Response.json({ error: 'command required' }, { status: 400 });

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are the command interpreter for a personal assistant app called Student-LAD. Parse the user's natural-language command into ONE structured action and return JSON only.

Supported actions:
- create_document: create a text/code file. Set title, file_type (txt|md|py|csv|json|html), and full content.
- edit_document: rewrite existing document content per instructions. Set edit_prompt describing the change.
- send_email: draft an email. Set to (email), subject, body, and optional attachment_name (a document name).
- list_documents: list the user's saved documents.
- open_file: open an existing Word/Excel file from a cloud drive. Set provider ("google" or "onedrive") and filename (the file name or search term the user mentioned).
- save_to_cloud: save the currently open file to a cloud drive. Set provider ("google" or "onedrive").
- list_cloud_files: list the user's files on a cloud drive. Set provider ("google" or "onedrive").
- answer: general question or chat. Set reply with a helpful response.

Rules:
- For create_document, write complete, useful content (never placeholders).
- For send_email, draft a clear subject and body.
- For open_file / save_to_cloud / list_cloud_files, default provider to "google" if the user says "google" or "drive"; to "onedrive" if they say "onedrive", "microsoft", or "office". If unspecified, use "google".
- Return only JSON matching the schema.

User command: """${command}"""`,
      response_json_schema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create_document", "edit_document", "send_email", "list_documents", "open_file", "save_to_cloud", "list_cloud_files", "answer"] },
          title: { type: "string" },
          file_type: { type: "string" },
          content: { type: "string" },
          edit_prompt: { type: "string" },
          to: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
          attachment_name: { type: "string" },
          provider: { type: "string", enum: ["google", "onedrive"] },
          filename: { type: "string" },
          reply: { type: "string" },
          confidence: { type: "number" }
        },
        required: ["action"]
      }
    });
    return Response.json({ action: result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}