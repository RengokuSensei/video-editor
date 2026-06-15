import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '../../tauri-shim';
import styles from './Timeline.module.css';

// ============================================================================
// Types
// ============================================================================

interface PlacedClip {
  id: string;
  filePath: string;
  fileName: string;
  startFrame: number;
  durationFrames: number;
  trackNumber: number;
  isAiGenerated?: boolean;
}

interface Toast {
  id: string;
  type: 'success' | 'error';
  message: string;
}

// ============================================================================
// Component
// ============================================================================

import type { VideoAsset } from '../video-catalog';

interface TimelineProps {
  engine?: any;
  onSelectClip?: (filePath: string) => void;
  selectedVideo?: VideoAsset | null;
}

export default function Timeline({ engine, onSelectClip, selectedVideo }: TimelineProps) {
  const [clips, setClips] = useState<PlacedClip[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activeDragTrack, setActiveDragTrack] = useState<number | null>(null);
  const [tracks, setTracks] = useState<number[]>([0, 1]);
  
  // Interactive playback & playhead states
  const [currentTime, setCurrentTime] = useState(0); // in frames (30fps)
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Synchronize play/pause state with CreativeEngine
  useEffect(() => {
    if (!engine) return;
    try {
      if (isPlaying) {
        console.log("Timeline: Triggering engine.editor.play() / engine.scene.setPlaying(true)");
        if (typeof engine.editor?.play === 'function') {
          engine.editor.play();
        } else {
          engine.scene?.setPlaying(true);
        }
      } else {
        console.log("Timeline: Triggering engine.editor.pause() / engine.scene.setPlaying(false)");
        if (typeof engine.editor?.pause === 'function') {
          engine.editor.pause();
        } else {
          engine.scene?.setPlaying(false);
        }
      }
    } catch (err) {
      console.error("Timeline: Error synchronizing engine playback state:", err);
    }
  }, [isPlaying, engine]);

  // Synchronize playhead scrubber time with CreativeEngine
  useEffect(() => {
    if (!engine) return;
    const timeInSeconds = currentTime / 30; // 30 FPS mapping
    try {
      if (typeof engine.editor?.setPlaybackTime === 'function') {
        engine.editor.setPlaybackTime(timeInSeconds);
      } else if (engine.block) {
        const pages = engine.block.findByType('ly.img.page');
        for (const page of pages) {
          if (engine.block.supportsPlaybackTime(page)) {
            engine.block.setPlaybackTime(page, timeInSeconds);
          }
        }
      }
    } catch (err) {
      console.error("Timeline: Error setting engine playback time:", err);
    }
  }, [currentTime, engine]);

  // listen to AI Studio generated asset insertions
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
          durationFrames: 150, // default 5 seconds
          trackNumber,
          isAiGenerated: true
        };

        setClips((prev) => [...prev, newClip]);
        addToast('success', `AI Studio: ${getFileName(filePath)} auto-inserted onto Track ${trackNumber}!`);
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

  // listen to Transcript scissor splits
  useEffect(() => {
    const handleSplitEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ frame: number }>;
      if (!customEvent.detail || customEvent.detail.frame === undefined) return;
      const { frame } = customEvent.detail;

      setClips((prev) => {
        const clipToSplitIndex = prev.findLastIndex(
          (c) => frame > c.startFrame && frame < c.startFrame + c.durationFrames
        );

        if (clipToSplitIndex === -1) {
          console.warn("Timeline Event Split: No clip under the playhead to split at frame:", frame);
          return prev;
        }

        const clip = prev[clipToSplitIndex];
        const splitOffset = frame - clip.startFrame;

        const leftClip: PlacedClip = {
          ...clip,
          id: Math.random().toString(36).substring(7),
          durationFrames: splitOffset,
          fileName: `${clip.fileName.replace(/ \(Part \d+\)/, '')} (Part 1)`
        };

        const rightClip: PlacedClip = {
          ...clip,
          id: Math.random().toString(36).substring(7),
          startFrame: frame,
          durationFrames: clip.durationFrames - splitOffset,
          fileName: `${clip.fileName.replace(/ \(Part \d+\)/, '')} (Part 2)`
        };

        const copy = [...prev];
        copy.splice(clipToSplitIndex, 1, leftClip, rightClip);
        
        setTimeout(() => {
          addToast('success', `Timeline: Split clip "${clip.fileName}" at frame ${frame} based on transcript.`);
        }, 0);

        return copy;
      });
    };

    window.addEventListener('split-timeline-clip', handleSplitEvent);
    return () => {
      window.removeEventListener('split-timeline-clip', handleSplitEvent);
    };
  }, []);

  // Time ticker effect for playing the timeline
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        if (prev >= 3600) return 0; // wrap at 120s (3600 frames)
        return prev + 1;
      });
    }, 1000 / 30); // 30 fps
    return () => clearInterval(interval);
  }, [isPlaying]);

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

  // Time formatter
  const formatTime = (frames: number) => {
    const totalSeconds = Math.floor(frames / 30);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const remainingFrames = frames % 30;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(remainingFrames).padStart(2, '0')}`;
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent, trackNumber: number) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    setActiveDragTrack(trackNumber);
  };

  const handleDragLeave = () => {
    setActiveDragTrack(null);
  };

  const handleDrop = async (e: React.DragEvent, trackNumber: number) => {
    e.preventDefault();
    setActiveDragTrack(null);
    console.log("Timeline handleDrop: Drop triggered on Track:", trackNumber);

    try {
      const dataStr = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
      console.log("Timeline handleDrop: dataTransfer JSON payload:", dataStr);
      if (!dataStr) return;

      const { full: filePath } = JSON.parse(dataStr);
      if (!filePath) return;

      // Compute drop position relative to track body
      const rect = e.currentTarget.getBoundingClientRect();
      const dropX = e.clientX - rect.left;
      
      // Calculate start frame (0.2px = 1 frame, so 1px = 5 frames)
      const durationFrames = 150;
      const dropFrame = Math.round(dropX / 0.2);
      const startFrame = Math.max(0, Math.min(3600 - durationFrames, dropFrame));

      console.log(`Attempting to import (Optimistic UI): File=${filePath}, Track=${trackNumber}, Frame=${startFrame}`);

      // Optimistically add clip block to timeline
      const newClip: PlacedClip = {
        id: Math.random().toString(36).substring(7),
        filePath,
        fileName: getFileName(filePath),
        startFrame,
        durationFrames,
        trackNumber,
        isAiGenerated: false
      };

      setClips((prev) => [...prev, newClip]);

      // Invoke C++ sidecar in background
      invoke<string>('import_to_timeline', {
        filePath,
        startTime: startFrame,
        trackNumber
      }).then((response) => {
        console.log('C++ Engine response:', response);
        addToast('success', `C++ Engine: ${getFileName(filePath)} imported onto Track ${trackNumber}!`);
      }).catch((error) => {
        console.error('Import failed:', error);
        addToast('error', `C++ Engine Rejected Import: ${error}`);
        // Rollback clip block from state if engine rejected
        setClips((prev) => prev.filter((c) => c.id !== newClip.id));
      });

    } catch (error: any) {
      console.error('Import processing failed:', error);
      addToast('error', `Import processing failed: ${error}`);
    }
  };

  // Split clip at current playhead
  const handleSplitClip = () => {
    const clipToSplitIndex = clips.findIndex(
      (c) => currentTime > c.startFrame && currentTime < c.startFrame + c.durationFrames
    );

    if (clipToSplitIndex === -1) {
      addToast('error', 'Timeline: No clip under the playhead to split.');
      return;
    }

    const clip = clips[clipToSplitIndex];
    const splitOffset = currentTime - clip.startFrame;

    const leftClip: PlacedClip = {
      ...clip,
      id: Math.random().toString(36).substring(7),
      durationFrames: splitOffset,
      fileName: `${clip.fileName.replace(/ \(Part \d+\)/, '')} (Part 1)`
    };

    const rightClip: PlacedClip = {
      ...clip,
      id: Math.random().toString(36).substring(7),
      startFrame: currentTime,
      durationFrames: clip.durationFrames - splitOffset,
      fileName: `${clip.fileName.replace(/ \(Part \d+\)/, '')} (Part 2)`
    };

    setClips((prev) => {
      const copy = [...prev];
      copy.splice(clipToSplitIndex, 1, leftClip, rightClip);
      return copy;
    });

    addToast('success', `Timeline: Split clip "${clip.fileName}" at frame ${currentTime}.`);
  };

  // Add clip at current playhead position
  const handleAddClipAtPlayhead = () => {
    if (!selectedVideo || !selectedVideo.full) {
      addToast('error', 'Timeline: Select a media bin item to place at the playhead.');
      return;
    }

    const filePath = selectedVideo.full;
    const trackNumber = tracks.length > 0 ? tracks[0] : 0; // Default to the first available track
    const durationFrames = 150; // Default duration of 5 seconds (at 30fps)
    const startFrame = Math.max(0, Math.min(3600 - durationFrames, currentTime)); // Clamp to timeline length

    console.log(`Attempting to import at playhead (Optimistic UI): File=${filePath}, Track=${trackNumber}, Frame=${startFrame}`);

    // Optimistically add clip block to timeline
    const newClip: PlacedClip = {
      id: Math.random().toString(36).substring(7),
      filePath,
      fileName: getFileName(filePath),
      startFrame,
      durationFrames,
      trackNumber,
      isAiGenerated: false
    };

    setClips((prev) => [...prev, newClip]);

    // Invoke C++ sidecar in background
    invoke<string>('import_to_timeline', {
      filePath,
      startTime: startFrame,
      trackNumber
    }).then((response) => {
      console.log('C++ Engine response:', response);
      addToast('success', `C++ Engine: ${getFileName(filePath)} inserted at playhead on Track ${trackNumber}!`);
    }).catch((error) => {
      console.error('Import failed:', error);
      addToast('error', `C++ Engine Rejected Import: ${error}`);
      // Rollback clip block from state if engine rejected
      setClips((prev) => prev.filter((c) => c.id !== newClip.id));
    });
  };

  // Add a new timeline track dynamically
  const handleAddTrack = () => {
    setTracks((prev) => {
      const nextIndex = prev.length;
      setTimeout(() => {
        addToast('success', `Timeline: Added Track ${nextIndex}!`);
      }, 0);
      return [...prev, nextIndex];
    });
  };

  // Playhead update logic
  const updatePlayheadPosition = (e: React.MouseEvent | MouseEvent) => {
    if (!scrollContainerRef.current) return;
    const rect = scrollContainerRef.current.getBoundingClientRect();
    const scrollLeft = scrollContainerRef.current.scrollLeft;
    // Header offset is 100px
    const clientXInContainer = e.clientX - rect.left + scrollLeft - 100;
    const frame = Math.max(0, Math.round(clientXInContainer / 0.2));
    setCurrentTime(Math.min(3600, frame)); // cap at 120s (3600 frames)
  };

  const handleRulerMouseDown = (e: React.MouseEvent) => {
    setIsDraggingPlayhead(true);
    updatePlayheadPosition(e);
  };

  useEffect(() => {
    if (!isDraggingPlayhead) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (e.buttons === 0) {
        setIsDraggingPlayhead(false);
        return;
      }
      updatePlayheadPosition(e);
    };

    const handleMouseUp = () => {
      setIsDraggingPlayhead(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPlayhead]);

  // ruler ticks helper
  const ticks = [];

  for (let s = 0; s <= 120; s += 5) {
    ticks.push(s);
  }
  const bars = Array.from({ length: 80 }, (_, i) => {
    return 10 + Math.sin(i * 0.4) * 8 + Math.cos(i * 0.1) * 4 + (i % 3 === 0 ? 6 : 0);
  });

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
            <span className={styles.toastIcon}>
              {toast.type === 'success' ? '✓' : '⚠'}
            </span>
            <span className={styles.toastMsg}>{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Timeline Control Toolbar */}
      <div className={styles.controlToolbar}>
        <div className={styles.controlLeft}>
          <span className={styles.panelTitle}>Timeline Tracks</span>
          <div className={styles.timeCounter}>
            <span className={styles.timeCurrent}>{formatTime(currentTime)}</span>
            <span className={styles.timeDivider}>/</span>
            <span className={styles.timeTotal}>{formatTime(3600)}</span>
          </div>
        </div>

        <div className={styles.controlCenter}>
          <button 
            className={styles.playbackBtn} 
            onClick={() => setCurrentTime(0)}
            title="Rewind to start"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="19 20 9 12 19 4 19 20" fill="currentColor"/>
              <line x1="5" y1="4" x2="5" y2="20"/>
            </svg>
          </button>
          
          <button 
            className={`${styles.playbackBtn} ${styles.playBtn} ${isPlaying ? styles.playActive : ''}`} 
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? "Pause playback" : "Play timeline"}
          >
            {isPlaying ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="6" y="4" width="4" height="16" fill="currentColor"/>
                <rect x="14" y="4" width="4" height="16" fill="currentColor"/>
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>
              </svg>
            )}
          </button>

          <button 
            className={styles.playbackBtn} 
            onClick={() => setCurrentTime(3600)}
            title="Fast forward to end"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 4 15 12 5 20 5 4" fill="currentColor"/>
              <line x1="19" y1="4" x2="19" y2="20"/>
            </svg>
          </button>

          <div className={styles.vDivider} />

          <button 
            className={`${styles.playbackBtn} ${muted ? styles.mutedActive : ''}`}
            onClick={() => setMuted(!muted)}
            title={muted ? "Unmute audio" : "Mute audio"}
          >
            {muted ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M11 5L6 9H2v6h4l5 4V5z"/>
                <line x1="23" y1="9" x2="17" y2="15"/>
                <line x1="17" y1="9" x2="23" y2="15"/>
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M11 5L6 9H2v6h4l5 4V5z"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
            )}
          </button>
        </div>

        <div className={styles.controlRight}>
          <button 
            className={styles.actionBtn} 
            onClick={handleAddTrack}
            title="Add timeline track (+)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Track
          </button>

          <button 
            className={styles.actionBtn} 
            onClick={handleSplitClip}
            title="Split clip at playhead (✂)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="6" r="3"/>
              <circle cx="6" cy="18" r="3"/>
              <line x1="9.8" y1="8.2" x2="21" y2="12"/>
              <line x1="9.8" y1="15.8" x2="21" y2="12"/>
            </svg>
            Split
          </button>
          
          <button 
            className={styles.actionBtn} 
            onClick={handleAddClipAtPlayhead}
            title="Add media block at playhead (+)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Block
          </button>
        </div>
      </div>

      {/* Scrollable Timeline Grid Container */}
      <div 
        className={styles.scrollContainer} 
        ref={scrollContainerRef}
      >
        <div className={styles.timelineGridMinWidth}>
          
          {/* Timeline Time Ruler */}
          <div className={styles.ruler}>
            <div className={styles.rulerHeaderOffset}>Time (Frames)</div>
            <div 
              className={styles.rulerTicks}
              onMouseDown={handleRulerMouseDown}
            >
              {ticks.map((tick) => (
                <div
                  key={tick}
                  className={styles.rulerTick}
                  style={{ left: `${tick * 6}px` }} // 1 frame = 0.2px, 5s (150 frames) = 30px
                >
                  <span className={styles.tickText}>{tick}s</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tracks Body */}
          <div className={styles.tracksContainer}>
            {/* Draggable Vertical Playhead Line overlay */}
            <div 
              className={`${styles.playhead} ${isDraggingPlayhead ? styles.playheadDragging : ''}`}
              style={{ left: `${currentTime * 0.2 + 100}px` }} // matches ruler scaling + offset
            >
              <div 
                className={styles.playheadHandle}
                onMouseDown={handleRulerMouseDown}
              >
                <div className={styles.playheadHandleTip} />
              </div>
              <div className={styles.playheadLine} />
            </div>

            {/* Video Tracks */}
            {tracks.map((trackNumber) => (
              <div key={trackNumber} className={styles.track}>
                <div className={styles.trackHeader}>
                  <span className={styles.trackDot} />
                  Track {trackNumber}
                </div>
                
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
                        className={`${styles.clipBlock} ${clip.isAiGenerated ? styles.clipBlockAi : ''}`}
                        style={{
                          left: `${clip.startFrame * 0.2}px`, // 0.2px per frame scaling
                          width: `${clip.durationFrames * 0.2}px` // 0.2px per frame scaling
                        }}
                        title={`${clip.filePath} (Frame: ${clip.startFrame} - ${clip.startFrame + clip.durationFrames})`}
                        onClick={() => onSelectClip?.(clip.filePath)}
                      >
                        <span className={styles.clipThumb}>
                          {clip.isAiGenerated ? '✨' : '🎬'}
                        </span>
                        <span className={styles.clipLabel}>{clip.fileName}</span>
                      </div>
                    ))}
                </div>
              </div>
            ))}

            {/* Simulated Audio Waveform Track */}
            <div className={`${styles.track} ${styles.audioTrack}`}>
              <div className={styles.trackHeader}>
                <span className={`${styles.trackDot} ${styles.audioDot}`} />
                Audio Master
              </div>
              <div className={styles.trackBody}>
                <div 
                  className={styles.audioWaveform}
                  style={{ opacity: muted ? 0.25 : 0.65 }}
                >
                  {bars.map((h, i) => (
                    <div 
                      key={i} 
                      className={styles.waveformBar} 
                      style={{ height: `${h}px` }}
                    />
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

