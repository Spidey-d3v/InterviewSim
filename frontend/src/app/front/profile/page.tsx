import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/utils/supabase-server';
import DashboardClient from './DashboardClient';

export const metadata = {
  title: 'Mission Control | InterviewAR',
  description: 'AI-driven performance analytics and interview history.',
};

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();


  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Fetch past interview sessions for the user from local API
  let sessions = [];
  try {
    const sessRes = await fetch(`${process.env.NEXT_PUBLIC_CONVFLOW_URL}/api/sessions/${user.id}`, { cache: 'no-store' });
    if (sessRes.ok) sessions = await sessRes.json();
  } catch (err) {
    console.error('❌ Error fetching sessions:', err);
  }

  // Fetch user profile from local API
  let profile = null;
  try {
    const profRes = await fetch(`${process.env.NEXT_PUBLIC_CONVFLOW_URL}/api/profile/${user.id}`, { cache: 'no-store' });
    if (profRes.ok) profile = await profRes.json();
  } catch (err) {
    console.error('❌ Error fetching profile:', err);
  }

  return (
    <DashboardClient 
      sessions={sessions || []} 
      profile={profile}
      userId={user.id}
    />
  );
}
