import { useCallback, useState } from 'react';
import type { Configuration, CreativeEngine } from '@cesdk/cesdk-js';
import { convertFileSrc } from '@tauri-apps/api/core';
import MainPlayer from './MainPlayer/MainPlayer';
import { VIDEO_CATALOG } from './video-catalog';
import type { VideoAsset } from './video-catalog';
import VideoSelector from './VideoSelector/VideoSelector';
import EffectsSelector from './EffectsSelector/EffectsSelector';
import WindowControls from './WindowControls/WindowControls';
import Timeline from './Timeline/Timeline';
import AIPromptPanel from './AIPromptPanel/AIPromptPanel';
import AIStudio from './AIStudio/AIStudio';
import ColorGradingView from './PostProduction/ColorGradingView';
import VfxView from './PostProduction/VfxView';
import AudioView from './PostProduction/AudioView';
import TranscriptView from './PostProduction/TranscriptView';
import styles from './App.module.css';

// ============================================================================
// Types
// ============================================================================

interface AppProps {
  config: Configuration;
}

// ============================================================================
// Premium SVGs for State Switcher
// ============================================================================

const FolderIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const SlidersIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="21" x2="4" y2="14" />
    <line x1="4" y1="10" x2="4" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12" y2="3" />
    <line x1="20" y1="21" x2="20" y2="16" />
    <line x1="20" y1="12" x2="20" y2="3" />
    <line x1="1.5" y1="14" x2="6.5" y2="14" />
    <line x1="9.5" y1="8" x2="14.5" y2="8" />
    <line x1="17.5" y1="16" x2="22.5" y2="16" />
  </svg>
);

const SparklesPanelIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 11.5 21.5 11 21 11H19.5C18.6716 11 18 10.3284 18 9.5V8.5C18 7.67157 17.3284 7 16.5 7H15.5C14.6716 7 14 6.32843 14 5.5V4C14 3.44772 13.5523 3 13 3C7.47715 3 3 7.47715 3 13C3 18.5228 7.47715 22 12 22Z" />
    <circle cx="7.5" cy="10.5" r="1.2" fill="currentColor" />
    <circle cx="11.5" cy="7.5" r="1.2" fill="currentColor" />
    <circle cx="16.5" cy="9.5" r="1.2" fill="currentColor" />
    <circle cx="15.5" cy="14.5" r="1.2" fill="currentColor" />
  </svg>
);

// ============================================================================
// App Component
// ============================================================================

