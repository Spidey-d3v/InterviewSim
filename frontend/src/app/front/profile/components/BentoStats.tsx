'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  Target, 
  Zap, 
  Activity,
  Users
} from 'lucide-react';
import Sparkline from './charts/Sparkline';

interface BentoStatsProps {
  sessions: any[];
}

export default function BentoStats({ sessions }: BentoStatsProps) {
  // Aggregate stats
  const totalSessions = sessions.length;
  const avgConfidence = sessions.length > 0 
    ? (sessions.reduce((acc, s) => acc + (s.overall_confidence_score || 0), 0) / sessions.length) * 100 
    : 0;
  
  const totalQuestions = sessions.reduce((acc, s) => acc + (s.total_questions || 0), 0);
  
  // Aggregate filler words across all sessions
  const globalFillers: Record<string, number> = {};
  sessions.forEach(s => {
    const evalData = s.llm_evaluation_json;
    if (evalData) {
      Object.values(evalData).forEach((phase: any) => {
        if (phase.filler_words) {
          Object.entries(phase.filler_words).forEach(([word, count]) => {
            const w = word.toLowerCase();
            globalFillers[w] = (globalFillers[w] || 0) + (count as number);
          });
        }
      });
    }
  });

  const topFillers = Object.entries(globalFillers)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  // Data for Sparklines (last 10 sessions)
  const confidenceTrend = sessions.slice(0, 10).reverse().map(s => ({
    value: (s.overall_confidence_score || 0) * 100
  }));

  const focusTrend = sessions.slice(0, 10).reverse().map(s => {
    const gaze = s.overall_gaze_distribution || {};
    const focus = (gaze.forward || 0) + (gaze.left || 0) + (gaze.right || 0);
    return { value: focus * 100 };
  });

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, scale: 0.95 },
    show: { opacity: 1, scale: 1 }
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
    >
      {/* Sessions Count - Circle Progress */}
      <motion.div variants={item} className="bg-gradient-to-br from-purple-600/20 to-purple-800/10 border border-purple-500/20 rounded-[2rem] p-6 relative overflow-hidden group">
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center text-purple-400">
              <Activity size={20} />
            </div>
            <span className="text-[10px] font-bold text-purple-500 uppercase tracking-widest bg-purple-500/10 px-2 py-1 rounded-md">Growth</span>
          </div>
          <div className="flex items-end gap-3">
             <h2 className="text-5xl font-black">{totalSessions}</h2>
             <span className="text-gray-500 font-bold mb-1 uppercase text-xs">Total Sessions</span>
          </div>
        </div>
        <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
           <Activity size={120} strokeWidth={3} />
        </div>
      </motion.div>

      {/* Confidence Sparkline */}
      <motion.div variants={item} className="bg-white/[0.03] border border-white/10 rounded-[2rem] p-6 backdrop-blur-xl hover:bg-white/[0.05] transition-colors">
        <div className="flex justify-between items-start mb-6">
          <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400">
            <TrendingUp size={20} />
          </div>
          <div className="text-right">
             <p className="text-xs font-bold text-blue-400">{avgConfidence.toFixed(1)}%</p>
             <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Avg confidence</p>
          </div>
        </div>
        <div className="h-16 w-full">
           <Sparkline data={confidenceTrend} color="#3b82f6" />
        </div>
      </motion.div>

      {/* Focus Gauge/Trend */}
      <motion.div variants={item} className="bg-white/[0.03] border border-white/10 rounded-[2rem] p-6 backdrop-blur-xl hover:bg-white/[0.05] transition-colors">
        <div className="flex justify-between items-start mb-6">
          <div className="w-10 h-10 bg-pink-500/10 rounded-xl flex items-center justify-center text-pink-400">
            <Target size={20} />
          </div>
          <div className="text-right">
             <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Focus Mastery</p>
             <p className="text-xs font-bold text-pink-400">Stable</p>
          </div>
        </div>
        <div className="h-16 w-full">
           <Sparkline data={focusTrend} color="#ec4899" />
        </div>
      </motion.div>

      {/* Experience or Filler Words */}
      <motion.div variants={item} className="bg-gradient-to-br from-gray-800/20 to-black/40 border border-white/5 rounded-[2rem] p-6 backdrop-blur-xl group">
        {topFillers.length > 0 ? (
          <>
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center text-red-400 group-hover:scale-110 transition-transform">
                <Users size={20} />
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Verbal Habit</p>
                <p className="text-xs font-bold text-red-400">Attention Needed</p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Top Filler Words</p>
              <div className="flex flex-wrap gap-2">
                {topFillers.map(([word, count]) => (
                  <div key={word} className="px-2 py-1 bg-white/5 rounded-lg border border-white/10 flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-300 capitalize">{word}</span>
                    <span className="text-[10px] font-black text-red-500">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between items-start mb-6">
              <div className="w-10 h-10 bg-yellow-500/10 rounded-xl flex items-center justify-center text-yellow-400">
                <Zap size={20} />
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-white leading-none">{totalQuestions}</p>
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Questions Taken</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-yellow-500 w-[65%]" />
              </div>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">65% to next career level</p>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
