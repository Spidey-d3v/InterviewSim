import { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// Suppress benign MediaPipe C++ logs that trigger the Next.js Red Error Overlay
if (typeof console !== 'undefined') {
  const originalError = console.error;
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('XNNPACK delegate')) return;
    originalError(...args);
  };
}

export interface TelemetryData {
  gazeDarting: number;    // 0 to 1
  smile: number;          // 0 to 1
  frown: number;          // 0 to 1
  volumeVariance: number; // 0 to 1 (shaky voice)
  isSpeaking: boolean;
}

export function useTelemetry(stream: MediaStream | null, isActive: boolean) {
  const [telemetry, setTelemetry] = useState<TelemetryData>({
    gazeDarting: 0, smile: 0, frown: 0, volumeVariance: 0, isSpeaking: false
  });

  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  
  // EMA tracking refs
  const gazeEmaRef = useRef(0);
  const dartingEmaRef = useRef(0);
  const smileEmaRef = useRef(0);
  const frownEmaRef = useRef(0);
  
  // Audio state refs
  const prevVolumeRef = useRef(0);
  const volumeVarianceEmaRef = useRef(0);

  // Initialize MediaPipe Vision Tasks
  useEffect(() => {
    let active = true;
    async function initVision() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "CPU"
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1
        });
        if (active) landmarkerRef.current = landmarker;
        console.log("✅ MediaPipe Face Landmarker loaded");
      } catch (err) {
        console.error("Failed to load MediaPipe:", err);
      }
    }
    initVision();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isActive || !stream) return;

    // 1. Audio setup
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    
    let source: MediaStreamAudioSourceNode | null = null;
    if (stream.getAudioTracks().length > 0) {
      source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
    }

    // 2. Video setup
    let videoEl: HTMLVideoElement | null = null;
    let offscreenCanvas: HTMLCanvasElement | null = null;
    let offscreenCtx: CanvasRenderingContext2D | null = null;

    if (stream.getVideoTracks().length > 0) {
      videoEl = document.createElement('video');
      videoEl.autoplay = true;
      videoEl.playsInline = true;
      videoEl.muted = true;
      videoEl.style.position = 'fixed';
      videoEl.style.opacity = '0';
      videoEl.style.pointerEvents = 'none';
      document.body.appendChild(videoEl);
      
      videoEl.srcObject = new MediaStream([stream.getVideoTracks()[0]]);
      
      offscreenCanvas = document.createElement('canvas');
      offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
    }
    
    let animationFrameId: number;
    let lastVideoTime = -1;
    let syntheticTimestamp = 0;

    async function processFrame() {
      if (!isActive) return;

      // -- A. Vision processing --
      if (
        landmarkerRef.current && 
        videoEl && 
        videoEl.readyState >= 2 && 
        videoEl.videoWidth > 0 &&
        videoEl.videoHeight > 0 &&
        videoEl.currentTime !== lastVideoTime
      ) {
        lastVideoTime = videoEl.currentTime;
        syntheticTimestamp += 16; 
        
        try {
          if (offscreenCanvas && offscreenCtx) {
            offscreenCanvas.width = videoEl.videoWidth;
            offscreenCanvas.height = videoEl.videoHeight;
            offscreenCtx.drawImage(videoEl, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
            
            const results = landmarkerRef.current.detectForVideo(offscreenCanvas, syntheticTimestamp);
            
            if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
          const shapes = results.faceBlendshapes[0].categories;
          const getShape = (name: string) => shapes.find(s => s.categoryName === name)?.score || 0;
          
          // Expressions
          const rawSmile = (getShape('mouthSmileLeft') + getShape('mouthSmileRight')) / 2;
          const rawFrown = (getShape('browDownLeft') + getShape('browDownRight')) / 2;
          
          // Gaze Darting
          const eyeLookIn = getShape('eyeLookInLeft') + getShape('eyeLookInRight');
          const eyeLookOut = getShape('eyeLookOutLeft') + getShape('eyeLookOutRight');
          const eyeLookUp = getShape('eyeLookUpLeft') + getShape('eyeLookUpRight');
          const eyeLookDown = getShape('eyeLookDownLeft') + getShape('eyeLookDownRight');
          
          const gazeDevX = Math.abs(eyeLookIn - eyeLookOut);
          const gazeDevY = Math.abs(eyeLookUp - eyeLookDown);
          const currentGaze = gazeDevX + gazeDevY;
          
          // EMA Smoothing
          smileEmaRef.current = smileEmaRef.current * 0.8 + rawSmile * 0.2;
          frownEmaRef.current = frownEmaRef.current * 0.8 + rawFrown * 0.2;
          
          const darting = Math.abs(currentGaze - gazeEmaRef.current);
          gazeEmaRef.current = gazeEmaRef.current * 0.8 + currentGaze * 0.2;
          dartingEmaRef.current = dartingEmaRef.current * 0.9 + darting * 0.1;
          }
          }
        } catch (err) {
          console.warn("MediaPipe detectForVideo error skipped:", err);
        }
      }

      // -- B. Audio processing --
      let isSpeaking = false;
      if (analyser) {
        const dataArray = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(dataArray);
        
        let sumSquares = 0.0;
        for (let i = 0; i < dataArray.length; i++) {
          sumSquares += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        
        isSpeaking = rms > 0.02;
        
        if (isSpeaking) {
          const variance = Math.abs(rms - prevVolumeRef.current);
          volumeVarianceEmaRef.current = volumeVarianceEmaRef.current * 0.9 + variance * 0.1;
        } else {
          volumeVarianceEmaRef.current *= 0.95; 
        }
        prevVolumeRef.current = rms;
      }

      setTelemetry({
        gazeDarting: Math.min(1, dartingEmaRef.current * 20),
        smile: Math.min(1, smileEmaRef.current * 1.5), 
        frown: Math.min(1, frownEmaRef.current * 1.5),
        volumeVariance: Math.min(1, volumeVarianceEmaRef.current * 50),
        isSpeaking
      });

      animationFrameId = requestAnimationFrame(processFrame);
    }

    if (videoEl) {
      videoEl.onloadeddata = () => {
        videoEl?.play().catch(e => console.warn("video play error:", e));
        requestAnimationFrame(processFrame);
      };
    } else {
      requestAnimationFrame(processFrame);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (audioCtx.state !== 'closed') audioCtx.close();
      if (videoEl) {
        videoEl.srcObject = null;
        if (videoEl.parentNode) videoEl.remove();
      }
    };
  }, [stream, isActive]);

  return telemetry;
}
