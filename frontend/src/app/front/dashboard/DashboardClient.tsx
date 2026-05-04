'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from '../profile/components/Sidebar';
import BentoStats from '../profile/components/BentoStats';
import SessionTimeline from '../profile/components/SessionTimeline';
import dynamic from 'next/dynamic';
const SessionDrawer = dynamic(() => import('../profile/components/SessionDrawer'), { ssr: false });
import PerformanceGraph from '../profile/components/charts/PerformanceGraph';

interface DashboardClientProps {
  sessions: any[];
  profile: any;
  userId: string;
}

export default function DashboardClient({ sessions, profile, userId }: DashboardClientProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Extract selected session data
  const selectedSession = sessions.find(s => s.session_id === selectedSessionId);

  return (
    <div className="flex min-h-screen bg-[#0a0a0f] text-white overflow-hidden">
      {/* Permanent Sidebar */}
      <Sidebar />
      
      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 relative custom-scrollbar">
        {/* Animated Background Accents */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-5%] left-[-5%] w-[30%] h-[30%] bg-pink-600/5 rounded-full blur-[100px]" />
        </div>

        <div className="relative z-10 p-8 lg:p-12 max-w-7xl mx-auto">
          {/* Header Section */}
          <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <h1 className="text-4xl font-black tracking-tighter uppercase leading-none">
                Mission Control
              </h1>
              <p className="text-gray-500 mt-3 font-medium">
                Welcome back, {profile?.full_name?.split(' ')[0] || 'Commander'}. Your behavioral analytics are synchronized.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-4 bg-white/[0.03] border border-white/10 px-6 py-3 rounded-2xl backdrop-blur-md"
            >
              <div className="text-right">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Current Level</p>
                <p className="text-lg font-bold text-purple-400">Elite Candidate</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center font-bold">
                L5
              </div>
            </motion.div>
          </header>

          {/* Hero Bento Grid */}
          <BentoStats sessions={sessions} />

          {/* Main Visualizations Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-12">
            {/* Performance Trajectory Graph */}
            <motion.section 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="lg:col-span-2 bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-xl hover:bg-white/[0.04] transition-colors group"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-bold tracking-tight">Performance Trajectory</h3>
                  <p className="text-sm text-gray-500 mt-1">Confidence vs. Eye Contact over time.</p>
                </div>
                <div className="flex gap-4">
                   <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-gray-400">
                     <div className="w-2 h-2 rounded-full bg-purple-500" /> Confidence
                   </div>
                   <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-gray-400">
                     <div className="w-2 h-2 rounded-full bg-pink-500" /> Focus
                   </div>
                </div>
              </div>
              
              <div className="h-[300px] w-full">
                <PerformanceGraph sessions={sessions} />
              </div>
            </motion.section>

            {/* Recent Session Timeline */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="lg:col-span-1 bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-xl flex flex-col"
            >
              <h3 className="text-xl font-bold tracking-tight mb-6">Recent Sorties</h3>
              <SessionTimeline 
                sessions={sessions} 
                onSelectSession={(id) => setSelectedSessionId(id)} 
              />
            </motion.section>
          </div>
        </div>
      </main>

      {/* Slide-out Detail Drawer Overlay */}
      <AnimatePresence>
        {selectedSessionId && (
          <SessionDrawer 
            session={selectedSession} 
            onClose={() => setSelectedSessionId(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
