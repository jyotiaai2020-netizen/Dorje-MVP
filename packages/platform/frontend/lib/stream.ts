export async function readTextStream(
  response: Response,
  onChunk: (chunk: string) => void,
): Promise<string> {
  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || data.message || `Request failed (${response.status})`);
    }
    throw new Error((await response.text()) || `Request failed (${response.status})`);
  }

  if (!response.body) {
    const text = await response.text();
    onChunk(text);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let complete = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) {
      complete += chunk;
      onChunk(chunk);
    }
  }

  const finalChunk = decoder.decode();
  if (finalChunk) {
    complete += finalChunk;
    onChunk(finalChunk);
  }
  return complete;
}
