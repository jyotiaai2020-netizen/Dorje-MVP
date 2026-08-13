export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_EXTRACTED_CHARACTERS = 50_000;
export const MIN_EXTRACTED_CHARACTERS = 20;

function normalizeExtractedText(text) {
  return String(text || '').replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function validateFile(file) {
  if (!file) throw new Error('Choose a PDF, DOCX, or text document.');
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error('Documents must be 10 MB or smaller.');
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith('.pdf') && !lowerName.endsWith('.docx') && !/\.(?:txt|md|csv|json)$/i.test(lowerName)) {
    throw new Error('Only PDF, DOCX, TXT, Markdown, CSV, and JSON documents are supported.');
  }
}

function validateExtractedText(text) {
  const normalized = normalizeExtractedText(text);
  if (normalized.length < MIN_EXTRACTED_CHARACTERS) {
    throw new Error('No readable text was found. The document may be image-only, encrypted, empty, or damaged.');
  }
  if (normalized.length > MAX_EXTRACTED_CHARACTERS) {
    throw new Error('The document contains more than 50,000 characters. Split it into smaller documents before analysis.');
  }
  return normalized;
}

async function extractPdfText(file) {
  const [pdfjs, workerModule] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
  const bytes = new Uint8Array(await file.arrayBuffer());
  let document;
  try {
    document = await pdfjs.getDocument({ data: bytes }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str || '').join(' '));
    }
    return pages.join('\n\n');
  } catch (error) {
    if (/password/i.test(error?.name || '') || /password|encrypted/i.test(error?.message || '')) {
      throw new Error('Password-protected PDFs cannot be analyzed. Remove the password locally and try again.');
    }
    throw new Error(`The PDF could not be read locally. ${error?.message || 'It may be damaged or use an unsupported format.'}`);
  } finally {
    await document?.destroy?.();
  }
}

async function extractDocxText(file) {
  const mammoth = await import('mammoth/mammoth.browser');
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value;
  } catch {
    throw new Error('The DOCX file could not be read locally. It may be damaged or password-protected.');
  }
}

export async function extractDocumentText(file) {
  validateFile(file);
  const lowerName = file.name.toLowerCase();
  const text = lowerName.endsWith('.pdf')
    ? await extractPdfText(file)
    : lowerName.endsWith('.docx')
      ? await extractDocxText(file)
      : await file.text();
  return {
    name: file.name,
    type: file.type || (lowerName.endsWith('.pdf') ? 'application/pdf' : lowerName.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/plain'),
    text: validateExtractedText(text),
  };
}
