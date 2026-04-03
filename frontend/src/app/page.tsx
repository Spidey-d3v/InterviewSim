'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Page() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to login on first load
    router.push('/login');
  }, [router]);

  return null;
}