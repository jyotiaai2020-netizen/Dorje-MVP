import { NextRequest, NextResponse } from 'next/server';


export function GET(request: NextRequest) {
  const frontendPort = request.nextUrl.port;
  const editionBackendPort = frontendPort === '3100' ? '8100' : frontendPort === '3200' ? '8200' : frontendPort === '3300' ? '8300' : '8000';
  const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? `${request.nextUrl.protocol}//${request.nextUrl.hostname}:${editionBackendPort}`;
  const isRegistration = request.nextUrl.searchParams.get('state')?.startsWith('auth.');
  const callback = new URL(isRegistration ? '/api/v1/auth/google/callback' : '/api/v1/oauth/google/callback', backendUrl);
  request.nextUrl.searchParams.forEach((value, key) => callback.searchParams.append(key, value));
  return NextResponse.redirect(callback);
}
