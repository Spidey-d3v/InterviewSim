'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud, CheckCircle, X } from 'lucide-react';
import ResumeUploadModal from './component/ResumeUploadModal'; 
import { createClient } from '@/utils/supabase';

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export default function LandingPage() { 
  const router = useRouter();
  const supabase = createClient();
  const mounted = useMounted();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [hasResume, setHasResume] = useState<boolean | null>(null);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [mlBars, setMlBars] = useState<Array<{ width: number; value: number }>>([]);
  
  const ROLES = [
    'Full Stack Developer',
    'AI Engineer',
    'DevOps Engineer',
    'Electrical and Computer Science Engineer',
    'Cybersecurity'
  ];

  const checkAuthStatus = async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setIsLoggedIn(false);
      setHasResume(false);
      return;
    }

    setIsLoggedIn(true);
    const { data: profile } = await supabase
      .from('profiles')
      .select('resume_text, resume_json')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profile) {
      setHasResume(!!(profile.resume_text?.trim() || profile.resume_json));
    } else {
      setHasResume(false);
    }
  };

  useEffect(() => {
    checkAuthStatus();
    setMlBars(Array.from({ length: 12 }).map(() => ({
      width: Math.random() * 40 + 60,
      value: Math.random() * 0.3 + 0.7
    })));
  }, []);

  const handleStartInterview = () => {
    if (!isLoggedIn) {
      router.push('/auth/login');
      return;
    }
    if (hasResume) {
      setIsRoleModalOpen(true);
    } else {
      setIsModalOpen(true);
    }
  };

  const handleUploadResumeClick = () => {
    if (!isLoggedIn) {
      router.push('/auth/login');
      return;
    }
    setIsModalOpen(true);
  };

  const handleRoleSelect = (role: string) => {
    setIsRoleModalOpen(false);
    router.push(`/front/interview?role=${encodeURIComponent(role)}`);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => setMousePosition({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden relative">
      {/* Animated Grid Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,black,transparent)]" />
        <div 
          className="absolute inset-0 opacity-30"
          style={{
            background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(139, 92, 246, 0.08), transparent 40%)`
          }}
        />
      </div>

      {/* Navigation */}
      <nav className="relative z-50 px-6 py-6 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center font-bold text-sm">AI</div>
          <span className="text-xl font-bold tracking-tight">InterviewAR</span>
        </div>
        
        <div className="flex items-center gap-6">
          {isLoggedIn ? (
            <button onClick={() => router.push('/front/profile')} className="text-sm text-gray-400 hover:text-white transition-colors">Dashboard</button>
          ) : (
            <button onClick={() => router.push('/auth/login')} className="text-sm text-gray-400 hover:text-white transition-colors">Sign In</button>
          )}
          <button 
            onClick={handleStartInterview}
            className="px-5 py-2 bg-white text-black text-sm font-bold rounded-full hover:bg-gray-200 transition-all shadow-lg"
          >
            Start Session
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 px-6 pt-32 pb-40 max-w-7xl mx-auto flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-full text-xs font-bold text-purple-300 mb-10 animate-fade-in uppercase tracking-widest">
          <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
          The Future of Hiring is Multi-Modal
        </div>
        
        <h1 className="text-7xl md:text-9xl font-bold leading-[0.85] mb-10 tracking-tighter">
          Master your
          <br />
          <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">Interview</span>
        </h1>

        <p className="text-xl text-gray-400 max-w-2xl mb-16 leading-relaxed">
          AI-driven behavioral analysis, real-time gaze tracking, and personalized coaching – all synchronized with your specific professional background.
        </p>

        {/* HIGHLIGHTED CENTRAL CTA: RESUME UPLOAD */}
        <div className="relative group animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
          <button 
            onClick={handleUploadResumeClick}
            className="relative px-12 py-6 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-black text-2xl rounded-2xl transition-all hover:scale-105 flex items-center gap-4 shadow-2xl"
          >
            <UploadCloud size={32} strokeWidth={3} />
            {hasResume ? "Update Your Resume" : "Upload Resume to Start"}
          </button>
          
          <div className="mt-6 flex items-center justify-center gap-8 text-gray-500 text-xs font-bold uppercase tracking-widest">
            <span className="flex items-center gap-1.5"><CheckCircle size={14} className="text-green-500" /> Instant Parsing</span>
            <span className="flex items-center gap-1.5"><CheckCircle size={14} className="text-green-500" /> AI Personalization</span>
          </div>
        </div>

        {/* Secondary CTA */}
        <button 
          onClick={handleStartInterview}
          className="mt-12 text-gray-400 hover:text-white font-bold text-sm transition-all border-b border-gray-800 hover:border-white pb-1"
        >
          Or jump straight to Practice Mode →
        </button>
      </section>

      {/* Feature Visualization (ML Bars) */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-40">
          <div className="p-10 bg-white/[0.02] border border-white/10 rounded-3xl backdrop-blur-xl">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                <div className="space-y-6">
                    <h3 className="text-4xl font-bold tracking-tight">Real-time Signal Analysis</h3>
                    <p className="text-gray-400 text-lg leading-relaxed">Our proprietary ranking algorithms analyze behavioral micro-signals, providing assessment that goes beyond traditional sentiment analysis.</p>
                </div>
                <div className="space-y-3">
                  {mlBars.map((bar, i) => (
                    <div key={i} className="flex items-center gap-4 opacity-50 hover:opacity-100 transition-opacity">
                      <div className="w-1.5 h-1.5 bg-purple-500 rounded-full" />
                      <div className="flex-1 h-6 bg-purple-500/20 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500" style={{ width: `${bar.width}%` }} />
                      </div>
                      <div className="text-[10px] font-mono text-gray-500 tracking-tighter">{bar.value.toFixed(4)}</div>
                    </div>
                  ))}
                </div>
             </div>
          </div>
      </section>

      {/* Modal Portal */}
      {isModalOpen && (
        <ResumeUploadModal
          onClose={() => setIsModalOpen(false)}
          onUploadSuccess={() => setHasResume(true)}
        />
      )}

      {/* Role Selection Modal */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1a24] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <button onClick={() => setIsRoleModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white"><X size={20} /></button>
            <h3 className="text-2xl font-bold mb-2">Select Job Role</h3>
            <p className="text-gray-400 text-sm mb-6">The AI will customize your interview based on the selected role.</p>
            <div className="flex flex-col gap-3">
              {ROLES.map(role => (
                <button
                  key={role}
                  onClick={() => handleRoleSelect(role)}
                  className="px-4 py-4 text-left bg-white/5 hover:bg-white/10 border border-white/10 hover:border-purple-500/50 rounded-xl transition-all font-medium text-white flex items-center justify-between"
                >
                  {role}
                  <CheckCircle size={18} className="text-purple-500" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-10 px-6 py-20 max-w-7xl mx-auto border-t border-white/10 text-center">
         <p className="text-gray-500 text-sm tracking-wide">© 2026 InterviewAR Intelligence Systems. All rights reserved.</p>
      </footer>
    </div>
  );
}
