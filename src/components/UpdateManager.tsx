import { useEffect, useState } from 'react';

interface UpdateState {
  available: boolean;
  downloaded: boolean;
  progress: number;
  error: string | null;
}

export default function UpdateManager() {
  const [updateState, setUpdateState] = useState<UpdateState>({
    available: false,
    downloaded: false,
    progress: 0,
    error: null,
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) {
      return;
    }

    // Check for updates on mount
    window.electronAPI.checkForUpdates();

    // Listen for update available
    if (window.electronAPI.onUpdateAvailable) {
      window.electronAPI.onUpdateAvailable(() => {
        setUpdateState(prev => ({ ...prev, available: true }));
      });
    }

    // Listen for update downloaded
    if (window.electronAPI.onUpdateDownloaded) {
      window.electronAPI.onUpdateDownloaded(() => {
        setUpdateState(prev => ({ ...prev, downloaded: true }));
      });
    }

    // Listen for download progress
    if (window.electronAPI.onDownloadProgress) {
      window.electronAPI.onDownloadProgress((progress: any) => {
        setUpdateState(prev => ({
          ...prev,
          progress: progress.percent || 0,
        }));
      });
    }

    return () => {
      window.electronAPI?.removeAllListeners('checking-for-update');
      window.electronAPI?.removeAllListeners('update-available');
      window.electronAPI?.removeAllListeners('update-downloaded');
      window.electronAPI?.removeAllListeners('download-progress');
    };
  }, []);

  const handleInstallUpdate = () => {
    if (window.electronAPI?.restartApp) {
      window.electronAPI.restartApp();
    }
  };

  // Don't render anything if no updates
  if (!updateState.available && !updateState.downloaded) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-blue-600 text-white rounded-lg shadow-lg p-4 max-w-sm">
      {updateState.downloaded ? (
        <div>
          <h3 className="font-bold mb-2">Update Ready</h3>
          <p className="text-sm mb-4">A new version is ready to install.</p>
          <button
            onClick={handleInstallUpdate}
            className="bg-white text-blue-600 px-4 py-2 rounded font-medium hover:bg-gray-100"
          >
            Restart and Install
          </button>
        </div>
      ) : updateState.available ? (
        <div>
          <h3 className="font-bold mb-2">Downloading Update</h3>
          <div className="w-full bg-blue-700 rounded-full h-2 mb-2 overflow-hidden">
            <div
              className="bg-white h-full transition-all"
              style={{ width: `${updateState.progress}%` }}
            />
          </div>
          <p className="text-sm">{Math.round(updateState.progress)}%</p>
        </div>
      ) : null}
      {updateState.error && (
        <p className="text-sm text-red-200 mt-2">{updateState.error}</p>
      )}
    </div>
  );
}
