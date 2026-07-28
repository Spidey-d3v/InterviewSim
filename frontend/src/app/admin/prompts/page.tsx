import React from 'react';
import PromptsClient from './PromptsClient';

export const dynamic = 'force-dynamic';

export default async function PromptsPage() {
  let prompts: any[] = [];
  let errorMsg = null;
  
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_CONVFLOW_URL}/api/admin/prompts`, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    prompts = await res.json();
  } catch (err: any) {
    errorMsg = err.message;
  }

  if (errorMsg) {
    return <div className="text-red-500 p-8">Error loading prompts: {errorMsg}</div>;
  }

  return <PromptsClient prompts={prompts} />;
}
