'use server';

import pool from '@/utils/db';
import { revalidatePath } from 'next/cache';

export async function createRole(formData: FormData) {
  const role_name = formData.get('role_name') as string;
  const description = formData.get('description') as string;
  const question_bank_json = formData.get('question_bank_json') as string || '[]';

  try {
    JSON.parse(question_bank_json);
  } catch (e) {
    return { error: 'Invalid JSON format for Question Bank' };
  }

  try {
    await pool.query(
      `INSERT INTO job_roles (id, role_name, description, panel_size, question_bank_json)
       VALUES (gen_random_uuid(), $1, $2, 1, $3::jsonb)`,
      [role_name, description, question_bank_json]
    );
    revalidatePath('/admin/roles');
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function updateRole(id: string, formData: FormData) {
  const role_name = formData.get('role_name') as string;
  const description = formData.get('description') as string;
  const question_bank_json = formData.get('question_bank_json') as string || '[]';

  try {
    JSON.parse(question_bank_json);
  } catch (e) {
    return { error: 'Invalid JSON format for Question Bank' };
  }

  try {
    await pool.query(
      `UPDATE job_roles 
       SET role_name = $1, description = $2, question_bank_json = $3::jsonb, updated_at = NOW()
       WHERE id = $4`,
      [role_name, description, question_bank_json, id]
    );
    revalidatePath('/admin/roles');
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function deleteRole(id: string) {
  try {
    await pool.query('DELETE FROM job_roles WHERE id = $1', [id]);
    revalidatePath('/admin/roles');
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}
