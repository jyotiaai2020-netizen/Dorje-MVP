import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('http://127.0.0.1:3199/', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Attachment extraction test</title>' }));
  await page.goto('/');
});

test('extracts PDF text locally without an upload request', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => {
    if (/upload|UploadFile/i.test(request.url())) requests.push(request.url());
  });
  const extracted = await page.evaluate(async () => {
    // Older Safari/WebKit versions do not expose ReadableStream.prototype.values.
    // PDF extraction must not depend on that newer stream-iteration API.
    if (globalThis.ReadableStream?.prototype) {
      Object.defineProperty(globalThis.ReadableStream.prototype, 'values', { configurable: true, value: undefined });
    }
    const [{ jsPDF }, { extractDocumentText }] = await Promise.all([
      import('/@id/jspdf'),
      import('/src/services/workspaceAttachment.js'),
    ]);
    const document = new jsPDF();
    document.text('Jyoti led cross-functional delivery and product operations.', 20, 20);
    const file = new File([document.output('arraybuffer')], 'resume.pdf', { type: 'application/pdf' });
    return extractDocumentText(file);
  });
  expect(extracted.text).toContain('cross-functional delivery');
  expect(requests).toEqual([]);
});

test('extracts DOCX text locally and rejects oversized documents', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const [{ Document, Packer, Paragraph }, { extractDocumentText, MAX_DOCUMENT_BYTES }] = await Promise.all([
      import('/@id/docx'),
      import('/src/services/workspaceAttachment.js'),
    ]);
    const document = new Document({ sections: [{ children: [new Paragraph('Technical program management and stakeholder leadership.')] }] });
    const blob = await Packer.toBlob(document);
    const extracted = await extractDocumentText(new File([blob], 'profile.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    let oversizedError = '';
    try {
      await extractDocumentText({ name: 'oversized.pdf', size: MAX_DOCUMENT_BYTES + 1 });
    } catch (error) {
      oversizedError = error.message;
    }
    return { text: extracted.text, oversizedError };
  });
  expect(result.text).toContain('stakeholder leadership');
  expect(result.oversizedError).toContain('10 MB or smaller');
});
