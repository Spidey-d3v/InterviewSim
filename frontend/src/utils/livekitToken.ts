import { createClient } from './supabase';

let cachedToken: string | null = null;
let inflight: Promise<string> | null = null;

export async function getLiveKitToken(forceNew = false, role?: string, userId?: string | null): Promise<string> {
  if (!forceNew && cachedToken) return cachedToken;
  if (inflight) return inflight;

  inflight = (async () => {
    // If not passed explicitly, try to grab role from URL
    let currentRole = role;
    if (!currentRole && typeof window !== 'undefined') {
      currentRole = new URLSearchParams(window.location.search).get('role') || undefined;
    }

    let currentUserId = userId;
    if (!currentUserId && typeof window !== 'undefined') {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      currentUserId = data?.user?.id || undefined;
    }

    const params = new URLSearchParams();
    if (currentRole) params.append('role', currentRole);
    if (currentUserId) params.append('user_id', currentUserId);

    const qs = params.toString() ? `?${params.toString()}` : '';
    const TOKEN_URL = `http://localhost:8001/token${qs}`;
    
    const res = await fetch(TOKEN_URL);
    if (!res.ok) throw new Error('Failed to fetch livekit token');
    const body = await res.json();
    const token = (body && typeof body === 'object' && 'token' in body) ? (body as any).token : body;
    cachedToken = token as string;
    inflight = null;
    return token as string;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function clearLiveKitToken() {
  cachedToken = null;
  inflight = null;
}

export function hasLiveKitToken() {
  return !!cachedToken;
}
