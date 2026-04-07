'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';

type AccountView = {
  id: string;
  name: string;
  email: string;
  username: string;
  avatar: string;
  avatarColor: string;
  joined: string;
};

function initialsFromName(name: string, email: string) {
  if (name.trim()) {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'U';
  }
  return (email?.slice(0, 2) || 'U').toUpperCase();
}

function hashColor(seed: string) {
  const palette = ['#8b5cf6', '#ec4899', '#22c55e', '#60a5fa', '#f59e0b', '#f97316'];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

function formatJoined(dateMaybe?: string) {
  if (!dateMaybe) return 'Recently';
  const date = new Date(dateMaybe);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<AccountView | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        router.replace('/auth/login');
        return;
      }

      const user = data.user;
      const name =
        (user.user_metadata?.full_name as string | undefined) ||
        (user.user_metadata?.name as string | undefined) ||
        (user.email?.split('@')[0] ?? 'User');
      const username =
        (user.user_metadata?.username as string | undefined) ||
        name.toLowerCase().replace(/\s+/g, '');

      setAccount({
        id: user.id,
        name,
        email: user.email ?? 'unknown@example.com',
        username,
        avatar: initialsFromName(name, user.email ?? ''),
        avatarColor: hashColor(user.id),
        joined: formatJoined(user.created_at),
      });
      setLoading(false);
    };

    load();
  }, [router, supabase.auth]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    document.cookie = 'app_session_expires_at=; Path=/; Max-Age=0; SameSite=Lax';
    router.push('/auth/login');
  };

  if (loading || !account) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        Loading profile...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,black,transparent)]" />
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(600px_circle_at_80%_20%,rgba(139,92,246,0.12),transparent_45%),radial-gradient(500px_circle_at_20%_80%,rgba(236,72,153,0.1),transparent_45%)]" />
      </div>

      <nav className="relative z-20 px-6 py-6 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center font-bold text-sm">
            AI
          </div>
          <span className="text-xl font-bold tracking-tight">InterviewAR</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/front/homepage')}
            className="px-4 py-2 border border-gray-700 text-sm rounded-lg hover:border-gray-500 transition-colors"
          >
            Back to Home
          </button>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 bg-white text-black text-sm font-medium rounded-lg hover:bg-gray-100 transition-all"
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="relative z-10 max-w-4xl mx-auto px-6 py-10">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden">
          <div
            className="h-28"
            style={{
              background: `linear-gradient(135deg, ${account.avatarColor}44, rgba(139,92,246,0.18), rgba(236,72,153,0.12))`,
            }}
          />
          <div className="px-6 pb-8">
            <div className="flex items-end gap-4 -mt-10 mb-5">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-xl font-bold text-black ring-4 ring-[#0a0a0f]"
                style={{ backgroundColor: account.avatarColor }}
              >
                {account.avatar}
              </div>
              <div className="pb-1 min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-white">{account.name}</h1>
                <p className="text-sm text-gray-400">@{account.username}</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Email</p>
                <p className="text-sm text-gray-200 break-all">{account.email}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Member Since</p>
                <p className="text-sm text-gray-200">{account.joined}</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
