import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConnectionState,
  createLocalAudioTrack,
  createLocalVideoTrack,
  Room,
  RoomEvent,
  type RemoteParticipant,
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

  const connect = useCallback(async (params: ConnectParams) => {
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
      _syncConnection();
      if (room.state === ConnectionState.Disconnected) {
        setState((prev) => ({ ...prev, isConnecting: false }));
      }
    });

    room.on(RoomEvent.ParticipantConnected, () => _syncParticipants());
    room.on(RoomEvent.ParticipantDisconnected, () => _syncParticipants());
    room.on(RoomEvent.TrackSubscribed, () => {
      _syncParticipants();
    });
    room.on(RoomEvent.Disconnected, () => {
      setState((prev) => ({
        ...prev,
        isConnecting: false,
        isConnected: false,
        connectionState: ConnectionState.Disconnected,
      }));
    });

    try {
      await room.connect(params.url, params.token);

      if (params.withAudio ?? true) {
        const mic = await createLocalAudioTrack();
        await room.localParticipant.publishTrack(mic);
      }

      if (params.withVideo ?? true) {
        const cam = await createLocalVideoTrack();
        await room.localParticipant.publishTrack(cam);
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
      room.removeAllListeners();
      room.disconnect();
      roomRef.current = null;

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
