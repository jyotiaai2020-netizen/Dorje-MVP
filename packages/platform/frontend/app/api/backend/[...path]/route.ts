const DEFAULT_BACKEND_URL = 'https://student-lad-production.up.railway.app';

const HOP_BY_HOP_REQUEST_HEADERS = [
  'connection',
  'content-length',
  'host',
  'transfer-encoding',
];

const REWRITTEN_RESPONSE_HEADERS = [
  'content-encoding',
  'content-length',
  'transfer-encoding',
];

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function backendBaseUrl(): URL {
  const configured = process.env.BACKEND_API_URL || DEFAULT_BACKEND_URL;
  const url = new URL(configured);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('BACKEND_API_URL must use HTTP or HTTPS.');
  }
  return url;
}

async function proxyRequest(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(
    path.map(encodeURIComponent).join('/'),
    `${backendBaseUrl().toString().replace(/\/$/, '')}/`,
  );
  upstreamUrl.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  HOP_BY_HOP_REQUEST_HEADERS.forEach((header) => headers.delete(header));

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const upstream = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    cache: 'no-store',
    redirect: 'manual',
  });

  const responseHeaders = new Headers(upstream.headers);
  REWRITTEN_RESPONSE_HEADERS.forEach((header) => responseHeaders.delete(header));
  responseHeaders.set('cache-control', 'no-store');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const HEAD = proxyRequest;
export const OPTIONS = proxyRequest;
