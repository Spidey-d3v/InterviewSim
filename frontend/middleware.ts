import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type NextResponseCookieSetOptions = Parameters<
  ReturnType<typeof NextResponse.next>['cookies']['set']
>[2]

type CookieToSet = {
  name: string
  value: string
  options?: NextResponseCookieSetOptions
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isAuthRoute = pathname.startsWith('/auth')
  const isFrontRoute = pathname.startsWith('/front')
  const isAdminRoute = pathname.startsWith('/admin')

  const expiresAtValue = request.cookies.get('app_session_expires_at')?.value
  const expiresAt = expiresAtValue ? Number(expiresAtValue) : null
  const isExpired = !expiresAt || Number.isNaN(expiresAt) || Date.now() >= expiresAt

  if (isExpired && (isFrontRoute || isAdminRoute)) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    const redirectResponse = NextResponse.redirect(url)
    redirectResponse.cookies.delete('app_session_expires_at')
    return redirectResponse
  }

  if (!user && (isFrontRoute || isAdminRoute)) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // Admin Route Protection
  if (user && isAdminRoute) {
    const adminEmails = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : ['gaurav.ghosh.23cse@bmu.edu.in'];
    const userEmail = user.email || '';
    
    // If user is not in the admin list, redirect to home page or show 403
    if (!adminEmails.includes(userEmail)) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
  }

  if (user && isAuthRoute && !isExpired) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/', '/auth/:path*', '/front/:path*', '/admin/:path*'],
}
