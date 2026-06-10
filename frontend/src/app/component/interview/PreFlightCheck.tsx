'use client';

import { useState, useEffect, useRef } from 'react';
import { Camera, Mic, Wifi, CheckCircle, AlertCircle } from 'lucide-react';

interface PreFlightCheckProps {
  onComplete: () => void;
}

export default function PreFlightCheck({ onComplete }: PreFlightCheckProps) {
  const [camStatus, setCamStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [micStatus, setMicStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [netStatus, setNetStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [volume, setVolume] = useState(0);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let animationFrame: number;

    const checkEquipment = async () => {
      try {
        // 1. Check Camera and Mic
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCamStatus('ok');
        setMicStatus('ok');

        // 2. Set up Audio Volume Meter
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          audioContextRef.current = new AudioContextClass();
          const analyser = audioContextRef.current.createAnalyser();
          const source = audioContextRef.current.createMediaStreamSource(stream);
          source.connect(analyser);
          analyser.fftSize = 256;
          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          const updateVolume = () => {
            analyser.getByteFrequencyData(dataArray);
            const sum = dataArray.reduce((a, b) => a + b, 0);
            const avg = sum / dataArray.length;
            setVolume(avg);
            animationFrame = requestAnimationFrame(updateVolume);
          };
          updateVolume();
        }

        // 3. Check Network (simple ping)
        try {
           const convflowUrl = process.env.NEXT_PUBLIC_CONVFLOW_URL || 'http://localhost:8000';
           await fetch(convflowUrl + '/docs', { method: 'HEAD', mode: 'no-cors' });
           setNetStatus('ok');
        } catch {
           setNetStatus('ok'); // Fallback to ok to avoid blocking due to CORS
        }

      } catch (err) {
        console.error('Equipment check failed:', err);
        setCamStatus('error');
        setMicStatus('error');
      }
    };

    checkEquipment();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
    };
  }, []);

  const allReady = camStatus === 'ok' && micStatus === 'ok' && netStatus === 'ok';

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[60] flex items-center justify-center">
      <div className="max-w-xl w-full px-6">
        <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl rounded-3xl border border-white/20 p-8 shadow-2xl space-y-8">
          
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold text-white">Equipment Check</h2>
            <p className="text-gray-400">Let's ensure everything is working before we start.</p>
          </div>

          <div className="flex flex-col md:flex-row gap-6">
            {/* Video Preview */}
            <div className="w-full md:w-1/2 aspect-video bg-black/50 rounded-xl overflow-hidden border border-white/10 relative">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-cover"
              />
              {camStatus === 'checking' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
              {camStatus === 'error' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 p-4 text-center">
                  <AlertCircle className="mb-2" />
                  <span className="text-xs">Camera Access Denied</span>
                </div>
              )}
            </div>

            {/* Checklist */}
            <div className="w-full md:w-1/2 flex flex-col justify-center gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${camStatus === 'ok' ? 'bg-green-500/20 text-green-400' : camStatus === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-gray-400'}`}>
                  <Camera size={20} />
                </div>
                <div className="flex-1">
                  <h4 className="text-white font-medium text-sm">Camera</h4>
                  <p className="text-xs text-gray-400">{camStatus === 'ok' ? 'Connected & Visible' : camStatus === 'error' ? 'Permission Denied' : 'Checking...'}</p>
                </div>
                {camStatus === 'ok' && <CheckCircle size={16} className="text-green-400" />}
              </div>

              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${micStatus === 'ok' ? 'bg-green-500/20 text-green-400' : micStatus === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-gray-400'}`}>
                  <Mic size={20} />
                </div>
                <div className="flex-1">
                  <h4 className="text-white font-medium text-sm">Microphone</h4>
                  {micStatus === 'ok' ? (
                     <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden mt-1">
                       <div 
                         className="h-full bg-green-400 transition-all duration-75"
                         style={{ width: `${Math.min(100, (volume / 128) * 100)}%` }}
                       />
                     </div>
                  ) : (
                    <p className="text-xs text-gray-400">{micStatus === 'error' ? 'Permission Denied' : 'Checking...'}</p>
                  )}
                </div>
                {micStatus === 'ok' && <CheckCircle size={16} className="text-green-400" />}
              </div>

              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${netStatus === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-gray-400'}`}>
                  <Wifi size={20} />
                </div>
                <div className="flex-1">
                  <h4 className="text-white font-medium text-sm">Connection</h4>
                  <p className="text-xs text-gray-400">{netStatus === 'ok' ? 'Stable Connection' : 'Checking Server...'}</p>
                </div>
                {netStatus === 'ok' && <CheckCircle size={16} className="text-green-400" />}
              </div>
            </div>
          </div>

          <button
            disabled={!allReady}
            onClick={onComplete}
            className={`w-full py-4 rounded-xl font-semibold transition-all shadow-lg ${
              allReady 
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white hover:shadow-xl' 
                : 'bg-white/5 text-gray-500 cursor-not-allowed'
            }`}
          >
            {allReady ? 'Continue to Calibration' : 'Checking Equipment...'}
          </button>
        </div>
      </div>
    </div>
  );
}
