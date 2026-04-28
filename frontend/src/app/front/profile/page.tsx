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

  // Fetch past interview sessions for the user
  const { data: sessions, error } = await supabase
    .from('interview_sessions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching sessions:', error);
  }

  // Fetch user profile for personalizing the dashboard
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return (
    <DashboardClient 
      sessions={sessions || []} 
      profile={profile}
      userId={user.id}
    />
  );
}
