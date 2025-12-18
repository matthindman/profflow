import { NextRequest } from 'next/server';

const ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

const EXTRA_ORIGINS = process.env.PROFFLOW_ALLOWED_ORIGINS
  ?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean) ?? [];

const ALL_ALLOWED = [...ALLOWED_ORIGINS, ...EXTRA_ORIGINS];

export function validateOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const host = req.headers.get('host');
  if (origin && ALL_ALLOWED.includes(origin)) {
    return true;
  }
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
      if (ALL_ALLOWED.includes(refererOrigin)) {
        return true;
      }
    } catch {
      return false;
    }
  }
  if (!origin && !referer && host) {
    if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) {
      return true;
    }
  }

  return false;
}

export function requireValidOrigin(req: NextRequest): void {
  if (!validateOrigin(req)) {
    throw new Error('Invalid origin - request blocked for security');
  }
}
