const REVERSE_STRING_SCRIPT = `def reverse_string(value: str) -> str:
    """Return a reversed copy of value."""
    return value[::-1]


if __name__ == "__main__":
    text = input("Enter a string: ")
    print(reverse_string(text))
`;

export async function interpretCommand({ command }) {
  const text = String(command || '').trim();
  const lower = text.toLowerCase();
  if (/\b(list|show)\b.*\b(documents?|files?)\b/.test(lower)) return { data: { action: { action: 'list_documents' } } };
  if (/\b(create|make|write)\b.*\bpython\b.*\b(reverse|reversing)\b.*\bstring\b/.test(lower)) {
    return { data: { action: { action: 'create_document', title: 'reverse_string', file_type: 'py', content: REVERSE_STRING_SCRIPT } } };
  }
  const createMatch = text.match(/\b(?:create|make|write)\s+(?:a\s+)?(?:document|file|note)\s+(?:called|named)?\s*["“]?([^"”]+?)["”]?(?:\s+with\s+content\s+(.+))?$/i);
  if (createMatch) return { data: { action: { action: 'create_document', title: createMatch[1].trim(), file_type: 'txt', content: createMatch[2]?.trim() || '' } } };
  if (/\b(edit|revise|rewrite|change)\b/.test(lower)) return { data: { action: { action: 'edit_document', edit_prompt: text } } };
  const emailMatch = text.match(/\b(?:draft|write|compose)\b.*\bemail\b(?:\s+to\s+([^\s]+))?/i);
  if (emailMatch) return { data: { action: { action: 'send_email', to: emailMatch[1] || '', subject: 'Draft email', body: text } } };
  return { data: { action: { action: 'answer', reply: 'I can create and edit local documents, list files, summarize attachments, and prepare email drafts. Please include the document type and requested content.' } } };
}
