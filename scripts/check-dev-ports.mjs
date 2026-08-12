#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const started = [];

const services = [
  {
    name: 'backend',
    label: 'Backend API',
    url: 'http://127.0.0.1:8100/api/v1/health',
    cwd: resolve(root, 'packages/platform/backend'),
    command: resolve(root, 'packages/platform/backend/.venv/bin/uvicorn'),
    args: ['app.main:app', '--host', '127.0.0.1', '--port', '8100'],
    timeoutMs: 45_000,
    validate: async (response) => response.ok && (await response.json()).status === 'healthy',
  },
  {
    name: 'frontend',
    label: 'Student-LAD frontend',
    url: 'http://127.0.0.1:3100/login',
    cwd: resolve(root, 'packages/platform/frontend'),
    command: 'npm',
    args: ['run', 'dev', '--', '--hostname', '127.0.0.1', '--port', '3100'],
    timeoutMs: 120_000,
    validate: async (response) => {
      if (!response.ok) return false;
      const text = await response.text();
      return text.includes('<html') && (text.includes('Sign in') || text.includes('__next'));
    },
  },
];

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function fetchWithTimeout(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function isHealthy(service) {
  try {
    const response = await fetchWithTimeout(service.url);
    return await service.validate(response);
  } catch {
    return false;
  }
}

function startService(service) {
  console.log(`Starting ${service.label} on ${service.url}...`);
  const child = spawn(service.command, service.args, {
    cwd: service.cwd,
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  started.push({ service, child });
  child.stdout.on('data', (chunk) => process.stdout.write(`[${service.name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${service.name}] ${chunk}`));
  return child;
}

async function waitUntilHealthy(service) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < service.timeoutMs) {
    if (await isHealthy(service)) return true;
    await sleep(1000);
  }
  return false;
}

async function ensureService(service) {
  if (await isHealthy(service)) {
    console.log(`✓ ${service.label} is healthy at ${service.url}`);
    return;
  }
  startService(service);
  if (!(await waitUntilHealthy(service))) {
    throw new Error(`${service.label} did not become healthy at ${service.url}`);
  }
  console.log(`✓ ${service.label} is healthy at ${service.url}`);
}

async function shutdownStartedServices() {
  for (const { child } of started.reverse()) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await sleep(500);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  }
}

process.on('SIGINT', async () => {
  await shutdownStartedServices();
  process.exit(130);
});

try {
  for (const service of services) await ensureService(service);
  console.log('✓ Dev port health check passed: frontend 3100 and backend 8100 are fully functional.');
} catch (error) {
  console.error(`✗ Dev port health check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await shutdownStartedServices();
}
