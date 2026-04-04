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
  const chunksRef = useRef<Blob[]>([]);
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

  const startRecording = useCallback((mediaStream?: MediaStream) => {
    const s = mediaStream || stream;
    if (!s) return;
    if (recorderRef.current) return;

    const recorder = new MediaRecorder(s, { mimeType: MIME_TYPE });

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.start(500);
    recorderRef.current = recorder;
    setIsRecording(true);
    console.log("🎬 Rolling recorder started");
  }, [stream]);

  const flushChunk = useCallback(async () => {
    if (chunksRef.current.length === 0) return;

    const idx = chunkIndexRef.current++;
    setChunkCount(idx + 1);
    setPendingUploads((p) => p + 1);

    const blob = new Blob(chunksRef.current, { type: MIME_TYPE });
    chunksRef.current = [];

    const formData = new FormData();
    formData.append("file", blob, `turn_${idx}.webm`);

    try {
      const res = await fetch(`${VISION_SERVER}/upload_video`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setPendingUploads((p) => p - 1);
      onChunkReady(data.video_path, `turn_${idx}`, idx);
    } catch (err) {
      setPendingUploads((p) => p - 1);
      onError?.(`Upload failed: ${err}`);
    }
  }, [onChunkReady, onError]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
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
