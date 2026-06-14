import { useCallback, useState } from 'react';
import CreativeEditor from '@cesdk/cesdk-js/react';
import type CreativeEditorSDK from '@cesdk/cesdk-js';
import type { Configuration } from '@cesdk/cesdk-js';

import { initStartWithVideoEditor } from '../imgly';
import { VIDEO_CATALOG } from './video-catalog';
import type { VideoAsset } from './video-catalog';
import VideoSelector from './VideoSelector/VideoSelector';
import WindowControls from './WindowControls/WindowControls';
import Timeline from './Timeline/Timeline';
import AIPromptPanel from './AIPromptPanel/AIPromptPanel';
import AIStudio from './AIStudio/AIStudio';
import styles from './App.module.css';

// ============================================================================
// Types
// ============================================================================

interface AppProps {
  config: Configuration;
}

// ============================================================================
// App Component
// ============================================================================

export default function App({ config }: AppProps) {
  const [videosList, setVideosList] = useState<VideoAsset[]>(VIDEO_CATALOG);
  const [selectedVideo, setSelectedVideo] = useState<VideoAsset | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  const [activeView, setActiveView] = useState<'edit' | 'ai'>('edit');

  const handleInit = useCallback(
    async (cesdk: CreativeEditorSDK) => {
      // Debug access (remove in production)
      (window as any).cesdk = cesdk;

      if (selectedVideo == null) return;

      // Initialize with the selected video
      await initStartWithVideoEditor(cesdk, selectedVideo.full);
    },
    [selectedVideo]
  );

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

  return (
    <div className={styles.appContainer}>
      <WindowControls />
      
      {/* Top Navigation Bar */}
      <div className={styles.navBar}>
        <div className={styles.navLogo}>
          <span className={styles.logoAccent}>⚡</span> Rengoku Editor
        </div>
        <div className={styles.navTabs}>
          <button
            className={`${styles.navTab} ${activeView === 'edit' ? styles.activeTab : ''}`}
            onClick={() => setActiveView('edit')}
          >
            Edit Suite
          </button>
          <button
            className={`${styles.navTab} ${activeView === 'ai' ? styles.activeTab : ''}`}
            onClick={() => setActiveView('ai')}
          >
            AI Studio
          </button>
        </div>
        <div className={styles.navRightSpacer} />
      </div>

      <div className={styles.mainContent}>
        {activeView === 'edit' ? (
          <>
            <div className={styles.app}>
              <VideoSelector
                videos={videosList}
                selectedVideo={selectedVideo}
                onSelect={handleVideoSelect}
                onImportLocal={handleImportLocal}
                onToggleAIPanel={handleToggleAIPanel}
              />
              <div className={styles.editorWrapper}>
                {selectedVideo != null ? (
                  <CreativeEditor
                    key={editorKey}
                    className={styles.editor}
                    config={config}
                    init={handleInit}
                  />
                ) : (
                  <div className={styles.emptyEditorState}>
                    <div className={styles.emptyCard}>
                      <h3>Start Editing Video</h3>
                      <p>Select a preloaded asset from the library, import a local file, or jump to <strong>AI Studio</strong> to sketch custom graphics.</p>
                    </div>
                  </div>
                )}
              </div>
              <AIPromptPanel
                isOpen={isAIPanelOpen}
                onClose={() => setIsAIPanelOpen(false)}
              />
            </div>
            <Timeline />
          </>
        ) : (
          <AIStudio onSendToTimeline={handleSendToTimeline} />
        )}
      </div>
    </div>
  );
}

