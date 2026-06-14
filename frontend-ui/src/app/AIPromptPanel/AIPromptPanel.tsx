import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import styles from './AIPromptPanel.module.css';

// ============================================================================
// Types
// ============================================================================

interface AIPromptPanelProps {
  /** If true, the panel expands and displays */
  isOpen: boolean;
  /** Callback to close the panel */
  onClose: () => void;
}

// ============================================================================
// Icons
// ============================================================================

const MagicWandIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19.82 2H22v2.18L19.82 2zM15.45 6.36l2.18 2.19L15.45 6.36zM2 22l9-9M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const SparklesIconSmall = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.06 11.9L11.5 12l-2.44.1L9 14.5l-.1-2.44L6.5 12l2.44-.1L9 9.5zM19.06 4.9L21.5 5l-2.44.1L19 7.5l-.1-2.44L16.5 5l2.44-.1L19 2.5z" />
  </svg>
);

// ============================================================================
// Component
// ============================================================================

export default function AIPromptPanel({ isOpen, onClose }: AIPromptPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Tick up progress bar while async NPU is active
  useEffect(() => {
    let timer: number;
    if (isLoading) {
      setProgress(0);
      timer = window.setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return 90; // Hold at 90% until Rust thread completes
          return prev + 3; // Step up
        });
      }, 100);
    } else {
      setProgress(0);
    }
    return () => clearInterval(timer);
  }, [isLoading]);

  const handleGenerateClick = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;

    setIsLoading(true);
    setStatus(null);

    try {
      // Invoke async Tauri command to simulate backend NPU load
      const response = await invoke<string>('handle_ai_generation', { prompt: trimmedPrompt });
      
      setProgress(100);
      setTimeout(() => {
        setIsLoading(false);
        setStatus({ type: 'success', message: response });
      }, 300);
    } catch (err: any) {
      setIsLoading(false);
      setStatus({ type: 'error', message: err || 'AI generation processing failed.' });
    }
  };

  return (
    <aside className={`${styles.panel} ${!isOpen ? styles.closed : ''}`}>
      <div className={styles.header}>
        <h3 className={styles.title}>
          <span className={styles.titleIcon}>
            <MagicWandIcon />
          </span>
          AI Copilot
        </h3>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close panel">
          <CloseIcon />
        </button>
      </div>

      <div className={styles.body}>
        <label htmlFor="ai-prompt" className={styles.label}>
          Describe enhancement or generation
        </label>
        <textarea
          id="ai-prompt"
          className={styles.textarea}
          placeholder="e.g. 'Add a cinematic color grade' or 'Generate an image overlay'"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={isLoading}
        />

        <button
          className={styles.generateBtn}
          onClick={handleGenerateClick}
          disabled={isLoading || !prompt.trim()}
        >
          <MagicWandIcon />
          Generate
        </button>

        {/* Loading / NPU Progress Indicators */}
        {isLoading && (
          <div className={styles.loaderContainer}>
            <div className={styles.npuLabel}>
              <SparklesIconSmall />
              NPU Processing...
            </div>
            
            <div className={styles.progressBarOuter}>
              <div
                className={styles.progressBarInner}
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className={styles.skeletonList}>
              <div className={styles.skeleton} style={{ height: '14px', width: '70%' }} />
              <div className={styles.skeleton} style={{ height: '10px', width: '90%' }} />
              <div className={styles.skeleton} style={{ height: '10px', width: '45%' }} />
            </div>
          </div>
        )}

        {/* Success/Error Feedback Banner */}
        {status && !isLoading && (
          <div
            className={`${styles.statusBox} ${
              status.type === 'success' ? styles.statusSuccess : styles.statusError
            }`}
          >
            {status.type === 'success' ? '✓ ' : '⚠ '}
            {status.message}
          </div>
        )}
      </div>
    </aside>
  );
}
