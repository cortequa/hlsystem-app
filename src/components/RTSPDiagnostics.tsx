import { useEffect, useState } from 'react';

interface RTSPDiagnosticsProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DiagnosticInfo {
  camera?: {
    entry?: {
      url: string;
      status: string;
      error?: string;
    };
    exit?: {
      url: string;
      status: string;
      error?: string;
    };
  };
  timestamp: string;
  [key: string]: any;
}

export default function RTSPDiagnostics({ isOpen, onClose }: RTSPDiagnosticsProps) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runDiagnostics = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!window.electronAPI?.rtspDiagnostics) {
        setError('RTSP diagnostics not available');
        return;
      }

      const response = await window.electronAPI.rtspDiagnostics();
      
      if (!response.success) {
        setError(response.error || 'Failed to run diagnostics');
        return;
      }

      setDiagnostics(response.diagnostics);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to run diagnostics: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && !diagnostics) {
      runDiagnostics();
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-96 overflow-auto">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold">RTSP Diagnostika Kamery</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
              <p>Načítání diagnostiky...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">
              <p className="font-bold mb-2">Chyba</p>
              <p>{error}</p>
              <button
                onClick={runDiagnostics}
                className="mt-3 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
              >
                Zkusit znovu
              </button>
            </div>
          ) : diagnostics ? (
            <div className="space-y-4">
              {diagnostics.camera?.entry && (
                <div className="border rounded p-4">
                  <h3 className="font-bold text-lg mb-2">Vstupní Kamera</h3>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-medium">URL:</span> {diagnostics.camera.entry.url}</p>
                    <p>
                      <span className="font-medium">Stav:</span>{' '}
                      <span className={diagnostics.camera.entry.status === 'ok' ? 'text-green-600' : 'text-red-600'}>
                        {diagnostics.camera.entry.status}
                      </span>
                    </p>
                    {diagnostics.camera.entry.error && (
                      <p className="text-red-600"><span className="font-medium">Chyba:</span> {diagnostics.camera.entry.error}</p>
                    )}
                  </div>
                </div>
              )}

              {diagnostics.camera?.exit && (
                <div className="border rounded p-4">
                  <h3 className="font-bold text-lg mb-2">Výstupní Kamera</h3>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-medium">URL:</span> {diagnostics.camera.exit.url}</p>
                    <p>
                      <span className="font-medium">Stav:</span>{' '}
                      <span className={diagnostics.camera.exit.status === 'ok' ? 'text-green-600' : 'text-red-600'}>
                        {diagnostics.camera.exit.status}
                      </span>
                    </p>
                    {diagnostics.camera.exit.error && (
                      <p className="text-red-600"><span className="font-medium">Chyba:</span> {diagnostics.camera.exit.error}</p>
                    )}
                  </div>
                </div>
              )}

              {diagnostics.timestamp && (
                <div className="text-xs text-gray-500 mt-4 pt-4 border-t">
                  Čas diagnostiky: {new Date(diagnostics.timestamp).toLocaleString('cs-CZ')}
                </div>
              )}
            </div>
          ) : (
            <div>
              <p className="text-gray-600 mb-4">Spusťte diagnostiku pro kontrolu kamer.</p>
              <button
                onClick={runDiagnostics}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
              >
                Spustit Diagnostiku
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-6 border-t bg-gray-50">
          {diagnostics && (
            <button
              onClick={runDiagnostics}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded"
            >
              Obnovit
            </button>
          )}
          <button
            onClick={onClose}
            className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded"
          >
            Zavřít
          </button>
        </div>
      </div>
    </div>
  );
}
