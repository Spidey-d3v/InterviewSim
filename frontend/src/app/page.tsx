'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud, X, CheckCircle } from 'lucide-react';
import ResumeUploadModal from './component/ResumeUploadModal';
import { createClient } from '@/utils/supabase';

export default function LandingPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [hasResume, setHasResume] = useState<boolean | null>(null);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [mlBars] = useState<Array<{ width: number; value: number }>>(() =>
    Array.from({ length: 12 }).map(() => ({
      width: Math.random() * 40 + 60,
      value: Math.random() * 0.3 + 0.7,
    }))
  );
  const heroRef = useRef<HTMLDivElement>(null);

  const ROLES = [
    'Full Stack Developer',
    'AI Engineer',
    'DevOps Engineer',
    'Electrical and Computer Science Engineer',
    'Cybersecurity'
  ];

  const checkAuthStatus = useCallback(async () => {
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
      const hasText = !!(profile.resume_text?.trim());
      const hasJson = !!profile.resume_json;
      setHasResume(hasText || hasJson);
    } else {
      setHasResume(false);
    }
  }, [supabase]);

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
    const timer = window.setTimeout(() => {
      void checkAuthStatus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [checkAuthStatus]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => setMousePosition({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-in');
          }
        });
      },
      { threshold: 0.1 }
    );
    document.querySelectorAll('.fade-in-section').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const stats = [
    { value: '250K+', label: 'Interviews Conducted' },
    { value: '94%', label: 'Success Rate' },
    { value: '2.8M', label: 'Data Points Analyzed' },
    { value: '<100ms', label: 'Response Time' }
  ];

  const features = [
    {
      title: 'Real-time Behavior Analysis',
      description: 'Advanced ML models analyze facial expressions, body language, and micro-gestures to provide instant feedback on candidate confidence and engagement.',
      metric: '98.7%',
      metricLabel: 'Accuracy',
      delay: '0s'
    },
    {
      title: 'Adaptive Question Engine',
      description: 'Dynamic interview flow that adjusts difficulty and topics based on real-time performance indicators and behavioral cues.',
      metric: '3.2x',
      metricLabel: 'Faster Assessment',
      delay: '0.1s'
    },
    {
      title: 'Voice & Speech Analytics',
      description: 'Comprehensive analysis of speaking patterns, pace, clarity, and vocal confidence with actionable improvement recommendations.',
      metric: '15+',
      metricLabel: 'Voice Metrics',
      delay: '0.2s'
    },
    {
      title: 'AR-Enhanced Feedback',
      description: 'Immersive augmented reality overlays that visualize performance metrics and provide spatial awareness training for interviews.',
      metric: '4K',
      metricLabel: 'Video Quality',
      delay: '0.3s'
    }
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-visible" suppressHydrationWarning>
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

        <div className="hidden md:flex items-center gap-8 text-sm">
          <a href="#product" className="text-gray-400 hover:text-white transition-colors">Product</a>
          <a href="#features" className="text-gray-400 hover:text-white transition-colors">Features</a>
          <a href="#technology" className="text-gray-400 hover:text-white transition-colors">Technology</a>
        </div>

        <div className="flex items-center gap-4">
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
      <section className="relative z-10 px-6 pt-20 pb-32 max-w-7xl mx-auto" ref={heroRef}>
        <div className="max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full text-sm text-purple-300 mb-8 animate-fade-in uppercase tracking-widest font-bold">
            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" />
            AI-Powered Interview Intelligence
          </div>

          <h1 className="text-6xl md:text-8xl font-bold leading-[0.9] mb-8 animate-fade-in-up tracking-tight">
            Master your
            <br />
            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">Interview</span>
            <br />
            with data
          </h1>

          <p className="text-xl text-gray-400 max-w-2xl mb-12 leading-relaxed animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            Multi-modal analysis, real-time gaze tracking, and personalized coaching – end-to-end intelligence for your career growth.
          </p>

          <div className="flex flex-col md:flex-row items-center gap-6 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
            {/* Start Session (Primary Action) - 2 parts width */}
            <div className="relative group w-full md:w-[66%]">
              <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
              <button
                onClick={handleStartInterview}
                className="relative w-full px-8 py-5 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-black text-xl rounded-2xl transition-all hover:scale-[1.02] flex items-center justify-center gap-4 shadow-2xl"
              >
                Start Session
              </button>
            </div>

            {/* Update Resume (Secondary Action) - 1 part width */}
            <div className="relative group w-full md:w-[33%]">
              <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl blur opacity-10 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
              <button
                onClick={handleUploadResumeClick}
                className="relative w-full px-6 py-5 bg-white/5 border border-white/10 text-white font-bold text-lg rounded-2xl transition-all hover:bg-white/10 flex items-center justify-center gap-3 backdrop-blur-md"
              >
                <UploadCloud size={22} />
                {hasResume ? "Update Resume" : "Upload Resume"}
              </button>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-6 text-gray-500 text-[10px] font-bold uppercase tracking-widest ml-1 animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
            <span className="flex items-center gap-1.5"><CheckCircle size={12} className="text-green-500" /> Instant Parsing</span>
            <span className="flex items-center gap-1.5"><CheckCircle size={12} className="text-green-500" /> AI Question Gen</span>
            <span className="flex items-center gap-1.5"><CheckCircle size={12} className="text-green-500" /> Real-time Feedback</span>
          </div>
        </div>

        {/* Floating Data Visualization */}
        <div className="absolute right-0 top-20 w-[450px] h-[350px] hidden xl:block">
          <div className="relative w-full h-full animate-float">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl backdrop-blur-sm border border-white/10 p-6 shadow-2xl">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-xs text-gray-400 font-mono">LIVE AI ANALYTICS</span>
              </div>
              <div className="space-y-4 text-xs">
                <div className="flex justify-between items-center"><span className="text-gray-300">Confidence</span><span className="font-bold text-green-400">87%</span></div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-green-500 to-emerald-400 w-[87%]" /></div>
                <div className="flex justify-between items-center mt-4"><span className="text-gray-300">Eye Contact</span><span className="font-bold text-blue-400">Stable</span></div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 w-[92%]" /></div>
                <div className="flex justify-between items-center mt-4"><span className="text-gray-300">Tone Analysis</span><span className="font-bold text-purple-400">Professional</span></div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-purple-500 to-pink-400 w-[94%]" /></div>
              </div>
              <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-3 gap-2 text-center font-mono">
                <div><div className="text-lg font-bold">2.3s</div><div className="text-[8px] text-gray-500">Latency</div></div>
                <div><div className="text-lg font-bold">156</div><div className="text-[8px] text-gray-500">WPM</div></div>
                <div><div className="text-lg font-bold">12</div><div className="text-[8px] text-gray-500">Signals</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="relative z-10 px-6 pb-20 max-w-7xl mx-auto fade-in-section">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <div key={index} className="text-center animate-fade-in-up" style={{ animationDelay: `${index * 0.1}s` }}>
              <div className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent mb-2">{stat.value}</div>
              <div className="text-sm text-gray-500">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative z-10 px-6 py-32 max-w-7xl mx-auto fade-in-section">
        <div className="mb-16">
          <h2 className="text-5xl font-bold mb-4">Next-generation<br /><span className="text-gray-600">interview intelligence</span></h2>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {features.map((feature, index) => (
            <div key={index} className="group relative p-8 bg-gradient-to-br from-white/5 to-white/[0.02] rounded-2xl border border-white/10 hover:border-purple-500/50 transition-all duration-500 animate-fade-in-up" style={{ animationDelay: feature.delay }}>
              <div className="relative">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-2xl font-bold">{feature.title}</h3>
                  <div className="text-right">
                    <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">{feature.metric}</div>
                    <div className="text-xs text-gray-500">{feature.metricLabel}</div>
                  </div>
                </div>
                <p className="text-gray-400 leading-relaxed">{feature.description}</p>
                <div className="mt-6 flex items-center gap-2 text-sm text-purple-400 group-hover:text-purple-300 transition-colors">
                  Learn more
                  <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Technology Section */}
      <section className="relative z-10 px-6 py-32 max-w-7xl mx-auto fade-in-section">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-sm text-blue-300 mb-6 font-bold uppercase tracking-wider">Powered by Advanced ML</div>
            <h2 className="text-5xl font-bold mb-6">Ranking-based<br /><span className="text-gray-600">machine learning</span></h2>
            <p className="text-xl text-gray-400 mb-8 leading-relaxed">Our proprietary ranking algorithms analyze behavioral micro-signals simultaneously, providing assessment that goes beyond traditional keyword matching.</p>
            <ul className="space-y-4">
              {['Multi-modal analysis (video, audio, text)', 'Temporal pattern recognition', 'Context-aware feedback generation', 'Bias-free candidate evaluation'].map((item, index) => (
                <li key={index} className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-purple-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  <span className="text-gray-300">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative h-[500px]">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl backdrop-blur-sm border border-white/10 p-8 overflow-hidden">
              <div className="space-y-3">
                {mlBars.map((bar, i) => (
                  <div key={i} className="flex items-center gap-4 animate-slide-in" style={{ animationDelay: `${i * 0.1}s`, opacity: 1 - (i * 0.08) }}>
                    <div className="w-2 h-2 bg-purple-400 rounded-full" />
                    <div
                      className="flex-1 h-8 bg-gradient-to-r from-purple-500/40 to-transparent rounded"
                      style={{ width: `${bar.width}%` }}
                      suppressHydrationWarning
                    />
                    <div className="text-xs text-gray-500 font-mono" suppressHydrationWarning>
                      {bar.value.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-16 max-w-7xl mx-auto border-t border-white/10 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded flex items-center justify-center font-bold text-[10px]">AI</div>
          <span className="font-bold tracking-tight">InterviewAR</span>
        </div>
        <p className="text-sm text-gray-500">© 2026 InterviewAR Intelligence Systems. All rights reserved.</p>
      </footer>

      {/* Modal Portal */}
      {isModalOpen && (
        <ResumeUploadModal
          onClose={() => setIsModalOpen(false)}
          onUploadSuccess={() => { checkAuthStatus(); setIsModalOpen(false); }}
        />
      )}

      {/* Role Selection Modal */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1a24] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <button onClick={() => setIsRoleModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white"><X size={20} /></button>
            <h3 className="text-2xl font-bold mb-2 uppercase tracking-tighter">Select Job Role</h3>
            <p className="text-gray-400 text-sm mb-6">Choose the domain for your custom AI evaluation.</p>
            <div className="flex flex-col gap-3">
              {ROLES.map(role => (
                <button key={role} onClick={() => handleRoleSelect(role)} className="px-4 py-4 text-left bg-white/5 hover:bg-white/10 border border-white/10 hover:border-purple-500/50 rounded-xl transition-all font-medium text-white group flex items-center justify-between">
                  {role}
                  <CheckCircle size={18} className="text-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
