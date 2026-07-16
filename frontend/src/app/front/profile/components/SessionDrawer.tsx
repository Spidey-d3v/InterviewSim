'use client';

import React, { useState } from 'react';
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
import { getVideoLocal } from '../../../../utils/videoStorage';

interface SessionDrawerProps {
  session: any;
  onClose: () => void;
}

export default function SessionDrawer({ session, onClose }: SessionDrawerProps) {
  const [showVocabModal, setShowVocabModal] = useState(false);
  const [showLengthModal, setShowLengthModal] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    if (session?.session_id) {
      getVideoLocal(session.session_id).then(blob => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          setVideoUrl(url);
        }
      });
      fetch(`/api/timeline/${session.session_id}`)
        .then(r => r.json())
        .then(data => {
          if (data.events) setTimelineEvents(data.events);
        })
        .catch(err => console.error(err));
    }
  }, [session?.session_id]);

  if (!session) return null;

  // Enriched Metrics Parsing
  const rawMetrics = session.question_metrics_json;
  const isV2 = rawMetrics && !Array.isArray(rawMetrics) && rawMetrics.version === 2;
  const questions = isV2 ? rawMetrics.questions : (Array.isArray(rawMetrics) ? rawMetrics : []);
  const phaseEvaluations = null;
  const v2Feedback = session.recommendation_v2;

  let gazeData = session.overall_gaze_distribution || {};
  const totalGaze: number = Object.values(gazeData).reduce((a: number, b: unknown) => a + Number(b), 0) as number;
  if (totalGaze > 1.01) {
    gazeData = {
      forward: (gazeData.forward || 0) / totalGaze,
      away: (gazeData.away || 0) / totalGaze,
      left: (gazeData.left || 0) / totalGaze,
      right: (gazeData.right || 0) / totalGaze,
      down: (gazeData.down || 0) / totalGaze,
    };
  }

  const date = new Date(session.created_at).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });


  // Aggregate filler words based on SMART transcript occurrences
  const aggregatedFillers: Record<string, number> = {};
  
  // Advanced regex rules to avoid catching valid usages (e.g., "I like", "do you know")
  const fillerRules: Record<string, RegExp> = {
    'um': /\bum\b/gi,
    'uh': /\buh\b/gi,
    'ah': /\bah\b/gi,
    'basically': /\bbasically\b/gi,
    'literally': /\bliterally\b/gi,
    'you know': /(?<!\b(?:do|let|make|as)\s+)\byou know\b/gi,
    'i mean': /\bi mean\b/gi,
    'sort of': /\bsort of\b/gi,
    'kind of': /\bkind of\b/gi,
    'like': /(?<!\b(?:i|we|they|you|he|she|would|should|could|feel|seems|looks|sounds|very|much|more|just|really|something)\s+)\blike\b/gi,
    'right': /\bright\b(?=\s*(?:\?|,|$))/gi
  };

  questions.forEach((q: any) => {
    if (!q.candidate_answer) return;
    const text = q.candidate_answer.toLowerCase();
    
    Object.entries(fillerRules).forEach(([word, regex]) => {
      // Reset lastIndex just in case
      regex.lastIndex = 0;
      const matches = text.match(regex);
      if (matches) {
        aggregatedFillers[word] = (aggregatedFillers[word] || 0) + matches.length;
      }
    });
  });

  const highlightFillerWords = (text: string) => {
    if (!text || Object.keys(aggregatedFillers).length === 0) return text;
    
    // Combine the regexes of ONLY the filler words that actually appeared in the text
    const activeRegexes = Object.entries(fillerRules)
      .filter(([word]) => aggregatedFillers[word] > 0)
      .map(([, regex]) => regex.source);
      
    if (activeRegexes.length === 0) return text;
    
    // Combine all active patterns into one mega-regex using alternation
    const combinedRegex = new RegExp(`(${activeRegexes.join('|')})`, 'gi');
    
    const parts = text.split(combinedRegex);
    return parts.map((part, i) => {
      // Because we split by a capture group, every odd index is a matched filler word
      if (i % 2 !== 0) {
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

          {/* AI Telemetry Timeline */}
          <section>
            <div className="flex items-center gap-2 mb-6">
              <Zap size={18} className="text-yellow-500" />
              <h3 className="text-lg font-bold tracking-tight uppercase">AI Telemetry Timeline</h3>
            </div>
            
            <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-8">
              {/* Local Video Player */}
              <div className="w-full aspect-video bg-[#050505] rounded-2xl border border-white/10 mb-8 flex items-center justify-center relative overflow-hidden shadow-2xl shadow-black/50">
                 {videoUrl ? (
                   <video 
                     ref={videoRef}
                     src={videoUrl} 
                     controls 
                     className="w-full h-full object-contain"
                   />
                 ) : (
                   <>
                     <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 z-10" />
                     <div className="z-20 text-center">
                       <p className="text-gray-700 font-bold tracking-[0.3em] text-sm mb-2">NO LOCAL VIDEO</p>
                       <p className="text-gray-800 text-[10px] uppercase font-bold">Video not found in browser IndexedDB cache</p>
                     </div>
                   </>
                 )}
              </div>

              {/* YouTube-Style Scrub Bar */}
              <div className="relative">
                <div className="relative w-full h-3 bg-white/5 rounded-full overflow-visible">
                  <div className="absolute inset-y-0 left-0 w-1/3 bg-white/10 rounded-full" /> {/* Buffer bar */}
                  {timelineEvents.map((evt) => {
                     if (!evt.is_red_flag) return null;
                     
                     // Fallback max time to 3 mins if events don't span long enough
                     const maxTime = Math.max(...timelineEvents.map(e => e.timestamp_seconds), 180);
                     const leftPercent = Math.min((evt.timestamp_seconds / maxTime) * 100, 99);
                     
                     return (
                       <div 
                         key={evt.id}
                         onClick={() => {
                           if (videoRef.current) {
                             videoRef.current.currentTime = evt.timestamp_seconds;
                             videoRef.current.play();
                           }
                         }}
                         className="absolute top-0 bottom-0 w-2 bg-red-500 rounded-full group cursor-pointer shadow-[0_0_10px_rgba(239,68,68,0.5)] z-20 hover:scale-125 transition-transform"
                         style={{ left: `${leftPercent}%` }}
                       >
                          <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/90 backdrop-blur-md text-red-100 text-[10px] font-bold px-3 py-1.5 rounded-lg whitespace-nowrap border border-red-500/30 z-30">
                            <span className="text-red-500 mr-2">●</span>
                            {evt.metric_type === 'SPEECH' ? 'Severe Speech Stutter Detected' : 'Darting Gaze / Anxiety Detected'}
                          </div>
                       </div>
                     );
                  })}
                </div>
                <div className="mt-4 flex justify-between items-center text-[10px] font-bold text-gray-500 tracking-widest">
                  <span>00:00</span>
                  <div className="flex gap-4">
                     <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]"></span> Red Flag</span>
                  </div>
                  <span>END</span>
                </div>
              </div>
            </div>
          </section>

          {/* V2 Feedback (Observations & Actions) */}
          {v2Feedback?.version === 2 && (
            <section>
              <div className="flex items-center gap-2 mb-6">
                <Target size={18} className="text-purple-500" />
                <h3 className="text-lg font-bold tracking-tight uppercase">Performance Observations</h3>
              </div>

              {v2Feedback.observations.telemetry && (
                <div className="mb-6 p-6 bg-white/[0.02] border border-white/5 rounded-3xl">
                  <div className="mb-6">
                    <h4 className="text-sm font-bold text-gray-200 tracking-tight uppercase">Empathy & Acoustic Telemetry</h4>
                    <p className="text-xs text-gray-500 mt-1">{v2Feedback.observations.telemetry.body_language_feedback || 'Advanced analysis of your microexpressions and vocal stability.'}</p>
                  </div>
                  
                  <div className="space-y-4">
                    {/* Smile */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-gray-400">Enthusiasm (Smile)</span>
                        <span className="text-emerald-400">{Math.round((v2Feedback.observations.telemetry.smile_average || 0) * 100)}%</span>
                      </div>
                      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (v2Feedback.observations.telemetry.smile_average || 0) * 100)}%` }} />
                      </div>
                    </div>
                    {/* Frown */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-gray-400">Stress (Frown)</span>
                        <span className="text-yellow-400">{Math.round((v2Feedback.observations.telemetry.frown_average || 0) * 100)}%</span>
                      </div>
                      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-yellow-500" style={{ width: `${Math.min(100, (v2Feedback.observations.telemetry.frown_average || 0) * 100)}%` }} />
                      </div>
                    </div>
                    {/* Darting */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-gray-400">Gaze Anxiety (Darting)</span>
                        <span className="text-red-400">{Math.round((v2Feedback.observations.telemetry.darting_average || 0) * 100)}%</span>
                      </div>
                      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500" style={{ width: `${Math.min(100, (v2Feedback.observations.telemetry.darting_average || 0) * 100)}%` }} />
                      </div>
                    </div>
                    {/* Shakiness */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-gray-400">Vocal Instability (Shaky Tone)</span>
                        <span className="text-orange-400">{Math.round((v2Feedback.observations.telemetry.shakiness_average || 0) * 100)}%</span>
                      </div>
                      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500" style={{ width: `${Math.min(100, (v2Feedback.observations.telemetry.shakiness_average || 0) * 100)}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                   <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">Pace</p>
                   <p className="text-2xl font-black text-gray-200">{v2Feedback.observations.pace?.wpm || 0} <span className="text-xs text-gray-500">WPM</span></p>
                   <p className="text-xs text-purple-400 capitalize font-bold mt-1">{v2Feedback.observations.pace?.status || "Balanced"}</p>
                </div>
                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                   <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">Focus</p>
                   <p className="text-2xl font-black text-gray-200">{Math.round((v2Feedback.observations.camera_engagement?.average || 0) * 100)}%</p>
                   <p className="text-xs text-emerald-400 font-bold mt-1">Direct Eye Contact</p>
                </div>
                <div 
                  onClick={() => setShowLengthModal(true)}
                  className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl cursor-pointer hover:border-white/20 transition-all"
                >
                   <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">Length</p>
                   <p className="text-xl font-black text-gray-200 capitalize">{v2Feedback.observations.response_length?.status || 'Balanced'}</p>
                   <p className="text-xs text-blue-400 mt-1 font-bold">View Details</p>
                </div>
                <div 
                  onClick={() => setShowVocabModal(true)}
                  className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl cursor-pointer hover:border-white/20 transition-all"
                >
                   <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">Vocabulary</p>
                   <p className="text-xl font-black text-gray-200 capitalize">{v2Feedback.observations.vocabulary?.status || 'Confident'}</p>
                   <p className="text-xs text-gray-500 mt-1">{v2Feedback.observations.vocabulary?.strong_words_used || 0} Strong | {v2Feedback.observations.vocabulary?.weak_words_used || 0} Weak</p>
                </div>
              </div>

              {v2Feedback.observations.star_coverage && (
                <div className="mt-8 p-6 bg-white/[0.02] border border-white/5 rounded-3xl">
                   <div className="flex items-center justify-between mb-6">
                     <div>
                       <h4 className="text-sm font-bold text-gray-200 tracking-tight uppercase">STAR Method Adherence</h4>
                       <p className="text-xs text-gray-500 mt-1">Breakdown of how you structured your answers</p>
                     </div>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                     <div className="relative h-64 w-full flex items-center justify-center">
                       {(() => {
                         const s = v2Feedback.observations.star_coverage.situation || 0;
                         const t = v2Feedback.observations.star_coverage.task || 0;
                         const a = v2Feedback.observations.star_coverage.action || 0;
                         const r = v2Feedback.observations.star_coverage.result || 0;
                         const total = s + t + a + r || 1; // Prevent division by zero
                         const sp = (s / total) * 100;
                         const tp = (t / total) * 100;
                         const ap = (a / total) * 100;
                         const rp = (r / total) * 100;
                         
                         const gradient = `conic-gradient(
                           #818cf8 0% ${sp}%,
                           #c084fc ${sp}% ${sp + tp}%,
                           #34d399 ${sp + tp}% ${sp + tp + ap}%,
                           #f472b6 ${sp + tp + ap}% 100%
                         )`;

                         return (
                           <div className="relative w-48 h-48 rounded-full shadow-2xl" style={{ background: gradient }}>
                             <div className="absolute inset-2 rounded-full bg-[#111827] flex items-center justify-center">
                               <div className="text-center">
                                 <span className="block text-2xl font-black text-white">{Math.round(total)}%</span>
                                 <span className="text-[10px] text-gray-500 font-bold">COVERAGE</span>
                               </div>
                             </div>
                           </div>
                         );
                       })()}
                     </div>
                     <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-indigo-400 font-bold block mb-1">Situation (Target: ~10%)</span>
                          <span className="text-gray-500">Setting the scene. You achieved: <strong className="text-gray-300">{v2Feedback.observations.star_coverage.situation || 0}%</strong></span>
                        </div>
                        <div>
                          <span className="text-purple-400 font-bold block mb-1">Task (Target: ~10%)</span>
                          <span className="text-gray-500">Describing your responsibility. You achieved: <strong className="text-gray-300">{v2Feedback.observations.star_coverage.task || 0}%</strong></span>
                        </div>
                        <div>
                          <span className="text-emerald-400 font-bold block mb-1">Action (Target: ~60%)</span>
                          <span className="text-gray-500">What YOU actually did. You achieved: <strong className="text-gray-300">{v2Feedback.observations.star_coverage.action || 0}%</strong></span>
                        </div>
                        <div>
                          <span className="text-pink-400 font-bold block mb-1">Result (Target: ~20%)</span>
                          <span className="text-gray-500">The positive outcome. You achieved: <strong className="text-gray-300">{v2Feedback.observations.star_coverage.result || 0}%</strong></span>
                        </div>
                     </div>
                   </div>
                </div>
              )}
<div className="flex items-center gap-2 mb-6 mt-8">
                <Lightbulb size={18} className="text-yellow-500" />
                <h3 className="text-lg font-bold tracking-tight uppercase">Strategic Action Plan</h3>
              </div>
              <div className="space-y-4 mb-8">
                {(v2Feedback.actions || []).map((action: any, idx: number) => (
                  <div key={idx} className="p-5 bg-yellow-500/5 rounded-2xl border border-yellow-500/10">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-yellow-500/20 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-yellow-500">{action.priority}</span>
                      </div>
                      <div>
                        <p className="text-sm text-gray-300 leading-relaxed font-medium">{action.message}</p>
                        {action.evidence && action.evidence.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {action.evidence.map((ev: string, eIdx: number) => (
                              <span key={eIdx} className="px-2 py-1 bg-white/5 text-gray-400 rounded-lg text-[10px] font-bold">
                                {ev}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
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
                <FocusRadar gazeDistribution={gazeData} />
              </div>
              <div className="space-y-4">
                <p className="text-sm text-gray-400 leading-relaxed">
                  Your spatial awareness indicates high engagement. You maintained 
                  <span className="text-white font-bold"> {Math.round((gazeData?.forward || 0) * 100)}% </span> 
                  direct eye contact.
                </p>
                <div className="space-y-2">
                   {['Forward', 'Away'].map(key => (
                     <div key={key} className="flex justify-between items-center text-[10px] font-bold uppercase tracking-tighter">
                        <span className="text-gray-500">{key} Focus</span>
                        <span className="text-gray-300">{Math.round((gazeData?.[key.toLowerCase()] || 0) * 100)}%</span>
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
                        <p className="text-sm text-gray-400 italic mt-2 p-3 bg-[#13131a] rounded border border-[#2a2a35] whitespace-pre-wrap break-words">
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
            
            <button 
              onClick={async () => {
                const { jsPDF } = await import('jspdf');
                const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
                const margin = 40;
                const pageWidth = pdf.internal.pageSize.getWidth();
                const contentWidth = pageWidth - margin * 2;
                let y = margin;

                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(22);
                pdf.setTextColor(255, 255, 255);
                pdf.setFillColor(17, 24, 39);
                pdf.rect(0, 0, pageWidth, 100, 'F');
                pdf.text('INTERVIEW AI DOSSIER', margin, margin + 25);
                y = 120;

                if (v2Feedback && v2Feedback.version === 2) {
                  const obs = v2Feedback.observations;
                  pdf.setFont('helvetica', 'bold');
                  pdf.setFontSize(14);
                  pdf.setTextColor(17, 24, 39);
                  pdf.text('OVERALL OBSERVATIONS', margin, y);
                  y += 20;

                  pdf.setFillColor(243, 244, 246);
                  pdf.rect(margin, y, contentWidth, 70, 'F');
                  pdf.setFontSize(10);
                  
                  if (obs.pace) {
                    pdf.text(`PACE: ${obs.pace.wpm} WPM (${obs.pace.status})`, margin + 15, y + 20);
                  }
                  if (obs.camera_engagement) {
                    pdf.text(`FOCUS: ${Math.round(obs.camera_engagement.average * 100)}%`, margin + 150, y + 20);
                  }
                  if (obs.vocabulary) {
                    pdf.text(`VOCAB: ${obs.vocabulary.strong_words_used} Strong | ${obs.vocabulary.weak_words_used} Weak`, margin + 15, y + 40);
                  }
                  if (obs.response_length) {
                    pdf.text(`LENGTH: ${obs.response_length.status}`, margin + 150, y + 40);
                  }
                  y += 100;

                  if (v2Feedback.technical_evaluation && v2Feedback.technical_evaluation.length > 0) {
                    pdf.setFontSize(14);
                    pdf.text('TECHNICAL EVALUATION', margin, y);
                    y += 20;
                    v2Feedback.technical_evaluation.forEach((tech: any) => {
                      if (y > pdf.internal.pageSize.getHeight() - 50) { pdf.addPage(); y = margin; }
                      
                      const qData = questions[tech.question_index];
                      const qText = qData && qData.question_text ? qData.question_text : "Unknown Question";
                      
                      pdf.setFontSize(10);
                      pdf.setFont('helvetica', 'bold');
                      pdf.setTextColor(99, 102, 241); // Indigo color for question
                      
                      const qLines = pdf.splitTextToSize(`Q${tech.question_index + 1}: ${qText} (Score: ${tech.accuracy_score_out_of_5}/5)`, contentWidth);
                      qLines.forEach((ql: string) => {
                        if (y + 14 > pdf.internal.pageSize.getHeight() - 50) { pdf.addPage(); y = margin; }
                        pdf.text(ql, margin, y);
                        y += 14;
                      });

                      pdf.setFontSize(9);
                      pdf.setFont('helvetica', 'normal');
                      pdf.setTextColor(17, 24, 39);
                      
                      const techLines = pdf.splitTextToSize(tech.feedback, contentWidth - 20);
                      techLines.forEach((al: string) => { 
                        if (y + 12 > pdf.internal.pageSize.getHeight() - 50) {
                          pdf.addPage();
                          y = margin;
                        }
                        y += 12;
                        pdf.text(al, margin + 10, y); 
                      });
                      y += 20;
                    });
                  }
                }

                pdf.save(`interview-dossier-${session.session_id.slice(0, 8)}.pdf`);
              }}
              className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-2xl font-black text-lg text-white transition-all flex items-center justify-center gap-3 shadow-2xl"
            >
              <Download size={20} />
              DOWNLOAD PDF DOSSIER
            </button>

        </div>
      </motion.div>

      {/* Vocab Modal */}
      {showVocabModal && v2Feedback?.observations?.vocabulary && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">Vocabulary Analysis</h3>
              <button onClick={() => setShowVocabModal(false)}><X size={20} className="text-gray-500 hover:text-white" /></button>
            </div>
            <div className="space-y-6">
              <div>
                <p className="text-sm font-bold text-emerald-400 mb-3">Strong Words Used ({v2Feedback.observations.vocabulary.strong_words_used || 0})</p>
                <div className="flex flex-wrap gap-2">
                  {(v2Feedback.observations.vocabulary.strong_words_list || []).map((w: any, i: number) => (
                    <span key={i} className="px-2 py-1 bg-green-500/10 text-green-400 rounded-full text-xs font-mono">
                      {typeof w === 'string' ? w : `${w.word} x${w.count}`}
                    </span>
                  ))}
                  {(!v2Feedback.observations.vocabulary.strong_words_list || v2Feedback.observations.vocabulary.strong_words_list.length === 0) && <span className="text-gray-500 text-xs italic">No strong words detected in the transcript.</span>}
                </div>
              </div>
              <div className="border-t border-white/5 pt-4">
                <p className="text-sm font-bold text-red-400 mb-3">Weak Words Used ({v2Feedback.observations.vocabulary.weak_words_used || 0})</p>
                <div className="flex flex-wrap gap-2">
                  {(v2Feedback.observations.vocabulary.weak_words_list || []).map((w: any, i: number) => (
                    <span key={i} className="px-2 py-1 bg-red-500/10 text-red-400 rounded-full text-xs font-mono">
                      {typeof w === 'string' ? w : `${w.word} x${w.count}`}
                    </span>
                  ))}
                  {(!v2Feedback.observations.vocabulary.weak_words_list || v2Feedback.observations.vocabulary.weak_words_list.length === 0) && <span className="text-gray-500 text-xs italic">No weak words detected. Great job!</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Length Modal */}
      {showLengthModal && v2Feedback?.observations?.response_length && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto custom-scrollbar shadow-2xl">
            <div className="flex justify-between items-center mb-6 sticky top-0 bg-[#111827] pt-2 pb-4 border-b border-white/5 z-10">
              <h3 className="text-lg font-bold text-white">Response Length Analysis</h3>
              <button onClick={() => setShowLengthModal(false)}><X size={20} className="text-gray-500 hover:text-white" /></button>
            </div>
            
            <div className="p-4 bg-blue-500/10 rounded-xl border border-blue-500/20 mb-6">
              <p className="text-sm text-blue-100 leading-relaxed font-medium">
                <span className="font-bold text-blue-400 block mb-1">AI Recommendation:</span>
                {v2Feedback.observations.response_length.feedback || "Your response lengths were generally well-balanced. Aim for 1-2 minutes per answer to remain concise and engaging."}
              </p>
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Your Responses</h4>
              {questions.map((q: any, idx: number) => {
                const wordCount = q.candidate_answer ? q.candidate_answer.trim().split(/\s+/).filter((w: string) => w.length > 0).length : 0;
                let lengthStatus = 'balanced';
                if (wordCount > 250) lengthStatus = 'rambling';
                if (wordCount < 50) lengthStatus = 'too_short';
                
                return (
                  <div key={idx} className="p-4 rounded-xl bg-white/5 border border-white/5">
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-xs font-bold text-gray-300">Q{idx + 1}: {q.question_text}</p>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${
                        lengthStatus === 'rambling' ? 'bg-red-500/20 text-red-400' :
                        lengthStatus === 'too_short' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {wordCount} words
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 italic line-clamp-3 hover:line-clamp-none transition-all whitespace-pre-wrap break-words">"{q.candidate_answer || 'No answer recorded.'}"</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
