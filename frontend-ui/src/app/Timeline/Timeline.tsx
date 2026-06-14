import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import styles from './Timeline.module.css';

// ============================================================================
// Types
// ============================================================================

interface PlacedClip {
  id: string;
  filePath: string;
  fileName: string;
  startFrame: number;
  trackNumber: number;
}

interface Toast {
  id: string;
  type: 'success' | 'error';
  message: string;
}

// ============================================================================
// Component
// ============================================================================

export default function Timeline() {
  const [clips, setClips] = useState<PlacedClip[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activeDragTrack, setActiveDragTrack] = useState<number | null>(null);

  // useEffect to listen to AI Studio generated asset insertions
  useEffect(() => {
    const handleInsertTimelineClip = async (e: Event) => {
      const customEvent = e as CustomEvent<{ filePath: string }>;
      if (!customEvent.detail || !customEvent.detail.filePath) return;

      const { filePath } = customEvent.detail;
      const trackNumber = 2; // highest track layer
      const startFrame = 0; // frame 0

      try {
        console.log(`Auto-inserting generated clip onto timeline: File=${filePath}, Track=${trackNumber}, Frame=${startFrame}`);

        const response = await invoke<string>('import_to_timeline', {
          filePath,
          startTime: startFrame,
          trackNumber
        });

        console.log('C++ Engine auto-insert response:', response);

        const newClip: PlacedClip = {
          id: Math.random().toString(36).substring(7),
          filePath,
          fileName: getFileName(filePath),
          startFrame,
          trackNumber
        };

        setClips((prev) => [...prev, newClip]);
        addToast('success', `AI Studio: ${getFileName(filePath)} successfully auto-inserted onto Track ${trackNumber}!`);
      } catch (error: any) {
        console.error('Auto-insertion failed:', error);
        addToast('error', `AI Studio: Auto-Insertion Rejected: ${error}`);
      }
    };

    window.addEventListener('insert-timeline-clip', handleInsertTimelineClip);
    return () => {
      window.removeEventListener('insert-timeline-clip', handleInsertTimelineClip);
    };
  }, []);

  // Helper to extract file name
  const getFileName = (path: string) => {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || 'video.mp4';
  };

  // Toast helper
  const addToast = (type: 'success' | 'error', message: string) => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  // Drag over handler
  const handleDragOver = (e: React.DragEvent, trackNumber: number) => {
    e.preventDefault();
    setActiveDragTrack(trackNumber);
  };

  const handleDragLeave = () => {
    setActiveDragTrack(null);
  };

  // Drop handler
  const handleDrop = async (e: React.DragEvent, trackNumber: number) => {
    e.preventDefault();
    setActiveDragTrack(null);

    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;

      const { full: filePath } = JSON.parse(dataStr);
      if (!filePath) return;

      // Compute drop position relative to track body
      const rect = e.currentTarget.getBoundingClientRect();
      const dropX = e.clientX - rect.left;
      
      // Calculate start frame (1 pixel = 1 frame)
      const startFrame = Math.max(0, Math.round(dropX));

      console.log(`Attempting to import: File=${filePath}, Track=${trackNumber}, Frame=${startFrame}`);

      // Call Tauri command which triggers the C++ VideoTimelineManager sidecar
      const response = await invoke<string>('import_to_timeline', {
        filePath,
        startTime: startFrame,
        trackNumber
      });

      console.log('C++ Engine response:', response);

      // Successfully imported! Add to timeline state
      const newClip: PlacedClip = {
        id: Math.random().toString(36).substring(7),
        filePath,
        fileName: getFileName(filePath),
        startFrame,
        trackNumber
      };

      setClips((prev) => [...prev, newClip]);
      addToast('success', `C++ Engine: ${getFileName(filePath)} successfully imported onto Track ${trackNumber}!`);
    } catch (error: any) {
      // Failed! Show C++ error message in a toast
      console.error('Import failed:', error);
      addToast('error', `C++ Engine Rejected Import: ${error}`);
    }
  };

  // Generate ruler ticks (every 5 seconds, up to 120 seconds)
  const ticks = [];
  for (let s = 0; s <= 120; s += 5) {
    ticks.push(s);
  }

  const tracks = [0, 1, 2];

  return (
    <div className={styles.timelinePanel}>
      {/* Toast Notification Layer */}
      <div className={styles.toastContainer}>
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`${styles.toast} ${
              toast.type === 'success' ? styles.toastSuccess : styles.toastError
            }`}
          >
            {toast.type === 'success' ? '✓' : '⚠'} {toast.message}
          </div>
        ))}
      </div>

      {/* Timeline Time Ruler */}
      <div className={styles.ruler}>
        <div style={{ width: '100px', flexShrink: 0 }} /> {/* Header offset spacer */}
        <div style={{ position: 'relative', flex: 1 }}>
          {ticks.map((tick) => (
            <div
              key={tick}
              className={styles.rulerTick}
              style={{ left: `${tick * 30}px` }}
            >
              {tick}s
            </div>
          ))}
        </div>
      </div>

      {/* Tracks */}
      <div className={styles.tracksContainer}>
        {tracks.map((trackNumber) => (
          <div key={trackNumber} className={styles.track}>
            <div className={styles.trackHeader}>Track {trackNumber}</div>
            
            <div
              className={`${styles.trackBody} ${
                activeDragTrack === trackNumber ? styles.dragOver : ''
              }`}
              onDragOver={(e) => handleDragOver(e, trackNumber)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, trackNumber)}
            >
              {clips
                .filter((c) => c.trackNumber === trackNumber)
                .map((clip) => (
                  <div
                    key={clip.id}
                    className={styles.clipBlock}
                    style={{
                      left: `${clip.startFrame}px`,
                      width: '150px' // 150 frames = 5 seconds at 30fps
                    }}
                    title={`${clip.filePath} (Frame: ${clip.startFrame})`}
                  >
                    {clip.fileName}
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
