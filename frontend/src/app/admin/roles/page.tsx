import React from 'react';
import RolesClient from './RolesClient';

export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  let roles: any[] = [];
  let errorMsg = null;
  
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_CONVFLOW_URL}/api/admin/roles`, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    roles = await res.json();
  } catch (err: any) {
    errorMsg = err.message;
  }

  if (errorMsg) {
    return <div className="text-red-500 p-8">Error loading roles: {errorMsg}</div>;
  }

  return <RolesClient roles={roles} />;
}
