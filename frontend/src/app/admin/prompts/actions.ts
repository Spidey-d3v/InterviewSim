'use server';

import pool from '@/utils/db';
import { revalidatePath } from 'next/cache';

export async function updatePrompt(id: string, prompt_text: string) {
  try {
    await pool.query(
      `UPDATE interview_prompts 
       SET prompt_text = $1, updated_at = NOW()
       WHERE id = $2`,
      [prompt_text, id]
    );
    revalidatePath('/admin/prompts');
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}
