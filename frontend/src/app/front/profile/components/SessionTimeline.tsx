'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { 
  Calendar, 
  ArrowRight,
  CheckCircle2,
  Clock
} from 'lucide-react';

interface SessionTimelineProps {
  sessions: any[];
  onSelectSession: (id: string) => void;
}

export default function SessionTimeline({ sessions, onSelectSession }: SessionTimelineProps) {
  if (sessions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-4">
        <Clock size={40} strokeWidth={1} />
        <p className="text-sm font-medium">History is clean. Ready for deployment.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
      {sessions.map((session, idx) => {
        const date = new Date(session.created_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        });
        

        return (
          <motion.div
            key={session.session_id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 * idx }}
            onClick={() => onSelectSession(session.session_id)}
            className="group p-4 bg-white/[0.02] border border-white/5 rounded-2xl cursor-pointer hover:bg-white/[0.05] hover:border-white/20 transition-all duration-300"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                  <span className="text-xs font-bold text-gray-500 group-hover:text-purple-400">{date}</span>
                </div>
                <div>
                  <h4 className="text-sm font-bold tracking-tight text-gray-200 group-hover:text-white">
                    {session.total_questions} Questions
                  </h4>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <CheckCircle2 size={10} className="text-green-500" />
                    <span className="text-[10px] uppercase font-bold text-gray-500 tracking-tighter">Analysis Complete</span>
                  </div>
                </div>
              </div>
              <ArrowRight size={16} className="text-gray-700 group-hover:text-purple-500 group-hover:translate-x-1 transition-all" />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
