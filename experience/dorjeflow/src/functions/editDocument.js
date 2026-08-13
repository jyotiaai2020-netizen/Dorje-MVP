import { studentLadApi } from '@/services/studentLadApi';

export async function editDocument({ content, edit_prompt }) {
  const updated = await studentLadApi.ai.generate(`Apply the editing instruction and return only the complete updated document, without commentary or markdown fences.\n\nInstruction: ${edit_prompt}\n\nExisting document:\n${content || ''}`);
  return { data: { content: updated } };
}
