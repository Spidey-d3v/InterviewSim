import { useEffect, useRef, useCallback, useState } from "react";
import {
  Room,
  RoomEvent,
  RemoteTrack,
  Track,
} from "livekit-client";
import { getLiveKitToken, clearLiveKitToken } from "../../utils/livekitToken";

const CONVFLOW_BACKEND = process.env.NEXT_PUBLIC_CONVFLOW_URL || "http://localhost:8001";
const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || "ws://localhost:7880";

interface NewQuestionMeta {
  phase?: string;
  stream_id?: string;
  is_final?: boolean;
  question_text?: string;
  text?: string;
  [key: string]: unknown;
}

interface UseConvFlowRoomOptions {
  onTurnEnd: (transcript?: string, audioDurationSec?: number) => void;
  onInterviewEnd?: (scores: Record<string, unknown>) => void;
  onNewQuestion?: (text: string, meta?: NewQuestionMeta) => void;
  onGazeMetrics?: (data: any) => void;
  stream: MediaStream | null;
  isAiSpeaking?: boolean;
  sessionId?: string | null;
}

export function useConvFlowRoom({ 
  onTurnEnd, 
  onInterviewEnd, 
  onNewQuestion, 
  onGazeMetrics,
  stream,
  isAiSpeaking = false,
  sessionId 
}: UseConvFlowRoomOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const onTurnEndRef = useRef(onTurnEnd);
  const onInterviewEndRef = useRef(onInterviewEnd);
  const onNewQuestionRef = useRef(onNewQuestion);
  const onGazeMetricsRef = useRef(onGazeMetrics);
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    onTurnEndRef.current = onTurnEnd;
    onInterviewEndRef.current = onInterviewEnd;
    onNewQuestionRef.current = onNewQuestion;
    onGazeMetricsRef.current = onGazeMetrics;
  }, [onTurnEnd, onInterviewEnd, onNewQuestion, onGazeMetrics]);

  // Phase 2 Fix: Mute local mic when AI is speaking
  useEffect(() => {
    const room = roomRef.current;
    if (room && room.localParticipant) {
      const audioPublication = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (audioPublication && audioPublication.track) {
        if (isAiSpeaking) {
          console.log("🤐 Muting local mic (AI speaking)");
          audioPublication.track.mute();
        } else {
          console.log("🎤 Unmuting local mic");
          audioPublication.track.unmute();
        }
      }
    }
  }, [isAiSpeaking]);

  useEffect(() => {
    if (!stream || !sessionId) return;

    // Prevent duplicate connections: if a room already exists, skip connecting again.
    if (roomRef.current) {
      console.log('useConvFlowRoom: room already exists, skipping connect');
      return;
    }

    const room = new Room();
    roomRef.current = room;

    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        track.attach();
        console.log("🔊 Agent voice playing");
      }
    });

    room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
      try {
        const parsed: unknown = JSON.parse(new TextDecoder().decode(payload));
        if (!parsed || typeof parsed !== 'object') return;
        const msg = parsed as Record<string, unknown>;
        const event = typeof msg.event === 'string' ? msg.event : '';
        
        if (event === "turn_end") {
          console.log("📡 turn_end received — triggering video flush");
          onTurnEndRef.current(
            typeof msg.transcript === 'string' ? msg.transcript : undefined,
            typeof msg.audio_duration_sec === 'number' ? msg.audio_duration_sec : undefined
          );
        }

        if (event === "interview_end") {
          console.log("🏁 Interview over! Received final scores:", msg.final_scores);
          if (onInterviewEndRef.current) {
            const scores = msg.final_scores && typeof msg.final_scores === 'object'
              ? (msg.final_scores as Record<string, unknown>)
              : {};
            onInterviewEndRef.current(scores);
          }
        }

        if (event === "new_question") {
          if (onNewQuestionRef.current) {
            const questionText =
              typeof msg.question_text === 'string'
                ? msg.question_text
                : typeof msg.text === 'string'
                  ? msg.text
                  : '';
            onNewQuestionRef.current(questionText, msg as NewQuestionMeta);
          }
        }

        if (event === "chunk_processed") {
          // Worker sends chunks of gaze data
          if (onGazeMetricsRef.current) {
            onGazeMetricsRef.current(msg);
          }
        }
      } catch {
        // Ignore malformed payloads.
      }
    });

    async function connect(signal?: AbortSignal) {
      try {
        // Use cached token to ensure only one /token request per client join
        const token = await getLiveKitToken(false, undefined, undefined, sessionId);
        if (signal?.aborted) {
          console.log('useConvFlowRoom: aborted before connecting');
          return;
        }
        await room.connect(LIVEKIT_URL, token);
        console.log("✅ Connected to Agent Room");

        if (stream && stream.getAudioTracks().length > 0) {
          const { LocalAudioTrack, LocalVideoTrack } = await import("livekit-client");
          const audioTrack = stream.getAudioTracks()[0];
          const existingAudio = room.localParticipant.getTrackPublication(Track.Source.Microphone);
          if (!existingAudio) {
            await room.localParticipant.publishTrack(new LocalAudioTrack(audioTrack));
            console.log("🎤 Mic is LIVE");
          }

          if (stream.getVideoTracks().length > 0) {
            const videoTrack = stream.getVideoTracks()[0];
            const existingVideo = room.localParticipant.getTrackPublication(Track.Source.Camera);
            if (!existingVideo) {
              await room.localParticipant.publishTrack(new LocalVideoTrack(videoTrack), { simulcast: false });
              console.log("📷 Camera is LIVE for WebRTC Vision Analysis (Simulcast Disabled)");
            }
          }
        }
      } catch (err) {
        if ((err as any)?.name === 'AbortError') {
          console.log('useConvFlowRoom: token fetch aborted');
          return;
        }
        console.error("❌ Connection failed:", err);
      }
    }

    const ac = new AbortController();
    void connect(ac.signal);

    return () => {
      console.log("🧹 Cleanup");
      // Abort any in-flight token fetch
      try { ac.abort(); } catch {}
      room.disconnect();
      roomRef.current = null;
    };
  }, [stream, sessionId]);

  const disconnect = useCallback(() => {
    if (roomRef.current) {
      console.log("🛑 Explicitly disconnecting from LiveKit room");
      roomRef.current.disconnect();
      roomRef.current = null;
    }
  }, []);

  const sendData = useCallback(async (data: Record<string, unknown>) => {
    if (roomRef.current && roomRef.current.localParticipant) {
      try {
        const payload = new TextEncoder().encode(JSON.stringify(data));
        await roomRef.current.localParticipant.publishData(payload, { reliable: true });
      } catch (err) {
        console.warn("Failed to send data to LiveKit room (it may be closed already):", err);
      }
    }
  }, []);

  return { disconnect, sendData };
}
