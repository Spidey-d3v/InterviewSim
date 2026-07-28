'use server';

import { revalidatePath } from 'next/cache';

export async function createRole(formData: FormData) {
  const role_name = formData.get('role_name') as string;
  const description = formData.get('description') as string;
  const question_bank_json = formData.get('question_bank_json') as string || '[]';

  let parsedBank = [];
  try {
    parsedBank = JSON.parse(question_bank_json);
  } catch (e) {
    return { error: 'Invalid JSON format for Question Bank' };
  }

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_CONVFLOW_URL}/api/admin/roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role_name,
        description,
        question_bank_json: parsedBank
      })
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
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

  let parsedBank = [];
  try {
    parsedBank = JSON.parse(question_bank_json);
  } catch (e) {
    return { error: 'Invalid JSON format for Question Bank' };
  }

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_CONVFLOW_URL}/api/admin/roles/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role_name,
        description,
        question_bank_json: parsedBank
      })
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    revalidatePath('/admin/roles');
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function deleteRole(id: string) {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_CONVFLOW_URL}/api/admin/roles/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    revalidatePath('/admin/roles');
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}
