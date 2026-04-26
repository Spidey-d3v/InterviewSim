'use client';

import { useState, useRef, useCallback } from "react";

const VISION_SERVER = "http://localhost:8000";
const MIME_TYPE = "video/webm;codecs=vp8,opus";

export interface ChunkedRecorderOptions {
  onChunkReady: (videoPath: string, chunkId: string, chunkIndex: number) => void;
  onError?: (msg: string) => void;
}

export function useChunkedRecorder({ onChunkReady, onError }: ChunkedRecorderOptions) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunkIndexRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);

  const requestPermissions = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
      streamRef.current = s;
      setStream(s);
      setPermissionGranted(true);
      setPermissionError(null);
      return s;
    } catch (err: unknown) {
      const msg = `Permission error: ${err instanceof Error ? err.message : 'Unknown error'}`;
      setPermissionError(msg);
      onError?.(msg);
      return null;
    }
  }, [onError]);

  const startOneRecorder = useCallback((s: MediaStream) => {
    const recorder = new MediaRecorder(s, { mimeType: MIME_TYPE });
    recorderRef.current = recorder;

    recorder.ondataavailable = async (e) => {
      if (!e.data || e.data.size < 1000) return;

      const idx = chunkIndexRef.current++;
      setChunkCount(idx + 1);
      setPendingUploads((p) => p + 1);

      console.log(`📤 Uploading video chunk: ${(e.data.size / 1024).toFixed(1)} KB`);

      const formData = new FormData();
      formData.append("file", e.data, `turn_${Date.now()}.webm`);

      try {
        const res = await fetch(`${VISION_SERVER}/upload_video`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        console.log("✅ Vision server received chunk at:", data.video_path);
        setPendingUploads((p) => p - 1);
        onChunkReady(data.video_path, `turn_${idx}`, idx);
      } catch (err) {
        console.error("❌ Vision server upload failed:", err);
        setPendingUploads((p) => p - 1);
        onError?.(`Upload failed: ${err}`);
      }
    };

    recorder.start();
  }, [onChunkReady, onError]);

  const startRecording = useCallback((mediaStream?: MediaStream) => {
    const s = mediaStream || streamRef.current;
    if (!s) return;
    if (recorderRef.current && recorderRef.current.state === 'recording') return;

    startOneRecorder(s);
    setIsRecording(true);
    console.log("🎬 Rolling recorder started (standalone chunk mode)");
  }, [startOneRecorder]);

  const flushChunk = useCallback(() => {
    const recorder = recorderRef.current;
    const s = streamRef.current;
    if (!recorder || recorder.state !== 'recording' || !s) {
      console.warn("⚠️ flushChunk called but recorder is not active");
      return;
    }

    // Stop current recorder to fire ondataavailable with a COMPLETE file (with EBML header)
    recorder.stop();
    
    // Immediately start a new one for the next turn
    startOneRecorder(s);
    console.log("🔄 Chunk flushed and recorder restarted");
  }, [startOneRecorder]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    setIsRecording(false);
    console.log("🛑 Recorder stopped");
  }, []);

  const releaseStream = useCallback(() => {
    stopRecording();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setPermissionGranted(false);
    setChunkCount(0);
  }, [stopRecording]);

  return {
    stream,
    isRecording,
    chunkCount,
    pendingUploads,
    permissionGranted,
    permissionError,
    requestPermissions,
    start: startRecording,
    stop: stopRecording,
    startRecording,
    stopRecording,
    flushChunk,
    releaseStream,
  };
}
