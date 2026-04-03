import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // This securely creates the connection using the keys you just set up!
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}