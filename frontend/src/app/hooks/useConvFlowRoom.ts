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
  onTurnEnd: () => void;
  onNewQuestion: (
    questionText: string,
    meta?: { phase?: string; turnIndex?: number; ts?: number; streamId?: string; isFinal?: boolean }
  ) => void;
  stream: MediaStream | null;
}

export function useConvFlowRoom({ onTurnEnd, onNewQuestion, stream }: UseConvFlowRoomOptions) {
  const onTurnEndRef = useRef(onTurnEnd);
  const onNewQuestionRef = useRef(onNewQuestion);
  const lastQuestionEventRef = useRef<string | null>(null);

  useEffect(() => {
    onTurnEndRef.current = onTurnEnd;
  }, [onTurnEnd]);

  useEffect(() => {
    onNewQuestionRef.current = onNewQuestion;
  }, [onNewQuestion]);

  useEffect(() => {
    // We only connect if the parent has provided a stream
    if (!stream) return;
    const activeStream = stream;

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
          onTurnEndRef.current();
          return;
        }

        if (msg.event === "new_question" && typeof msg.question_text === "string") {
          const trimmed = msg.question_text.trim();
          if (!trimmed) return;

          const eventKey = `${msg.stream_id ?? ""}|${msg.is_final ? "1" : "0"}|${trimmed}`;
          if (lastQuestionEventRef.current === eventKey) return;
          lastQuestionEventRef.current = eventKey;

          console.debug("📡 Received new_question", {
            question: trimmed,
            phase: msg.phase,
            turnIndex: msg.turn_index,
            streamId: msg.stream_id,
            isFinal: msg.is_final,
            ts: msg.ts,
          });

          onNewQuestionRef.current(trimmed, {
            phase: typeof msg.phase === "string" ? msg.phase : undefined,
            turnIndex: Number.isFinite(msg.turn_index) ? Number(msg.turn_index) : undefined,
            streamId: typeof msg.stream_id === "string" ? msg.stream_id : undefined,
            isFinal: typeof msg.is_final === "boolean" ? msg.is_final : undefined,
            ts: Number.isFinite(msg.ts) ? Number(msg.ts) : undefined,
          });
        }
      } catch (e) { /* ignore */ }
    });

    async function connect() {
      try {
        const res = await fetch(`${CONVFLOW_BACKEND}/token`);
        const { token } = await res.json();
        await room.connect(LIVEKIT_URL, token);
        console.log("✅ Connected to Agent Room");

        if (activeStream.getAudioTracks().length > 0) {
          const { LocalAudioTrack } = await import("livekit-client");
          const audioTrack = activeStream.getAudioTracks()[0];
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
  }, [stream]); // Re-connect simple logic
}
