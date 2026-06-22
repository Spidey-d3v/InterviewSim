import React from 'react';
import Link from 'next/link';
import pool from '@/utils/db';

export const dynamic = 'force-dynamic';

export default async function InterviewsPage() {
  let sessions: any[] = [];
  let errorMsg = null;
  
  try {
    const query = `
      SELECT s.*, p.full_name, p.email 
      FROM interview_sessions s 
      LEFT JOIN profiles p ON s.user_id = p.id 
      ORDER BY s.created_at DESC
    `;
    const res = await pool.query(query);
    sessions = res.rows;
  } catch (err: any) {
    errorMsg = err.message;
  }

  if (errorMsg) {
    return <div className="text-red-500">Error loading interviews: {errorMsg}</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-white mb-2">Candidate Dossiers</h2>
        <p className="text-gray-400">View and analyze past interview sessions.</p>
      </div>

      <div className="bg-[#0f0f15] border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-gray-400 border-b border-white/10">
              <tr>
                <th className="px-6 py-4 font-medium">Candidate</th>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sessions?.map((session: any) => {
                const name = session.full_name || 'Anonymous Candidate';
                const date = session.started_at ? new Date(session.started_at).toLocaleDateString() : 'N/A';
                const isCompleted = !!session.completed_at;

                return (
                  <tr key={session.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-200">{name}</div>
                      <div className="text-xs text-gray-500 font-mono">{session.id.split('-')[0]}</div>
                    </td>
                    <td className="px-6 py-4 text-gray-400">{date}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                        isCompleted 
                          ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                          : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                      }`}>
                        {isCompleted ? 'Completed' : 'Incomplete'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link 
                        href={`/admin/interviews/${session.id}`}
                        className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
                      >
                        View Dossier
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          {(!sessions || sessions.length === 0) && (
            <div className="p-8 text-center text-gray-500">
              No interview sessions found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
