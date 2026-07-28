import React from 'react';
import EngineClient from './EngineClient';

export const dynamic = 'force-dynamic';

export default async function EnginePage() {
  let config = null;
  let errorMsg = null;
  
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_CONVFLOW_URL}/api/admin/engine`, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    config = await res.json();
  } catch (err: any) {
    errorMsg = err.message;
  }

  if (errorMsg) {
    return <div className="text-red-500 p-8">Error loading engine configuration: {errorMsg}</div>;
  }

  return <EngineClient config={config} />;
}
