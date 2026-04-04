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

  const requestPermissions = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
      setStream(s);
      setPermissionGranted(true);
      setPermissionError(null);
      return s;
    } catch (err: any) {
      const msg = `Permission error: ${err.message}`;
      setPermissionError(msg);
      onError?.(msg);
      return null;
    }
  }, [onError]);

  const uploadBlob = useCallback(async (blob: Blob, index: number) => {
    setPendingUploads((p) => p + 1);
    const formData = new FormData();
    formData.append("file", blob, `turn_${index}.webm`);

    try {
      const res = await fetch(`${VISION_SERVER}/upload_video`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      onChunkReady(data.video_path, `turn_${index}`, index);
    } catch (err) {
      console.error("❌ Upload failed:", err);
      onError?.(`Upload failed: ${err}`);
    } finally {
      setPendingUploads((p) => p - 1);
    }
  }, [onChunkReady, onError]);

  const startRecording = useCallback((mediaStream?: MediaStream) => {
    const s = mediaStream || stream;
    if (!s) return;
    
    // If already recording, don't restart unless explicitly requested via flush
    if (recorderRef.current && recorderRef.current.state === "recording") return;

    const recorder = new MediaRecorder(s, { mimeType: MIME_TYPE });

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        const idx = chunkIndexRef.current++;
        setChunkCount(idx + 1);
        uploadBlob(e.data, idx);
      }
    };

    recorder.start(); // No timeslice -> fires only on stop()
    recorderRef.current = recorder;
    setIsRecording(true);
    console.log("🎬 Standalone recorder started (header per chunk mode)");
  }, [stream, uploadBlob]);

  const flushChunk = useCallback(() => {
    if (!recorderRef.current || recorderRef.current.state !== "recording") {
      console.warn("⚠️ flushChunk called but recorder is not active");
      return;
    }

    console.log("🔄 Flushing current chunk (restarting recorder)...");
    
    // 1. Stop current recorder (triggers ondataavailable with full file + header)
    recorderRef.current.stop();
    
    // 2. Immediately start a new recorder for the next turn
    // (We don't need to wait for ondataavailable because it's async)
    startRecording();
  }, [startRecording]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    setIsRecording(false);
    console.log("🛑 Recorder stopped");
  }, []);

  const releaseStream = useCallback(() => {
    stopRecording();
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setPermissionGranted(false);
    setChunkCount(0);
  }, [stopRecording, stream]);

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
