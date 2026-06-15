import { useState, useEffect } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import MainPlayer from '../MainPlayer/MainPlayer';
import styles from './TranscriptView.module.css';

interface TranscriptViewProps {
  selectedVideo: { full: string; alt: string } | null;
  engine: any;
}

interface TranscriptSegment {
  id: string;
  startFrame: number;
  endFrame: number;
  text: string;
}

export default function TranscriptView({ selectedVideo, engine }: TranscriptViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [subtitleColor, setSubtitleColor] = useState('#ffffff');
  const [subtitleFontSize, setSubtitleFontSize] = useState(14);
  const [toasts, setToasts] = useState<{ id: string; message: string }[]>([]);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const segments: TranscriptSegment[] = [
    { id: '1', startFrame: 0, endFrame: 45, text: "In this short video tutorial sequence," },
    { id: '2', startFrame: 45, endFrame: 90, text: "we are demonstrating native ARM64 NPU integration" },
    { id: '3', startFrame: 90, endFrame: 150, text: "by applying neural vignettes and composite multi-track timelines." }
  ];

  const isLocalPath = (path: string) => {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return false;
    }
    return path.includes(':\\') || path.includes(':/') || path.startsWith('\\\\');
  };

  const activeUrl = selectedVideo 
    ? (isLocalPath(selectedVideo.full) ? convertFileSrc(selectedVideo.full) : selectedVideo.full) 
    : null;

  const handlePlayPause = () => {
    if (!engine) return;
    try {
      if (isPlaying) {
        if (typeof engine.editor?.pause === 'function') engine.editor.pause();
        setIsPlaying(false);
      } else {
        if (typeof engine.editor?.play === 'function') engine.editor.play();
        setIsPlaying(true);
      }
    } catch (err) {
      console.warn("Engine play/pause failed:", err);
      setIsPlaying(!isPlaying);
    }
  };

  // Time ticker simulator
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentTime(prev => {
        if (prev >= 150) return 0;
        return prev + 1;
      });
    }, 1000 / 30);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const handleSegmentClick = (startFrame: number) => {
    setCurrentTime(startFrame);
    if (engine) {
      try {
        const timeInSeconds = startFrame / 30;
        if (typeof engine.editor?.setPlaybackTime === 'function') {
          engine.editor.setPlaybackTime(timeInSeconds);
        }
      } catch (e) {
        console.warn("Failed to set engine playhead:", e);
      }
    }
    console.log(`Scrubbed playhead to frame ${startFrame} (${(startFrame / 30).toFixed(2)}s)`);
  };

  const handleSplitSegment = async (id: string, startFrame: number) => {
    try {
      // Call Tauri split command on track 1, clip 0
      await invoke('split_clip', { trackIndex: 1, clipIndex: 0, splitFrame: startFrame });
      
      // Emit window event to let Timeline.tsx split the clip locally
      const event = new CustomEvent('split-timeline-clip', {
        detail: { frame: startFrame }
      });
      window.dispatchEvent(event);
      
      addToast(`Split timeline clip at frame ${startFrame} based on transcript.`);
      console.log(`Transcript action: split timeline at segment ${id} (frame ${startFrame})`);
    } catch (e) {
      console.warn("Failed to split timeline segment via backend:", e);
      addToast(`Split failed: ${e}`);
    }
  };

  const addToast = (message: string) => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Filter segments
  const filteredSegments = segments.filter(seg => 
    seg.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get active subtitle text
  const activeSegment = segments.find(seg => 
    currentTime >= seg.startFrame && currentTime < seg.endFrame
  );

  return (
    <div className={styles.container}>
      {/* Toast Notification Layer */}
      <div className={styles.toastContainer}>
        {toasts.map((toast) => (
          <div key={toast.id} className={styles.toast}>
            <span>✂</span> {toast.message}
          </div>
        ))}
      </div>

      {/* Left: Video Preview */}
      <div className={styles.previewPanel}>
        <div className={styles.playerWrapper}>
          {selectedVideo ? (
            <MainPlayer activeUrl={activeUrl} onEngineInit={() => {}} />
          ) : (
            <div className={styles.emptyPlayer}>
              <span>Select a video from the Editor's library to view transcripts</span>
            </div>
          )}

          {/* Subtitle simulation overlay */}
          {subtitlesEnabled && activeSegment && (
            <div 
              className={styles.subtitleOverlay}
              style={{ 
                color: subtitleColor,
                fontSize: `${subtitleFontSize}px`,
                textShadow: `0 2px 4px #000000, 0 0 1px #000000`
              }}
            >
              {activeSegment.text}
            </div>
          )}
        </div>
        
        {/* Simple Player Controls */}
        <div className={styles.playerControls}>
          <button className={styles.controlBtn} onClick={handlePlayPause} disabled={!selectedVideo}>
            {isPlaying ? (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <polygon points="6 4 20 12 6 20 6 4" />
              </svg>
            )}
          </button>
          <div className={styles.scrubberWrapper}>
            <span className={styles.timeLabel}>{(currentTime / 30).toFixed(2)}s</span>
            <input 
              type="range" 
              min="0" 
              max="150" 
              value={currentTime} 
              onChange={(e) => setCurrentTime(parseInt(e.target.value))}
              className={styles.scrubber} 
              disabled={!selectedVideo}
            />
            <span className={styles.timeLabel}>5.00s</span>
          </div>
        </div>
      </div>

      {/* Right: Transcript Inspector */}
      <div className={styles.inspectorPanel}>
        <div className={styles.inspectorHeader}>
          <h3>AI Transcript & Subtitles</h3>
        </div>

        <div className={styles.inspectorContent}>
          {/* Subtitle Configuration */}
          <div className={styles.subConfigSection}>
            <h4 className={styles.sectionTitle}>Auto-Subtitles settings</h4>
            <div className={styles.subConfigCard}>
              <label className={styles.toggleLabel}>
                <input 
                  type="checkbox" 
                  checked={subtitlesEnabled} 
                  onChange={e => setSubtitlesEnabled(e.target.checked)} 
                  className={styles.toggleCheckbox}
                />
                <span>Enable Overlay Subtitles</span>
              </label>
              
              {subtitlesEnabled && (
                <div className={styles.subtitleStyling}>
                  <div className={styles.styleRow}>
                    <span>Font Size</span>
                    <input 
                      type="range" 
                      min="10" 
                      max="24" 
                      value={subtitleFontSize} 
                      onChange={e => setSubtitleFontSize(parseInt(e.target.value))}
                      className={styles.sizeRange}
                    />
                    <span className={styles.styleVal}>{subtitleFontSize}px</span>
                  </div>
                  
                  <div className={styles.styleRow}>
                    <span>Text Color</span>
                    <div className={styles.colorPalette}>
                      {['#ffffff', '#facc15', '#60a5fa', '#f87171'].map(color => (
                        <div 
                          key={color} 
                          className={`${styles.colorOption} ${subtitleColor === color ? styles.activeColor : ''}`}
                          style={{ backgroundColor: color }}
                          onClick={() => setSubtitleColor(color)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Transcript Panel */}
          <div className={styles.transcriptSection}>
            <h4 className={styles.sectionTitle}>Speech-to-Text Transcript</h4>
            <div className={styles.searchWrapper}>
              <input 
                type="text" 
                className={styles.searchInput}
                placeholder="Search transcription script..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            <div className={styles.segmentsList}>
              {filteredSegments.length > 0 ? (
                filteredSegments.map((seg) => {
                  const isActive = currentTime >= seg.startFrame && currentTime < seg.endFrame;
                  return (
                    <div 
                      key={seg.id} 
                      className={`${styles.segmentCard} ${isActive ? styles.activeSegmentCard : ''}`}
                      onClick={() => handleSegmentClick(seg.startFrame)}
                    >
                      <div className={styles.segmentMeta}>
                        <span className={styles.timeBadge}>
                          {(seg.startFrame / 30).toFixed(2)}s - {(seg.endFrame / 30).toFixed(2)}s
                        </span>
                        
                        <button 
                          className={styles.splitBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSplitSegment(seg.id, seg.startFrame);
                          }}
                          title="Split clip at start of segment"
                        >
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="6" cy="6" r="3"/>
                            <circle cx="6" cy="18" r="3"/>
                            <line x1="9.8" y1="8.2" x2="21" y2="12"/>
                            <line x1="9.8" y1="15.8" x2="21" y2="12"/>
                          </svg>
                        </button>
                      </div>
                      <div className={styles.segmentText}>{seg.text}</div>
                    </div>
                  );
                })
              ) : (
                <div className={styles.emptySegments}>No segments match the query</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
