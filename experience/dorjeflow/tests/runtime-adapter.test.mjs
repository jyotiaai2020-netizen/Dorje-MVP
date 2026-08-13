import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runtimeProvider, studentLadApi, toDorjeTask } from '../src/services/studentLadApi.js';
import { extractDocumentText, MAX_DOCUMENT_BYTES } from '../src/services/workspaceAttachment.js';

test('standalone builds select the Student-LAD core by default', () => {
  assert.equal(runtimeProvider, 'student-lad');
});

test('authoritative API tasks map into the DorjeFlow view model', () => {
  const task = toDorjeTask({ id: 'task-1', title: 'Review biology rubric', category: 'academic', status: 'active', priority: 'high', progressPercent: 60, sensitive: false });
  assert.equal(task.id, 'task-1');
  assert.equal(task.status, 'planned');
  assert.equal(task.authoritative, true);
  assert.equal(task.points, 3);
});

test('workspace attachments extract supported text locally and enforce size limits', async () => {
  const extracted = await extractDocumentText(new File(['Grounded project leadership experience and delivery outcomes.'], 'resume.txt', { type: 'text/plain' }));
  assert.match(extracted.text, /project leadership/);
  await assert.rejects(
    extractDocumentText({ name: 'large.pdf', size: MAX_DOCUMENT_BYTES + 1 }),
    /10 MB or smaller/,
  );
});

test('Student-LAD attachment analysis sends extracted document content to Dorje chat', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return new Response('Grounded document summary', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  };
  try {
    const result = await studentLadApi.attachments.analyze({ filename: 'resume.pdf', instruction: 'Summarize it', text_content: 'Project leadership experience', content_type: 'application/pdf' });
    assert.equal(result.response, 'Grounded document summary');
    assert.match(captured.url, /\/dorje-ai\/chat$/);
    const body = JSON.parse(captured.options.body);
    assert.equal(body.files[0].name, 'resume.pdf');
    assert.equal(body.files[0].content, 'Project leadership experience');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('attachment analysis has no Base44 upload, LLM, or function dependency', async () => {
  const workspaceAssistant = await readFile(new URL('../src/components/WorkspaceAssistant.jsx', import.meta.url), 'utf8');
  const attachmentWorkflow = workspaceAssistant.slice(workspaceAssistant.indexOf('const handleAttach'), workspaceAssistant.indexOf('const send ='));
  assert.doesNotMatch(attachmentWorkflow, /UploadFile|file_url|integrations\.Core\.InvokeLLM|functions\/analyzeAttachment/);
  assert.match(attachmentWorkflow, /studentLadApi\.attachments\.analyze/);
});

test('Workspace Assistant core document commands have no Base44 dependency', async () => {
  const workspaceAssistant = await readFile(new URL('../src/components/WorkspaceAssistant.jsx', import.meta.url), 'utf8');
  const interpreter = await readFile(new URL('../src/functions/interpretCommand.js', import.meta.url), 'utf8');
  const creator = await readFile(new URL('../src/functions/createDocument.js', import.meta.url), 'utf8');
  assert.doesNotMatch(`${workspaceAssistant}\n${interpreter}\n${creator}`, /base44|invokeBase44Function|integrations\.Core/);
  const { interpretCommand } = await import('../src/functions/interpretCommand.js');
  const result = await interpretCommand({ command: 'Create a Python script to reverse a string' });
  assert.equal(result.data.action.action, 'create_document');
  assert.equal(result.data.action.file_type, 'py');
  assert.match(result.data.action.content, /return value\[::-1\]/);
});
