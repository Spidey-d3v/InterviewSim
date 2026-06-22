import React from 'react';
import Link from 'next/link';
import pool from '@/utils/db';

export const dynamic = 'force-dynamic';

export default async function DossierPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const id = resolvedParams.id;
  
  let session: any = null;
  let errorMsg = null;
  
  try {
    const query = `
      SELECT s.*, p.full_name, p.email, p.resume_text 
      FROM interview_sessions s 
      LEFT JOIN profiles p ON s.user_id = p.id 
      WHERE s.id = $1
    `;
    const res = await pool.query(query, [id]);
    session = res.rows[0];
  } catch (err: any) {
    errorMsg = err.message;
  }

  if (errorMsg || !session) {
    return <div className="text-red-500">Error loading dossier: {errorMsg || 'Session not found'}</div>;
  }

  const profile = {
    full_name: session.full_name,
    email: session.email,
    resume_text: session.resume_text
  };
  const evalDataV1 = session.llm_evaluation_json || {};
  const v2Feedback = session.recommendation_v2 || {};
  const metrics = session.question_metrics_json || [];
  
  // Assuming we might have actions as the closest thing to hire recommendation right now
  const topAction = v2Feedback.actions?.[0]?.message || 'No actions recommended';

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Header / Breadcrumb */}
      <div>
        <Link href="/admin/interviews" className="text-blue-400 hover:text-blue-300 text-sm font-medium flex items-center gap-2 mb-4">
          ← Back to Interviews
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-white mb-2">{profile.full_name || 'Anonymous Candidate'}</h2>
            <p className="text-gray-400 font-mono text-sm">Session: {session.id}</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-400 mt-1 max-w-xs line-clamp-2" title={topAction}>Top Action: {topAction}</div>
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0f0f15] border border-white/10 p-5 rounded-2xl">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-1">Status</h3>
          <div className="text-lg font-bold text-white">{session.completed_at ? 'Completed' : 'Incomplete'}</div>
          <div className="text-xs text-gray-500 mt-1">{session.started_at ? new Date(session.started_at).toLocaleString() : 'N/A'}</div>
        </div>
        <div className="bg-[#0f0f15] border border-white/10 p-5 rounded-2xl">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-1">Avg Focus</h3>
          <div className="text-lg font-bold text-white">{session.average_focus != null ? `${(session.average_focus * 100).toFixed(1)}%` : 'N/A'}</div>
          <div className="text-xs text-gray-500 mt-1">Camera engagement</div>
        </div>
        <div className="bg-[#0f0f15] border border-white/10 p-5 rounded-2xl">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-1">Questions Asked</h3>
          <div className="text-lg font-bold text-white">{session.total_questions || metrics.length || 0}</div>
          <div className="text-xs text-gray-500 mt-1">Total analyzed turns</div>
        </div>
      </div>

      {/* AI Evaluation Summary */}
      <div className="bg-[#0f0f15] border border-white/10 rounded-2xl p-6">
        <h3 className="text-xl font-bold mb-4 text-white">Observations & Action Plan</h3>
        
        {v2Feedback.observations ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white/5 p-3 rounded-lg">
              <div className="text-xs text-gray-400 uppercase">Pace (WPM)</div>
              <div className="text-lg font-semibold">{v2Feedback.observations.pace?.wpm || 'N/A'} <span className="text-xs font-normal text-gray-500">({v2Feedback.observations.pace?.status})</span></div>
            </div>
            <div className="bg-white/5 p-3 rounded-lg">
              <div className="text-xs text-gray-400 uppercase">Fillers</div>
              <div className="text-lg font-semibold">{v2Feedback.observations.fillers?.like || 0}x 'like', {v2Feedback.observations.fillers?.um || 0}x 'um'</div>
            </div>
            <div className="bg-white/5 p-3 rounded-lg">
              <div className="text-xs text-gray-400 uppercase">Engagement</div>
              <div className="text-lg font-semibold">{((v2Feedback.observations.camera_engagement?.average || 0) * 100).toFixed(1)}%</div>
            </div>
          </div>
        ) : (
          <p className="text-gray-400 mb-6">No V2 observations generated for this session.</p>
        )}

        {v2Feedback.actions && v2Feedback.actions.length > 0 && (
          <div>
            <h4 className="text-sm font-bold text-blue-400 uppercase tracking-wider mb-3">Recommended Actions</h4>
            <div className="space-y-3">
              {v2Feedback.actions.map((action: any, i: number) => (
                <div key={i} className="flex gap-3 items-start bg-white/5 p-3 rounded-xl border border-white/10">
                  <div className="bg-blue-500/20 text-blue-400 text-xs font-bold px-2 py-1 rounded">Priority {action.priority}</div>
                  <div>
                    <div className="text-sm text-gray-200">{action.message}</div>
                    {action.evidence && <div className="text-xs text-gray-500 mt-1 italic">Evidence: {action.evidence.join(', ')}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Question by Question Transcript */}
      <div className="space-y-6">
        <h3 className="text-2xl font-bold text-white">Transcript & Analysis</h3>
        {metrics.length > 0 ? metrics.map((m: any, i: number) => (
          <div key={i} className="bg-[#0f0f15] border border-white/10 rounded-2xl overflow-hidden">
            <div className="bg-white/5 px-6 py-4 border-b border-white/10 flex justify-between items-center">
              <div className="font-medium text-blue-400">Q{i + 1}: {m.question_text || 'Unknown Question'}</div>
              {m.question_averages?.focus != null && (
                <div className="text-xs px-2 py-1 bg-white/10 rounded font-mono text-gray-300">
                  Focus: {(m.question_averages.focus * 100).toFixed(1)}%
                </div>
              )}
            </div>
            <div className="p-6">
              <div className="mb-4">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Candidate Answer</div>
                <div className="text-gray-300 whitespace-pre-wrap pl-4 border-l-2 border-gray-700">
                  {m.candidate_answer || <span className="text-gray-600 italic">No answer recorded</span>}
                </div>
              </div>
            </div>
          </div>
        )) : (
          <div className="p-8 text-center text-gray-500 bg-[#0f0f15] border border-white/10 rounded-2xl">
            No question metrics available.
          </div>
        )}
      </div>
    </div>
  );
}
