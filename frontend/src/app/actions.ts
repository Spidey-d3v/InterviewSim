'use server';

export async function getRoles() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_CONVFLOW_URL}/api/admin/roles`, { cache: 'no-store' });
    const data = await res.json();
    return data.map((row: any) => row.role_name);
  } catch (e) {
    console.error('Failed to fetch roles', e);
    return [];
  }
}
