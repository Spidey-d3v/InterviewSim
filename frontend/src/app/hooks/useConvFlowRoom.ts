import { useEffect, useRef, useCallback } from "react";
import {
  Room,
  RoomEvent,
  RemoteTrack,
  Track,
} from "livekit-client";

const CONVFLOW_BACKEND = "http://localhost:8001";
const LIVEKIT_URL = "ws://localhost:7880";

interface NewQuestionMeta {
  phase?: string;
  stream_id?: string;
  is_final?: boolean;
  question_text?: string;
  text?: string;
  [key: string]: unknown;
}

interface UseConvFlowRoomOptions {
  onTurnEnd: (transcript?: string) => void;
  onInterviewEnd?: (scores: Record<string, unknown>) => void;
  onNewQuestion?: (text: string, meta?: NewQuestionMeta) => void;
  stream: MediaStream | null;
  isAiSpeaking?: boolean;
}

export function useConvFlowRoom({ 
  onTurnEnd, 
  onInterviewEnd, 
  onNewQuestion, 
  stream,
  isAiSpeaking = false 
}: UseConvFlowRoomOptions) {
  const onTurnEndRef = useRef(onTurnEnd);
  const onInterviewEndRef = useRef(onInterviewEnd);
  const onNewQuestionRef = useRef(onNewQuestion);
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    onTurnEndRef.current = onTurnEnd;
    onInterviewEndRef.current = onInterviewEnd;
    onNewQuestionRef.current = onNewQuestion;
  }, [onTurnEnd, onInterviewEnd, onNewQuestion]);

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
    if (!stream) return;

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
          onTurnEndRef.current(typeof msg.transcript === 'string' ? msg.transcript : undefined);
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
            // Backend sends 'question_text', not 'text'
            const questionText =
              typeof msg.question_text === 'string'
                ? msg.question_text
                : typeof msg.text === 'string'
                  ? msg.text
                  : '';
            onNewQuestionRef.current(questionText, msg as NewQuestionMeta);
          }
        }
      } catch {
        // Ignore malformed payloads.
      }
    });

    async function connect() {
      try {
        const res = await fetch(`${CONVFLOW_BACKEND}/token`);
        const { token } = await res.json();
        await room.connect(LIVEKIT_URL, token);
        console.log("✅ Connected to Agent Room");

        if (stream && stream.getAudioTracks().length > 0) {
          const { LocalAudioTrack } = await import("livekit-client");
          const audioTrack = stream.getAudioTracks()[0];
          await room.localParticipant.publishTrack(new LocalAudioTrack(audioTrack));
          console.log("🎤 Mic is LIVE");
        }
      } catch (err) {
        console.error("❌ Connection failed:", err);
      }
    }

    connect();

    return () => {
      console.log("🧹 Cleanup");
      room.disconnect();
      roomRef.current = null;
    };
  }, [stream]);

  const disconnect = useCallback(() => {
    if (roomRef.current) {
      console.log("🛑 Explicitly disconnecting from LiveKit room");
      roomRef.current.disconnect();
      roomRef.current = null;
    }
  }, []);

  const sendData = useCallback(async (data: Record<string, unknown>) => {
    if (roomRef.current && roomRef.current.localParticipant) {
      const payload = new TextEncoder().encode(JSON.stringify(data));
      await roomRef.current.localParticipant.publishData(payload, { reliable: true });
    }
  }, []);

  return { disconnect, sendData };
}
