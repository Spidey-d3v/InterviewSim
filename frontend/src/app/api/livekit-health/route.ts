import { NextResponse } from 'next/server';

const LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'ws://localhost:7880';

export async function GET() {
  try {
    // Verify credentials are configured
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw new Error('LiveKit credentials not configured (missing API_KEY or API_SECRET)');
    }

    if (!LIVEKIT_URL) {
      throw new Error('LIVEKIT_URL not configured');
    }

    // Parse and validate URL
    const url = new URL(LIVEKIT_URL);
    const host = url.hostname || 'localhost';
    const port = url.port ? parseInt(url.port) : 7880;

    console.log('[LiveKit Health Check] SUCCESS: Environment configured correctly');

    return NextResponse.json({
      status: 'ok',
      livekit_url: LIVEKIT_URL,
      server: { host, port },
      credentials_configured: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[LiveKit Health Check] FAILED:', message);

    return NextResponse.json({
      status: 'error',
      livekit_url: LIVEKIT_URL,
      error: message,
      timestamp: new Date().toISOString(),
    }, { status: 503 });
  }
}
