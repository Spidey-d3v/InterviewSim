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

  // Fetch data concurrently for faster loading
  let sessions = [];
  let profile = null;

  try {
    const [sessRes, profRes] = await Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_CONVFLOW_URL}/api/sessions/${user.id}`, { cache: 'no-store' }),
      fetch(`${process.env.NEXT_PUBLIC_CONVFLOW_URL}/api/profile/${user.id}`, { cache: 'no-store' })
    ]);

    if (sessRes.ok) sessions = await sessRes.json();
    if (profRes.ok) profile = await profRes.json();
  } catch (err) {
    console.error('Error fetching dashboard data:', err);
  }

  return (
    <DashboardClient 
      sessions={sessions || []} 
      profile={profile}
      userId={user.id}
    />
  );
}
