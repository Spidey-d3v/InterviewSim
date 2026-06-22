'use server';

import pool from '@/utils/db';
import { revalidatePath } from 'next/cache';

export async function updateEngineConfig(formData: FormData) {
  const temperature = parseFloat(formData.get('llm_temperature') as string);
  const maxTokens = parseInt(formData.get('llm_max_tokens') as string, 10);
  const focusThreshold = parseFloat(formData.get('vision_focus_threshold') as string);

  try {
    await pool.query(
      `UPDATE engine_configs 
       SET llm_temperature = $1, llm_max_tokens = $2, vision_focus_threshold = $3, updated_at = NOW()
       WHERE id = 1`,
      [temperature, maxTokens, focusThreshold]
    );
    revalidatePath('/admin/engine');
    revalidatePath('/admin');
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}
