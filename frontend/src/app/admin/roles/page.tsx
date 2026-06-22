import React from 'react';
import pool from '@/utils/db';
import RolesClient from './RolesClient';

export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  let roles: any[] = [];
  let errorMsg = null;
  
  try {
    const res = await pool.query('SELECT * FROM job_roles ORDER BY created_at DESC');
    roles = res.rows;
  } catch (err: any) {
    errorMsg = err.message;
  }

  if (errorMsg) {
    return <div className="text-red-500 p-8">Error loading roles: {errorMsg}</div>;
  }

  return <RolesClient roles={roles} />;
}
