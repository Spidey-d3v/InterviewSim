'use server';

import { revalidatePath } from 'next/cache';

export async function updatePrompt(id: string, prompt_text: string) {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_CONVFLOW_URL}/api/admin/prompts/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt_text })
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    revalidatePath('/admin/prompts');
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}