export default function App({ config: _config }: AppProps) {
  const [videosList, setVideosList] = useState<VideoAsset[]>(VIDEO_CATALOG);
  const [selectedVideo, setSelectedVideo] = useState<VideoAsset | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  const [activeView, setActiveView] = useState<'edit' | 'color' | 'vfx' | 'audio' | 'transcript' | 'ai'>('edit');
  const [activePanel, setActivePanel] = useState<'media' | 'effects'>('media');

  const isLocalPath = (path: string) => {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return false;
    }
    return path.includes(':\\') || path.includes(':/') || path.startsWith('\\\\');
  };

  const getFileName = (path: string) => {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || 'video.mp4';
  };

  const handleSelectClip = useCallback((filePath: string) => {
    const asset = videosList.find(v => v.full === filePath) || {
      full: filePath,
      thumbUri: '',
      alt: getFileName(filePath),
      author: {
        name: 'Timeline Clip',
        url: ''
      }
    };
    setSelectedVideo(asset);
  }, [videosList]);
  
  // NPU and AI Studio integration states
  const [selectedSketchPath, setSelectedSketchPath] = useState<string | null>(null);
  const [engine, setEngine] = useState<CreativeEngine | null>(null);

  const handleVideoSelect = useCallback((video: VideoAsset) => {
    // Update selected video and force re-render of editor
    setSelectedVideo(video);
    setEditorKey((prev) => prev + 1);
  }, []);

  const handleImportLocal = useCallback((filePath: string) => {
    const newLocalAsset: VideoAsset = {
      full: filePath,
      thumbUri: '', // empty to indicate local asset
      alt: 'Local Video File',
      author: {
        name: 'Local System',
        url: ''
      }
    };
    setVideosList((prev) => [...prev, newLocalAsset]);
  }, []);

  const handleToggleAIPanel = useCallback(() => {
    setIsAIPanelOpen((prev) => !prev);
  }, []);

  const handleSendToTimeline = useCallback((filePath: string) => {
    // 1. Add asset to Media Bin
    handleImportLocal(filePath);
    
    // 2. Switch view back to Edit Suite
    setActiveView('edit');
    
    // 3. Dispatch clip insertion event to Timeline
    setTimeout(() => {
      const event = new CustomEvent('insert-timeline-clip', {
        detail: { filePath }
      });
      window.dispatchEvent(event);
    }, 100);
  }, [handleImportLocal]);

  // Handle capturing sketch guide and shifting to AI Copilot panel
  const handleUseAsSketchGuide = useCallback((filePath: string) => {
    setSelectedSketchPath(filePath);
    setActiveView('edit');
    setIsAIPanelOpen(true);
  }, []);

  return (
    <div className={styles.appContainer}>
      <WindowControls />
      
      {/* Top Navigation Bar */}
      <div className={styles.navBar}>
        <div className={styles.navLeft}>
          <div className={styles.navLogo}>
            <span className={styles.logoAccent}>⚡</span> Rengoku AI Suite
          </div>
          <div className={styles.divider} />
          <div className={styles.navTabs}>
            <button
              className={`${styles.navTab} ${activeView === 'edit' ? styles.activeTab : ''}`}
              onClick={() => {
                setActiveView('edit');
                setActivePanel('media');
              }}
            >
              Edit Suite
            </button>
            <button
              className={`${styles.navTab} ${activeView === 'color' ? styles.activeTab : ''}`}
              onClick={() => setActiveView('color')}
            >
              Color Grading
            </button>
            <button
              className={`${styles.navTab} ${activeView === 'vfx' ? styles.activeTab : ''}`}
              onClick={() => setActiveView('vfx')}
            >
              Fusion VFX
            </button>
            <button
              className={`${styles.navTab} ${activeView === 'audio' ? styles.activeTab : ''}`}
              onClick={() => setActiveView('audio')}
            >
              Fairlight Audio
            </button>
            <button
              className={`${styles.navTab} ${activeView === 'transcript' ? styles.activeTab : ''}`}
              onClick={() => setActiveView('transcript')}
            >
              AI Transcript
            </button>
            <button
              className={`${styles.navTab} ${activeView === 'ai' ? styles.activeTab : ''}`}
              onClick={() => setActiveView('ai')}
            >
              AI Studio
            </button>
          </div>
        </div>

        <div className={styles.navCenter}>
          <div className={styles.modeToggle}>
            <span className={styles.modeActive}>Video Mode</span>
          </div>
          {selectedVideo && (
            <>
              <div className={styles.miniDivider} />
              <span className={styles.projectName}>{selectedVideo.alt}</span>
            </>
          )}
        </div>

        <div className={styles.navRight}>
          <button className={styles.navBtn}>Share</button>
          <button className={`${styles.navBtn} ${styles.btnPrimary}`}>Export</button>
          <div className={styles.avatar}>A</div>
        </div>
      </div>

      <div className={styles.mainContent}>
        {activeView === 'edit' ? (
          <>
            <div className={styles.app}>
              {/* Left tools panel (Lumina layout) */}
              <div className={styles.toolsPanel}>
                <button
                  className={`${styles.toolBtn} ${activePanel === 'media' ? styles.toolActive : ''}`}
                  onClick={() => {
                    setActiveView('edit');
                    setActivePanel('media');
                  }}
                  title="Media & Resources"
                >
                  <FolderIcon />
                </button>
                <button
                  className={`${styles.toolBtn} ${activePanel === 'effects' ? styles.toolActive : ''}`}
                  onClick={() => {
                    setActiveView('edit');
                    setActivePanel('effects');
                  }}
                  title="Effects & Adjustments"
                >
                  <SlidersIcon />
                </button>
                <div className={styles.toolDivider} />
                <button
                  className={`${styles.toolBtn} ${styles.toolAi}`}
                  onClick={() => {
                    setActiveView('ai');
                  }}
                  title="AI Studio drawing canvas"
                >
                  <SparklesPanelIcon />
                </button>
              </div>

              {/* Sidebar Panel Selection */}
              {activePanel === 'media' ? (
                <VideoSelector
                  videos={videosList}
                  selectedVideo={selectedVideo}
                  onSelect={handleVideoSelect}
                  onImportLocal={handleImportLocal}
                  onToggleAIPanel={handleToggleAIPanel}
                />
              ) : (
                <EffectsSelector engine={engine} />
              )}

              {/* Editor Workspace */}
              <div className={styles.editorWrapper}>
                {selectedVideo != null ? (
                  <MainPlayer
                    key={editorKey}
                    activeUrl={selectedVideo ? (isLocalPath(selectedVideo.full) ? convertFileSrc(selectedVideo.full) : selectedVideo.full) : null}
                    onEngineInit={setEngine}
                  />
                ) : (
                  <div className={styles.emptyEditorState}>
                    <div className={styles.emptyCard}>
                      <h3>Start Editing Video</h3>
                      <p>Select an asset from the Library sidebar, import local video/photo clips, or jump to <strong>AI Studio</strong> to sketch composition overlays.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Interactive AI Copilot Panel */}
              <AIPromptPanel
                isOpen={isAIPanelOpen}
                onClose={() => setIsAIPanelOpen(false)}
                selectedVideoPath={selectedVideo ? selectedVideo.full : null}
                selectedSketchPath={selectedSketchPath}
                onClearSketchPath={() => setSelectedSketchPath(null)}
                onSendToTimeline={handleSendToTimeline}
              />
            </div>
            <Timeline engine={engine} onSelectClip={handleSelectClip} selectedVideo={selectedVideo} />
          </>
        ) : activeView === 'color' ? (
          <ColorGradingView selectedVideo={selectedVideo} engine={engine} />
        ) : activeView === 'vfx' ? (
          <VfxView selectedVideo={selectedVideo} engine={engine} />
        ) : activeView === 'audio' ? (
          <AudioView selectedVideo={selectedVideo} engine={engine} />
        ) : activeView === 'transcript' ? (
          <TranscriptView selectedVideo={selectedVideo} engine={engine} />
        ) : (
          <AIStudio 
            onSendToTimeline={handleSendToTimeline} 
            onUseAsSketchGuide={handleUseAsSketchGuide} 
          />
        )}
      </div>
    </div>
  );
}

