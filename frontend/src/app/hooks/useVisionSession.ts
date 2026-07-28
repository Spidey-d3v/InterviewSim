/**
 * useVisionSession Hook
 *
 * Manages WebSocket connection to the Python vision server.
 * Supports both:
 *  - Full-session mode: startSession(videoPath) / stopSession()
 *  - Per-chunk mode:    processChunk(videoPath, chunkId)  ← used for live 15-s recording
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface GazeLogEntry {
  timestamp: string;
  status: string;
  frame_score?: number;
}

export interface ChunkResult {
  chunkId: string;
  chunkIndex: number;
  gaze_data: GazeLogEntry[];
  receivedAt: string;
}

export interface SessionData {
  session_id: string;
  log_data: GazeLogEntry[];
  start_time: string;
  end_time: string;
}

export function useVisionSession() {
  const [isConnected, setIsConnected] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Per-chunk results (chunked recording mode)
  const [chunkResults, setChunkResults] = useState<ChunkResult[]>([]);
  const [processingChunks, setProcessingChunks] = useState<Set<string>>(new Set());
  const [chunkErrors, setChunkErrors] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const connectRef = useRef<() => void>(() => {});
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const reconnectAttemptsRef = useRef<number>(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  // Outbound message queue — holds messages we tried to send while WS was not open
  const outboundQueueRef = useRef<string[]>([]);
  // Per-chunk timeout handles — cleared when chunk_processed/chunk_error arrives
  const chunkTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  // Prevent duplicate chunk entries when replayed results arrive after reconnect.
  const seenChunkIdsRef = useRef<Set<string>>(new Set());

  const _sendOrQueue = useCallback((payload: object) => {
    const json = JSON.stringify(payload);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(json);
    } else {
      console.warn('[useVisionSession] WS not open — queuing message');
      outboundQueueRef.current.push(json);
    }
  }, []);

  const _clearChunkTimeout = useCallback((chunkId: string) => {
    const handle = chunkTimeoutsRef.current.get(chunkId);
    if (handle) {
      clearTimeout(handle);
      chunkTimeoutsRef.current.delete(chunkId);
    }
  }, []);

  const connect = useCallback(() => {
    try {
      const wsBase = (process.env.NEXT_PUBLIC_VISION_URL || 'http://localhost:8000').replace(/^http/, 'ws');
      const ws = new WebSocket(`${wsBase}/ws`);
      
      ws.onopen = () => {
        console.log('✓ Connected to vision server');
        reconnectAttemptsRef.current = 0;  // reset on successful connect
        setIsConnected(true);
        setError(null);
        ws.send(JSON.stringify({ action: 'replay_chunk_results' }));
        // Flush any queued messages
        const queue = outboundQueueRef.current.splice(0);
        queue.forEach((msg) => ws.send(msg));
        if (queue.length) console.log(`[useVisionSession] Flushed ${queue.length} queued message(s)`);

        // Start ping interval to keep Cloudflare tunnel alive
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'ping' }));
          }
        }, 30000); // Ping every 30s
        
        // Attach the interval ID to the websocket object so we can clear it on close
        (ws as any)._pingInterval = pingInterval;
      };
      
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'session_started':
            console.log('✓ Session started:', message.session_id);
            setCurrentSessionId(message.session_id);
            setIsSessionActive(true);
            setSessionData(null);
            break;
            
          case 'session_ended':
            console.log('✓ Session ended:', message.session_id);
            console.log('  Log entries:', message.log_data.length);
            setSessionData(message);
            setIsSessionActive(false);
            setCurrentSessionId(null);
            break;

          case 'chunk_processed': {
            _clearChunkTimeout(message.chunk_id);
            if (seenChunkIdsRef.current.has(message.chunk_id)) {
              setProcessingChunks((prev) => {
                const next = new Set(prev);
                next.delete(message.chunk_id);
                return next;
              });
              break;
            }

            seenChunkIdsRef.current.add(message.chunk_id);
            const result: ChunkResult = {
              chunkId: message.chunk_id,
              chunkIndex: message.chunk_index ?? 0,
              gaze_data: message.gaze_data || [],
              receivedAt: new Date().toISOString(),
            };
            console.log(
              `📦 Chunk processed: ${result.chunkId} | gaze=${result.gaze_data.length} events`
            );
            setChunkResults((prev) => [...prev, result]);
            setProcessingChunks((prev) => {
              const next = new Set(prev);
              next.delete(message.chunk_id);
              return next;
            });
            break;
          }

          case 'replay_complete':
            console.log(
              `[useVisionSession] Replay complete: sent=${message.sent_count ?? 0}, pending=${message.pending_count ?? 0}`
            );
            break;

          case 'chunk_error':
            console.error('Chunk processing error:', message.chunk_id, message.message);
            _clearChunkTimeout(message.chunk_id);
            setChunkErrors((prev) => [...prev, `Chunk ${message.chunk_id?.slice(0, 8)}: ${message.message ?? 'unknown error'}`]);
            setProcessingChunks((prev) => {
              const next = new Set(prev);
              next.delete(message.chunk_id);
              return next;
            });
            break;

          case 'error':
            console.error('Server error:', message.message);
            setError(message.message);
            break;

          case 'status':
            setIsSessionActive(message.is_running);
            if (message.session_id) {
              setCurrentSessionId(message.session_id);
            }
            break;

          default:
            console.log('Unknown message type:', message.type);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('Failed to connect to vision server. Is vision_server.py running?');
      };
      
      ws.onclose = () => {
        if ((ws as any)._pingInterval) {
          clearInterval((ws as any)._pingInterval);
        }
        console.log('Disconnected from vision server');
        setIsConnected(false);
        setIsSessionActive(false);

        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          // Exponential back-off: 1s, 2s, 4s, 8s, 16s (capped at 30s)
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30_000);
          console.log(
            `[useVisionSession] Reconnecting in ${delay}ms ` +
            `(attempt ${reconnectAttemptsRef.current + 1}/${MAX_RECONNECT_ATTEMPTS})...`
          );
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(() => connectRef.current(), delay);
        } else {
          console.warn('[useVisionSession] Max reconnect attempts reached.');
          setError('Cannot connect to vision server. Please refresh the page.');
        }
      };
      
      wsRef.current = ws;
      
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setError('Failed to connect to vision server');
    }
  }, [_clearChunkTimeout]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS; // prevent auto-reconnect on explicit disconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  /**
   * Start a full-video session. videoPath must be the server-local path returned
   * by POST /upload_video. Used for post-interview analysis of the full recording.
   */
  const startSession = useCallback((videoPath: string) => {
    _sendOrQueue({ action: 'start_session', video_path: videoPath });
  }, [_sendOrQueue]);

  /**
   * Send a 15-s video chunk to the server for parallel processing:
   * vision.py (gaze) + VideoMAE (confidence) + FacialExpression + voice_analyzer.
   */
  const processChunk = useCallback(
    (videoPath: string, chunkId: string, chunkIndex: number = 0) => {
      seenChunkIdsRef.current.delete(chunkId);
      setProcessingChunks((prev) => new Set(prev).add(chunkId));

      // 2-minute timeout — if server never responds, clear the spinner
      const timeoutHandle = setTimeout(() => {
        console.warn(`[useVisionSession] Chunk ${chunkId} timed out after 120s`);
        setProcessingChunks((prev) => {
          const next = new Set(prev);
          next.delete(chunkId);
          return next;
        });
        chunkTimeoutsRef.current.delete(chunkId);
      }, 120_000);
      chunkTimeoutsRef.current.set(chunkId, timeoutHandle);

      _sendOrQueue({
        action: 'process_chunk',
        video_path: videoPath,
        chunk_id: chunkId,
        chunk_index: chunkIndex,
      });
      console.log(`[useVisionSession] process_chunk sent/queued: ${chunkId} → ${videoPath}`);
    },
    [_sendOrQueue]
  );

  const stopSession = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Not connected to server');
      return;
    }
    
    wsRef.current.send(JSON.stringify({ action: 'stop_session' }));
  }, []);

  const getStatus = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    
    wsRef.current.send(JSON.stringify({ action: 'get_status' }));
  }, []);

  const clearChunkErrors = useCallback(() => setChunkErrors([]), []);
  const dismissChunkError = useCallback(
    (index: number) => setChunkErrors((prev) => prev.filter((_, i) => i !== index)),
    []
  );

  /** Manually reconnect — resets the back-off counter so retries resume. */
  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    connect();
  }, [connect]);

  // Auto-connect on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      connectRef.current();
    }, 0);
    
    return () => {
      clearTimeout(timer);
      disconnect();
    };
  }, [disconnect]);

  return {
    // Connection state
    isConnected,
    error,

    // Full-session state
    isSessionActive,
    currentSessionId,
    sessionData,

    // Per-chunk state
    chunkResults,
    processingChunks,
    pendingChunks: processingChunks.size,
    chunkErrors,
    clearChunkErrors,
    dismissChunkError,
    
    // Actions
    startSession,
    stopSession,
    processChunk,
    getStatus,
    reconnect,
  };
}
