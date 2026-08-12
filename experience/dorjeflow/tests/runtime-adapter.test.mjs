import assert from 'node:assert/strict';
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
