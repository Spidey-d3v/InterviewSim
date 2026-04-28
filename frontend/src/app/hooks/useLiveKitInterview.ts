import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConnectionState,
  createLocalAudioTrack,
  createLocalVideoTrack,
  Room,
  RoomEvent,
  type RemoteParticipant,
  Track,
} from 'livekit-client';

interface ConnectParams {
  url: string;
  token: string;
  withAudio?: boolean;
  withVideo?: boolean;
}

interface LiveKitInterviewState {
  room: Room | null;
  isConnecting: boolean;
  isConnected: boolean;
  connectionState: ConnectionState;
  participants: RemoteParticipant[];
  error: string | null;
}

export function useLiveKitInterview() {
  const roomRef = useRef<Room | null>(null);
  const connectRef = useRef<(params: ConnectParams, retries?: number) => Promise<void>>(async () => {});

  const [state, setState] = useState<LiveKitInterviewState>({
    room: null,
    isConnecting: false,
    isConnected: false,
    connectionState: ConnectionState.Disconnected,
    participants: [],
    error: null,
  });

  const _syncParticipants = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    setState((prev) => ({
      ...prev,
      participants: Array.from(room.remoteParticipants.values()),
    }));
  }, []);

  const _syncConnection = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    setState((prev) => ({
      ...prev,
      connectionState: room.state,
      isConnected: room.state === ConnectionState.Connected,
      room,
    }));
  }, []);

  const disconnect = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;

    room.disconnect();
    room.removeAllListeners();
    roomRef.current = null;

    setState((prev) => ({
      ...prev,
      room: null,
      isConnecting: false,
      isConnected: false,
      connectionState: ConnectionState.Disconnected,
      participants: [],
    }));
  }, []);

  const connect = useCallback(async (params: ConnectParams, retries = 3) => {
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: {
          width: 1280,
          height: 720,
          frameRate: 24,
        },
      },
    });

    roomRef.current = room;

    room.on(RoomEvent.ConnectionStateChanged, () => {
      console.log('[LiveKit] Connection state:', room.state);
      _syncConnection();
      if (room.state === ConnectionState.Disconnected) {
        setState((prev) => ({ ...prev, isConnecting: false }));
      }
    });

    room.on(RoomEvent.ParticipantConnected, (p) => {
      console.log('[LiveKit] Participant connected:', p.name);
      _syncParticipants();
    });
    room.on(RoomEvent.ParticipantDisconnected, () => _syncParticipants());
    room.on(RoomEvent.TrackSubscribed, () => {
      _syncParticipants();
    });
    room.on(RoomEvent.Disconnected, () => {
      console.log('[LiveKit] Room disconnected');
      setState((prev) => ({
        ...prev,
        isConnecting: false,
        isConnected: false,
        connectionState: ConnectionState.Disconnected,
      }));
    });

    try {
      console.log('[LiveKit] Connecting to:', params.url, 'with token:', params.token.substring(0, 20) + '...');
      await room.connect(params.url, params.token);
      console.log('[LiveKit] Connected successfully');

      if (params.withAudio ?? true) {
        try {
          const existing = room.localParticipant.getTrackPublication(Track.Source.Microphone);
          if (existing && existing.track) {
            console.log('[LiveKit] Audio track already published — skipping duplicate publish');
          } else {
            const mic = await createLocalAudioTrack();
            await room.localParticipant.publishTrack(mic);
            console.log('[LiveKit] Audio track published');
          }
        } catch (err) {
          console.warn('[LiveKit] Audio track failed:', err instanceof Error ? err.message : err);
        }
      }

      if (params.withVideo ?? true) {
        try {
          const cam = await createLocalVideoTrack();
          await room.localParticipant.publishTrack(cam);
          console.log('[LiveKit] Video track published');
        } catch (err) {
          console.warn('[LiveKit] Video track failed:', err instanceof Error ? err.message : err);
        }
      }

      _syncConnection();
      _syncParticipants();

      setState((prev) => ({
        ...prev,
        room,
        isConnecting: false,
        isConnected: true,
        connectionState: room.state,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect to LiveKit';
      console.error('[LiveKit] Connection error:', message, 'Retries left:', retries - 1);
      
      room.removeAllListeners();
      room.disconnect();
      roomRef.current = null;

      // Retry logic with exponential backoff
      if (retries > 1) {
        const delay = Math.pow(2, 4 - retries) * 1000; // 2s, 4s, 8s
        console.log('[LiveKit] Retrying in', delay, 'ms...');
        setTimeout(() => {
          void connectRef.current(params, retries - 1);
        }, delay);
        return;
      }

      setState((prev) => ({
        ...prev,
        room: null,
        isConnecting: false,
        isConnected: false,
        connectionState: ConnectionState.Disconnected,
        error: message,
      }));
    }
  }, [_syncConnection, _syncParticipants]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    return () => {
      const room = roomRef.current;
      if (!room) return;
      room.disconnect();
      room.removeAllListeners();
      roomRef.current = null;
    };
  }, []);

  const setError = useCallback((message: string | null) => {
    setState((prev) => ({ ...prev, error: message }));
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    setError,
  };
}
