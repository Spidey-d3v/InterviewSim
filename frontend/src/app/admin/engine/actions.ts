'use server';

import { revalidatePath } from 'next/cache';

export async function updateEngineConfig(formData: FormData) {
  const temperature = parseFloat(formData.get('llm_temperature') as string);
  const maxTokens = parseInt(formData.get('llm_max_tokens') as string, 10);
  const focusThreshold = parseFloat(formData.get('vision_focus_threshold') as string);

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_CONVFLOW_URL}/api/admin/engine`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        llm_temperature: temperature,
        llm_max_tokens: maxTokens,
        vision_focus_threshold: focusThreshold
      })
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    revalidatePath('/admin/engine');
    revalidatePath('/admin');
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}
