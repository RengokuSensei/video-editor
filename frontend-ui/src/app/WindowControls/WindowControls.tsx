/**
 * Custom Title Bar and Window Controls Component for Tauri
 */

import { useEffect, useState } from 'react';
import styles from './WindowControls.module.css';

let appWindow: any = null;

try {
  // Check if we are running inside the Tauri environment
  if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
    // Dynamically import to prevent bundler issues in non-tauri builds
    import('@tauri-apps/api/window').then((mod) => {
      appWindow = mod.getCurrentWindow();
    });
  }
} catch (e) {
  console.warn('Tauri API not available, running in web browser fallback.');
}

export default function WindowControls() {
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      setIsTauri(true);
    }
  }, []);

  const handleMinimize = () => {
    if (appWindow) {
      appWindow.minimize();
    }
  };

  const handleMaximize = () => {
    if (appWindow) {
      appWindow.toggleMaximize();
    }
  };

  const handleClose = () => {
    if (appWindow) {
      appWindow.close();
    }
  };

  if (!isTauri) {
    return null; // Don't show controls in standard web browser
  }

  return (
    <div data-tauri-drag-region className={styles.titlebar}>
      <div data-tauri-drag-region className={styles.title}>
        Video Editor
      </div>
      <div className={styles.controls}>
        <button className={styles.button} onClick={handleMinimize} title="Minimize">
          &#8212;
        </button>
        <button className={styles.button} onClick={handleMaximize} title="Maximize">
          &#9633;
        </button>
        <button className={`${styles.button} ${styles.closeButton}`} onClick={handleClose} title="Close">
          &#10005;
        </button>
      </div>
    </div>
  );
}
