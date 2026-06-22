import React from 'react';
import pool from '@/utils/db';
import PromptsClient from './PromptsClient';

export const dynamic = 'force-dynamic';

export default async function PromptsPage() {
  let prompts: any[] = [];
  let errorMsg = null;
  
  try {
    const res = await pool.query('SELECT * FROM interview_prompts ORDER BY prompt_key ASC');
    prompts = res.rows;
  } catch (err: any) {
    errorMsg = err.message;
  }

  if (errorMsg) {
    return <div className="text-red-500 p-8">Error loading prompts: {errorMsg}</div>;
  }

  return <PromptsClient prompts={prompts} />;
}
