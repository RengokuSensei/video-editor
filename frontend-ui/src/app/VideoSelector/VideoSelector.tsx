/**
 * CE.SDK Start with Video - Video Selector Component
 *
 * A sidebar component that displays video thumbnails and local assets for selection.
 */

import classNames from 'classnames';
import { open } from '../../tauri-dialog-shim';

import type { VideoAsset } from '../video-catalog';
import styles from './VideoSelector.module.css';

// ============================================================================
// Types
// ============================================================================

interface VideoSelectorProps {
  /** List of available videos */
  videos: VideoAsset[];
  /** Currently selected video */
  selectedVideo: VideoAsset | null;
  /** Callback when a video is selected */
  onSelect: (video: VideoAsset) => void;
  /** Callback when a local file is imported */
  onImportLocal: (filePath: string) => void;
  /** Callback to toggle the AI panel */
  onToggleAIPanel: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

const getFileName = (path: string) => {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || 'video.mp4';
};

const isLocalFile = (video: VideoAsset) => {
  if (video.full.startsWith('http://') || video.full.startsWith('https://')) {
    return false;
  }
  if (video.full.startsWith('/') || video.full.startsWith('./') || video.full.startsWith('../')) {
    return false;
  }
  return video.full.includes(':\\') || video.full.includes(':/') || video.full.startsWith('\\\\') || !video.thumbUri || video.thumbUri === '';
};

const VideoIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 7l-7 5 7 5V7z" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const SparklesIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.06 11.9L11.5 12l-2.44.1L9 14.5l-.1-2.44L6.5 12l2.44-.1L9 9.5zM19.06 4.9L21.5 5l-2.44.1L19 7.5l-.1-2.44L16.5 5l2.44-.1L19 2.5z" />
    <path d="M18.06 15.9l1.5.1-.94.1-.1.94-.1-.94-.94-.1.94-.1.1-.94z" />
  </svg>
);

// ============================================================================
// Component
// ============================================================================

export default function VideoSelector({
  videos,
  selectedVideo,
  onSelect,
  onImportLocal,
  onToggleAIPanel
}: VideoSelectorProps) {
  const handleImportClick = async () => {
    try {
      const selectedPath = await open({
        filters: [{ name: 'Video', extensions: ['mp4', 'mkv', 'mov'] }]
      });
      if (selectedPath) {
        const filePath = Array.isArray(selectedPath) ? selectedPath[0] : selectedPath;
        if (filePath) {
          onImportLocal(filePath);
        }
      }
    } catch (err) {
      console.error('Failed to import local file using tauri dialog:', err);
    }
  };

  const handleDragStart = (e: React.DragEvent, video: VideoAsset) => {
    console.log("VideoSelector handleDragStart: Dragging asset:", video.full);
    const payload = JSON.stringify({
      full: video.full,
      alt: video.alt
    });
    e.dataTransfer.setData('application/json', payload);
    e.dataTransfer.setData('text/plain', payload);
  };

  const catalogVideos = videos.filter(v => !isLocalFile(v));
  const localVideos = videos.filter(v => isLocalFile(v));

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarActions}>
        <button className={styles.importButton} onClick={handleImportClick}>
          <PlusIcon />
          Import Local
        </button>
        <button className={styles.aiButton} onClick={onToggleAIPanel}>
          <SparklesIcon />
          AI Copilot
        </button>
      </div>

      <h4 className={styles.sectionTitle}>Library</h4>
      <div className={styles.videoList}>
        {catalogVideos.map((video, index) => (
          <button
            key={video.full}
            draggable={true}
            onDragStart={(e) => handleDragStart(e, video)}
            className={classNames(styles.videoButton, {
              [styles.selected]: selectedVideo === video
            })}
            data-index={index}
            title={`${video.alt} (Drag to timeline)`}
            onClick={() => onSelect(video)}
          >
            <img
              className={styles.thumbnail}
              src={video.thumbUri}
              alt={video.alt}
            />
          </button>
        ))}
      </div>

      {localVideos.length > 0 && (
        <>
          <h4 className={styles.sectionTitle}>Media Bin</h4>
          <div className={styles.videoList}>
            {localVideos.map((video) => (
              <div
                key={video.full}
                draggable={true}
                onDragStart={(e) => handleDragStart(e, video)}
                onClick={() => onSelect(video)}
                className={classNames(styles.localFileCard, {
                  [styles.selected]: selectedVideo === video
                })}
                title={`${video.full} (Drag to timeline)`}
              >
                <span className={styles.fileIcon}>
                  <VideoIcon />
                </span>
                <span className={styles.localFileCardTitle}>
                  {getFileName(video.full)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
