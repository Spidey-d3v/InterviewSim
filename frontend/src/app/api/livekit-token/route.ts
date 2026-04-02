import { NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? '';
const LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'ws://localhost:7880';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const identity = searchParams.get('identity') ?? 'candidate-1';
    const name = searchParams.get('name') ?? 'Candidate';
    const room = searchParams.get('room') ?? 'interview-room';

    // Validate configuration
    if (!LIVEKIT_API_SECRET) {
      console.error('[LiveKit Token] ERROR: LIVEKIT_API_SECRET not configured');
      return NextResponse.json(
        { 
          error: 'LiveKit API secret not configured',
          hint: 'Add LIVEKIT_API_SECRET to .env.local'
        },
        { status: 500 },
      );
    }

    if (!LIVEKIT_API_KEY) {
      console.error('[LiveKit Token] ERROR: LIVEKIT_API_KEY not configured');
      return NextResponse.json(
        { 
          error: 'LiveKit API key not configured',
          hint: 'Add LIVEKIT_API_KEY to .env.local'
        },
        { status: 500 },
      );
    }

    console.log('[LiveKit Token] Generating token:', { identity, name, room, url: LIVEKIT_URL });

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      name,
      ttl: '2h',
    });

    at.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();
    
    console.log('[LiveKit Token] Token generated successfully');

    return NextResponse.json({ 
      token, 
      url: LIVEKIT_URL,
      apiKey: LIVEKIT_API_KEY,
      room,
      identity,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[LiveKit Token] ERROR:', message);
    
    return NextResponse.json(
      { 
        error: message,
        hint: 'Check server logs and ensure LIVEKIT_API_SECRET is valid'
      },
      { status: 500 },
    );
  }
}
