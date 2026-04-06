import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/utils/supabase-server'

export default async function Page() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/front/homepage')
  }

  redirect('/auth/login')
}