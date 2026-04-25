import { useEffect, useRef } from "react";
import {
  Room,
  RoomEvent,
  RemoteTrack,
  Track,
} from "livekit-client";

const CONVFLOW_BACKEND = "http://localhost:8001";
const LIVEKIT_URL = "ws://localhost:7880";

interface UseConvFlowRoomOptions {
  onTurnEnd: (transcript?: string) => void;
  onInterviewEnd?: (scores: any) => void;
  onNewQuestion?: (text: string, meta?: any) => void;
  stream: MediaStream | null;
}

export function useConvFlowRoom({ onTurnEnd, onInterviewEnd, onNewQuestion, stream }: UseConvFlowRoomOptions) {
  const onTurnEndRef = useRef(onTurnEnd);
  const onInterviewEndRef = useRef(onInterviewEnd);
  const onNewQuestionRef = useRef(onNewQuestion);

  useEffect(() => {
    onTurnEndRef.current = onTurnEnd;
    onInterviewEndRef.current = onInterviewEnd;
    onNewQuestionRef.current = onNewQuestion;
  }, [onTurnEnd, onInterviewEnd, onNewQuestion]);

  useEffect(() => {
    if (!stream) return;

    const room = new Room();

    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        track.attach();
        console.log("🔊 Agent voice playing");
      }
    });

    room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        
        if (msg.event === "turn_end") {
          console.log("📡 turn_end received — triggering video flush");
          onTurnEndRef.current(msg.transcript);
        }

        if (msg.event === "interview_end") {
          console.log("🏁 Interview over! Received final scores:", msg.final_scores);
          if (onInterviewEndRef.current) {
            onInterviewEndRef.current(msg.final_scores);
          }
        }

        if (msg.event === "new_question") {
          if (onNewQuestionRef.current) {
            // Backend sends 'question_text', not 'text'
            onNewQuestionRef.current(msg.question_text || msg.text, msg);
          }
        }
      } catch (e) { /* ignore */ }
    });

    async function connect() {
      try {
        const res = await fetch(`${CONVFLOW_BACKEND}/token`);
        const { token } = await res.json();
        await room.connect(LIVEKIT_URL, token);
        console.log("✅ Connected to Agent Room");

        if (stream.getAudioTracks().length > 0) {
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
    };
  }, [stream]);
}
