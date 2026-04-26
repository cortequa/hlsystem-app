import { useEffect, useRef, useState } from 'react';

interface RTSPStreamProps {
  rtspUrl: string;
  streamId: string;
  className?: string;
}

declare const JSMpeg: any;

export default function RTSPStream({ rtspUrl, streamId, className = '' }: RTSPStreamProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);

  useEffect(() => {
    const initStream = async () => {
      try {
        setIsConnecting(true);
        setError(null);

        if (!window.electronAPI?.startRTSPStream) {
          setError('Electron API not available');
          return;
        }

        // Start the RTSP stream on the backend
        const response = await window.electronAPI.startRTSPStream(rtspUrl, streamId);
        
        if (!response.success) {
          setError(response.error || 'Failed to start RTSP stream');
          return;
        }

        const port = response.port;
        if (!port) {
          setError('No port returned from stream');
          return;
        }

        // Initialize JSMpeg player with the local WebSocket stream
        if (canvasRef.current && typeof JSMpeg !== 'undefined') {
          playerRef.current = new JSMpeg.Player(`ws://127.0.0.1:${port}`, {
            canvas: canvasRef.current,
            autoplay: true,
            poster: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
          });

          playerRef.current.addEventListener('play', () => {
            setIsConnecting(false);
          });

          playerRef.current.addEventListener('error', (error: any) => {
            setError(`Stream error: ${error}`);
          });
        } else {
          setError('JSMpeg not available');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(`Failed to start stream: ${errorMessage}`);
      }
    };

    initStream();

    return () => {
      // Cleanup
      if (playerRef.current) {
        playerRef.current.destroy?.();
      }
      if (window.electronAPI?.stopRTSPStream) {
        window.electronAPI.stopRTSPStream(streamId);
      }
    };
  }, [rtspUrl, streamId]);

  return (
    <div className={`relative w-full h-full bg-black ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: error ? 'none' : 'block' }}
      />
      
      {isConnecting && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
            <p className="text-sm">Připojování ke streamu...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
          <div className="text-white text-center px-4">
            <div className="text-red-400 mb-2">
              <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4v2m0 4v2M8 5h8a2 2 0 012 2v12a2 2 0 01-2 2H8a2 2 0 01-2-2V7a2 2 0 012-2z" />
              </svg>
            </div>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
