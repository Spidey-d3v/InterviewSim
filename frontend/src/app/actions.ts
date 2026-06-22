'use server';

import pool from '@/utils/db';

export async function getRoles() {
  try {
    const res = await pool.query('SELECT role_name FROM job_roles ORDER BY created_at ASC');
    return res.rows.map(row => row.role_name);
  } catch (e) {
    console.error('Failed to fetch roles', e);
    return [];
  }
}
