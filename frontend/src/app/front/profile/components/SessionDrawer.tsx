'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { 
  X, 
  Download, 
  Mic2, 
  Smile, 
  Zap, 
  Crosshair,
  ArrowUpRight,
  ChevronRight,
  Target,
  Lightbulb,
  MessageSquare
} from 'lucide-react';
import FocusRadar from './charts/FocusRadar';
import dynamicImport from 'next/dynamic';

const PDFDownloadLink = dynamicImport(
  () => import('@react-pdf/renderer').then((mod) => mod.PDFDownloadLink),
  { ssr: false }
);

const ReportPDF = dynamicImport(
  () => import('../../../component/interview/ReportPDF').then((mod) => mod.ReportPDF),
  { ssr: false }
);

interface SessionDrawerProps {
  session: any;
  onClose: () => void;
}

export default function SessionDrawer({ session, onClose }: SessionDrawerProps) {
  if (!session) return null;

  // Enriched Metrics Parsing
  const rawMetrics = session.question_metrics_json;
  const isV2 = rawMetrics && !Array.isArray(rawMetrics) && rawMetrics.version === 2;
  const questions = isV2 ? rawMetrics.questions : (Array.isArray(rawMetrics) ? rawMetrics : []);
  const phaseEvaluations = session.llm_evaluation_json || (isV2 ? rawMetrics.phase_evaluations : null);

  const date = new Date(session.created_at).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const scores = [
    { label: 'Confidence', val: session.overall_confidence_score, icon: Zap, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Voice Skills', val: session.overall_voice_score, icon: Mic2, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Voice', val: session.overall_voice_score, icon: MessageSquare, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  ];

  // Aggregate filler words
  const aggregatedFillers: Record<string, number> = {};
  if (phaseEvaluations) {
    Object.values(phaseEvaluations).forEach((data: any) => {
      if (data.filler_words) {
        Object.entries(data.filler_words).forEach(([word, count]) => {
          aggregatedFillers[word.toLowerCase()] = (aggregatedFillers[word.toLowerCase()] || 0) + (count as number);
        });
      }
    });
  }

  const highlightFillerWords = (text: string) => {
    if (!text || Object.keys(aggregatedFillers).length === 0) return text;
    
    // Create a regex for all filler words
    const words = Object.keys(aggregatedFillers).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`\\b(${words.join('|')})\\b`, 'gi');
    
    const parts = text.split(regex);
    return parts.map((part, i) => {
      if (aggregatedFillers[part.toLowerCase()] !== undefined) {
        return <span key={i} className="text-red-500 font-bold underline decoration-red-500/30">{part}</span>;
      }
      return part;
    });
  };

  return (
    <>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60]"
      />
      
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 200 }}
        className="fixed top-0 right-0 bottom-0 w-full max-w-2xl bg-[#0a0a0f] border-l border-white/10 z-[70] p-0 shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
          <div>
            <p className="text-[10px] uppercase font-bold text-gray-500 tracking-[0.2em] mb-1">Session Protocol</p>
            <h2 className="text-2xl font-black tracking-tight">{session.session_id.slice(0, 8).toUpperCase()}</h2>
            <p className="text-sm text-gray-500 mt-1">{date}</p>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-gray-500 hover:text-white hover:border-white/30 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-12">
          {/* Main Score Grid */}
          <div className="grid grid-cols-3 gap-4">
             {scores.map((s) => (
               <div key={s.label} className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 text-center group hover:bg-white/[0.04] transition-colors">
                  <div className={`w-12 h-12 ${s.bg} rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform`}>
                    <s.icon size={24} className={s.color} />
                  </div>
                  <p className="text-3xl font-black leading-none">{Math.round((s.val || 0) * 100)}%</p>
                  <p className="text-[10px] uppercase font-bold text-gray-500 mt-3 tracking-widest">{s.label}</p>
               </div>
             ))}
          </div>

          {/* Phase-Wise Breakdown (V2 Only) */}
          {phaseEvaluations && (
            <section>
              <div className="flex items-center gap-2 mb-6">
                <Target size={18} className="text-purple-500" />
                <h3 className="text-lg font-bold tracking-tight uppercase">Strategic Phase Analysis</h3>
              </div>
              <div className="space-y-4">
                {Object.entries(phaseEvaluations).map(([phase, data]: [string, any]) => (
                  <div key={phase} className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors">
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-xs font-black uppercase tracking-widest text-gray-400">{phase.replace(/_/g, ' ')}</p>
                      <span className="px-3 py-1 bg-purple-500/20 rounded-full text-[10px] font-bold text-purple-400 border border-purple-500/30">
                        {data.overall}/10 SCORE
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mb-4">
                      {Object.entries(data.metrics || {}).map(([k, v]: [string, any]) => (
                        <div key={k} className="px-3 py-1.5 bg-white/5 rounded-xl border border-white/5 flex items-center gap-2">
                          <span className="text-[9px] uppercase font-bold text-gray-500">{k.replace(/_/g, ' ')}</span>
                          <span className="text-[10px] font-black text-gray-300">{v}</span>
                        </div>
                      ))}
                    </div>

                    {data.advice && data.advice.length > 0 && (
                      <div className="mt-4 p-4 bg-yellow-500/5 rounded-2xl border border-yellow-500/10">
                        <div className="flex items-center gap-2 mb-2">
                          <Lightbulb size={14} className="text-yellow-500" />
                          <p className="text-[10px] font-bold uppercase text-yellow-500">Coach's Intel</p>
                        </div>
                        <ul className="space-y-1.5">
                          {data.advice.map((a: string, i: number) => (
                            <li key={i} className="text-xs text-gray-400 leading-relaxed flex gap-2">
                              <span className="text-yellow-500/50">•</span> {a}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Gaze Deep Dive */}
          <section>
            <div className="flex items-center gap-2 mb-6">
              <Crosshair size={18} className="text-pink-500" />
              <h3 className="text-lg font-bold tracking-tight uppercase">Gaze Spatial Map</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-white/[0.02] border border-white/5 rounded-3xl p-8">
              <div className="h-56 w-full">
                <FocusRadar gazeDistribution={session.overall_gaze_distribution || {}} />
              </div>
              <div className="space-y-4">
                <p className="text-sm text-gray-400 leading-relaxed">
                  Your spatial awareness indicates high engagement. You maintained 
                  <span className="text-white font-bold"> {Math.round((session.overall_gaze_distribution?.forward || 0) * 100)}% </span> 
                  direct eye contact.
                </p>
                <div className="space-y-2">
                   {['Forward', 'Away'].map(key => (
                     <div key={key} className="flex justify-between items-center text-[10px] font-bold uppercase tracking-tighter">
                        <span className="text-gray-500">{key} Focus</span>
                        <span className="text-gray-300">{Math.round((session.overall_gaze_distribution?.[key.toLowerCase()] || 0) * 100)}%</span>
                     </div>
                   ))}
                </div>
              </div>
            </div>
          </section>

          {/* Filler Words Analysis */}
          {Object.keys(aggregatedFillers).length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-6">
                <MessageSquare size={18} className="text-red-500" />
                <h3 className="text-lg font-bold tracking-tight uppercase">Filler Word Analysis</h3>
              </div>
              <div className="bg-red-500/5 border border-red-500/20 rounded-3xl p-6">
                <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                  We detected several filler words in your responses. These often indicate moments of hesitation or stalling. 
                  Try pausing instead of using these placeholders to sound more authoritative.
                </p>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(aggregatedFillers)
                    .sort(([, a], [, b]) => b - a)
                    .map(([word, count]) => (
                      <div key={word} className="px-4 py-2 bg-white/5 rounded-2xl border border-white/10 flex items-center gap-3 group hover:border-red-500/30 transition-colors">
                        <span className="text-sm font-bold text-white capitalize">{word}</span>
                        <span className="w-6 h-6 rounded-lg bg-red-500/20 flex items-center justify-center text-[10px] font-black text-red-400">
                          {count}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </section>
          )}

          {/* Performance Log */}
          <section>
            <div className="flex items-center justify-between mb-6">
               <h3 className="text-lg font-bold tracking-tight uppercase">Performance Log</h3>
               <span className="text-[10px] font-bold text-gray-500 uppercase">{questions.length} Questions Logged</span>
            </div>
            
            <div className="space-y-3">
              {questions.map((q: any, idx: number) => (
                <div key={idx} className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-purple-500/30 transition-colors cursor-default group">
                   <div className="flex justify-between items-start gap-4 mb-3">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase text-purple-500/70 tracking-widest">{q.phase || 'General'}</p>
                        <p className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">{q.question_text}</p>
                      </div>
                      <ArrowUpRight size={14} className="text-gray-600 group-hover:text-purple-500" />
                   </div>
                   {q.candidate_answer && (
                     <div className="mt-4 pt-4 border-t border-white/5">
                        <p className="text-[10px] font-bold uppercase text-gray-500 mb-2 tracking-widest">Candidate Answer</p>
                        <p className="text-sm text-gray-400 leading-relaxed italic">
                          "{highlightFillerWords(q.candidate_answer)}"
                        </p>
                     </div>
                   )}
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Footer Actions */}
        <div className="p-8 border-t border-white/5 bg-white/[0.01]">
          {isV2 ? (
            <PDFDownloadLink
              document={<ReportPDF session={session} metrics={rawMetrics} />}
              fileName={`interview-report-${session.session_id.slice(0, 8)}.pdf`}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl font-black text-lg hover:scale-[1.02] transition-all flex items-center justify-center gap-3 shadow-xl shadow-purple-500/20"
            >
              {({ loading }) => (
                <>
                  <Download size={20} />
                  {loading ? 'PREPARING DOSSIER...' : 'GENERATE FULL PDF DOSSIER'}
                </>
              )}
            </PDFDownloadLink>
          ) : (
            <button 
              disabled
              className="w-full py-4 bg-white/5 rounded-2xl font-black text-lg text-gray-500 cursor-not-allowed flex items-center justify-center gap-3 border border-white/5"
            >
              <Download size={20} />
              LEGACY SESSION (NO PDF)
            </button>
          )}
        </div>
      </motion.div>
    </>
  );
}
