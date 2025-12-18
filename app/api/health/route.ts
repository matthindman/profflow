import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import { getDataDir } from '@/lib/utils/paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const DATA_DIR = getDataDir();
  const health = {
    status: 'healthy',
    checks: {
      dataDirectory: false,
      apiKey: false,
      nodeRuntime: true,
    },
    timestamp: new Date().toISOString(),
    version: '1.8',
    dataDir: DATA_DIR,
  };

  try {
    await fs.access(DATA_DIR);
    health.checks.dataDirectory = true;
  } catch {
    health.status = 'degraded';
  }

  health.checks.apiKey = !!process.env.GEMINI_API_KEY;
  if (!health.checks.apiKey) {
    health.status = 'unhealthy';
  }

  return NextResponse.json(health, {
    status: health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503,
  });
}
