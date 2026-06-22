import React from 'react';
import pool from '@/utils/db';
import EngineClient from './EngineClient';

export const dynamic = 'force-dynamic';

export default async function EnginePage() {
  let config = null;
  let errorMsg = null;
  
  try {
    const res = await pool.query('SELECT * FROM engine_configs WHERE id = 1');
    config = res.rows[0];
  } catch (err: any) {
    errorMsg = err.message;
  }

  if (errorMsg) {
    return <div className="text-red-500 p-8">Error loading engine configuration: {errorMsg}</div>;
  }

  return <EngineClient config={config} />;
}
