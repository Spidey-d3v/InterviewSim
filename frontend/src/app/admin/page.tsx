import React from 'react';
import pool from '@/utils/db';
import { Activity, Users, Target, Clock, ChevronRight, Sparkles, MessageSquareText, Briefcase, ClipboardList } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  let sessions: any[] = [];
  let errorMsg = null;
  
  try {
    const res = await pool.query('SELECT * FROM interview_sessions ORDER BY created_at DESC');
    sessions = res.rows;
  } catch (err: any) {
    errorMsg = err.message;
  }

  if (errorMsg) {
    return <div className="text-red-500 bg-red-500/10 p-6 rounded-xl border border-red-500/20">Error loading dashboard: {errorMsg}</div>;
  }

  const totalInterviews = sessions?.length || 0;
  const completedInterviews = sessions?.filter(s => s.completed_at).length || 0;
  const inProgress = totalInterviews - completedInterviews;
  
  const avgFocusScores = sessions?.filter(s => s.average_focus != null).map(s => s.average_focus as number) || [];
  const avgFocusOverall = avgFocusScores.length > 0 
    ? ((avgFocusScores.reduce((a,b) => a+b, 0) / avgFocusScores.length) * 100).toFixed(1) 
    : 'N/A';

  return (
    <div className="space-y-8 pb-10">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-gradient-to-r from-purple-900/20 to-transparent p-6 rounded-3xl border border-purple-500/10">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h2 className="text-3xl font-bold tracking-tight text-white">Dashboard Overview</h2>
          </div>
          <p className="text-gray-400">Welcome back. Here is what is happening across the InterviewAR system today.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-full">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium text-green-400">System Online</span>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          title="Total Interviews" 
          value={totalInterviews.toString()} 
          icon={<Users className="w-6 h-6 text-blue-400" />}
          gradient="from-blue-500/10 to-transparent"
          border="border-blue-500/20"
        />
        <MetricCard 
          title="Completed" 
          value={completedInterviews.toString()} 
          icon={<Activity className="w-6 h-6 text-emerald-400" />}
          gradient="from-emerald-500/10 to-transparent"
          border="border-emerald-500/20"
        />
        <MetricCard 
          title="In Progress" 
          value={inProgress.toString()} 
          icon={<Clock className="w-6 h-6 text-amber-400" />}
          gradient="from-amber-500/10 to-transparent"
          border="border-amber-500/20"
        />
        <MetricCard 
          title="Avg. Focus Level" 
          value={avgFocusOverall !== 'N/A' ? `${avgFocusOverall}%` : 'N/A'} 
          icon={<Target className="w-6 h-6 text-purple-400" />}
          gradient="from-purple-500/10 to-transparent"
          border="border-purple-500/20"
        />
      </div>

      {/* Main Content Split */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Recent Activity List */}
        <div className="xl:col-span-2 bg-[#0a0a0f] border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-blue-500 to-emerald-500 opacity-50" />
          
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-gray-400" />
              Recent Sessions
            </h3>
            <Link href="/admin/interviews" className="text-sm text-purple-400 hover:text-purple-300 flex items-center transition-colors">
              View All <ChevronRight className="w-4 h-4 ml-1" />
            </Link>
          </div>

          {sessions && sessions.length > 0 ? (
            <div className="space-y-3">
              {sessions.slice(0, 5).map(session => (
                <div key={session.id} className="group flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-purple-500/30 rounded-2xl transition-all duration-300">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${session.completed_at ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                      {session.completed_at ? <CheckIcon /> : <LoaderIcon />}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white group-hover:text-purple-300 transition-colors">
                        Candidate <span className="font-mono text-xs ml-1 text-gray-400">{session.id.split('-')[0]}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        {session.started_at ? new Date(session.started_at).toLocaleString() : 'Not started yet'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                      <div className={`text-xs font-medium px-3 py-1 rounded-full border ${session.completed_at ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                        {session.completed_at ? 'Completed' : 'In Progress'}
                      </div>
                    </div>
                    <Link href={`/admin/interviews/${session.id}`} className="p-2 rounded-full bg-white/5 hover:bg-purple-600/20 text-gray-400 hover:text-purple-300 transition-colors">
                      <ChevronRight className="w-5 h-5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl">
              <Activity className="w-8 h-8 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No sessions recorded yet.</p>
              <p className="text-gray-600 text-sm mt-1">Interviews will appear here once candidates join.</p>
            </div>
          )}
        </div>

        {/* Quick Actions / System Health */}
        <div className="flex flex-col gap-6">
          <div className="bg-[#0a0a0f] border border-white/10 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Quick Links</h3>
            <div className="space-y-3">
              <QuickLink href="/admin/prompts" icon={<MessageSquareText className="w-5 h-5" />} title="Edit System Prompts" desc="Tune the AI personalities" />
              <QuickLink href="/admin/roles" icon={<Briefcase className="w-5 h-5" />} title="Manage Job Roles" desc="Add or modify domains" />
              <QuickLink href="/admin/interviews" icon={<ClipboardList className="w-5 h-5" />} title="Interview Dossiers" desc="Review candidate results" />
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border border-indigo-500/20 rounded-3xl p-6 shadow-2xl flex-1 flex flex-col justify-center">
            <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mb-4 border border-white/20">
              <Target className="w-6 h-6 text-indigo-300" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Engine Tuning</h3>
            <p className="text-sm text-indigo-200/70 leading-relaxed mb-4">
              Adjust LLM temperature, maximum tokens, and vision tracking strictness to perfect the evaluation engine.
            </p>
            <Link href="/admin/engine" className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl font-medium transition-colors text-sm shadow-[0_0_15px_rgba(99,102,241,0.3)] block text-center">
              Configure Engine
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}

function MetricCard({ title, value, icon, gradient, border }: any) {
  return (
    <div className={`bg-gradient-to-br ${gradient} bg-[#0a0a0f] border ${border} p-6 rounded-3xl flex flex-col gap-4 relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300 shadow-xl`}>
      <div className="flex justify-between items-start">
        <div className="p-3 bg-white/5 rounded-2xl group-hover:scale-110 transition-transform duration-300 border border-white/5">
          {icon}
        </div>
      </div>
      <div>
        <div className="text-3xl font-bold text-white tracking-tight">{value}</div>
        <h3 className="text-sm font-medium text-gray-400 mt-1">{title}</h3>
      </div>
    </div>
  );
}

function QuickLink({ href, icon, title, desc }: any) {
  return (
    <Link href={href} className="flex items-center gap-4 p-3 rounded-2xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-all group">
      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-lg border border-white/5 group-hover:bg-purple-500/20 group-hover:border-purple-500/30 transition-colors">
        {icon}
      </div>
      <div>
        <div className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">{title}</div>
        <div className="text-xs text-gray-500">{desc}</div>
      </div>
    </Link>
  );
}

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
);

const LoaderIcon = () => (
  <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
);
