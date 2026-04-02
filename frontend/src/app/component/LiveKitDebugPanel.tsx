'use client';

import { useEffect, useState } from 'react';

interface LiveKitStatus {
  status: 'ok' | 'error' | 'loading' | 'none';
  livekit_url?: string;
  error?: string;
  timestamp?: string;
}

export function LiveKitDebugPanel() {
  const [livekitStatus, setLivekitStatus] = useState<LiveKitStatus>({ status: 'loading' });
  const [tokenStatus, setTokenStatus] = useState<{ status: string; error?: string }>({ status: 'loading' });
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    const checkLiveKit = async () => {
      try {
        const response = await fetch('/api/livekit-health');
        const data = await response.json();
        setLivekitStatus(data);
      } catch (error) {
        setLivekitStatus({
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to check LiveKit health',
        });
      }
    };

    const checkToken = async () => {
      try {
        const response = await fetch('/api/livekit-token');
        const data = await response.json();
        if (response.ok) {
          setTokenStatus({ status: 'ok' });
        } else {
          setTokenStatus({ status: 'error', error: data.error });
        }
      } catch (error) {
        setTokenStatus({
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to check token',
        });
      }
    };

    checkLiveKit();
    checkToken();
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-mono"
      >
        🔧 LiveKit Debug
      </button>

      {showPanel && (
        <div className="absolute bottom-12 right-0 w-80 bg-gray-900 text-white border border-gray-700 rounded p-4 text-xs font-mono shadow-lg">
          <h3 className="font-bold mb-3 text-sm">🔍 LiveKit Diagnostics</h3>

          {/* LiveKit Server Health */}
          <div className="mb-3 pb-3 border-b border-gray-700">
            <div className="flex items-center gap-2 mb-1">
              <div
                className={`w-2 h-2 rounded-full ${
                  livekitStatus.status === 'ok' ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              <span className="font-semibold">LiveKit Server</span>
            </div>
            <div className="text-gray-400">
              {livekitStatus.status === 'loading' && 'Checking...'}
              {livekitStatus.status === 'ok' && `✅ Connected to ${livekitStatus.livekit_url}`}
              {livekitStatus.status === 'error' && `❌ ${livekitStatus.error}`}
            </div>
          </div>

          {/* Token Generation */}
          <div className="mb-3 pb-3 border-b border-gray-700">
            <div className="flex items-center gap-2 mb-1">
              <div
                className={`w-2 h-2 rounded-full ${
                  tokenStatus.status === 'ok' ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              <span className="font-semibold">Token API</span>
            </div>
            <div className="text-gray-400">
              {tokenStatus.status === 'loading' && 'Checking...'}
              {tokenStatus.status === 'ok' && '✅ Token API working'}
              {tokenStatus.status === 'error' && `❌ ${tokenStatus.error}`}
            </div>
          </div>

          {/* Environment Check */}
          <div>
            <div className="font-semibold mb-1">📋 Environment</div>
            <div className="text-gray-400 space-y-1">
              <div>
                URL: {process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880'}
              </div>
              <button
                onClick={() => {
                  window.location.reload();
                }}
                className="bg-blue-700 hover:bg-blue-800 px-2 py-1 mt-2 rounded text-xs w-full"
              >
                🔄 Retry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
