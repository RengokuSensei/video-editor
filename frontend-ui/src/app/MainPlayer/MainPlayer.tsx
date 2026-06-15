import { useEffect, useRef } from 'react';
import CreativeEngine from '@cesdk/engine';
import styles from './MainPlayer.module.css';

interface MainPlayerProps {
  activeUrl: string | null;
  onEngineInit: (engine: CreativeEngine | null) => void;
}

export default function MainPlayer({ activeUrl, onEngineInit }: MainPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CreativeEngine | null>(null);

  useEffect(() => {
    let isMounted = true;
    let engineInstance: CreativeEngine | null = null;

    async function initializeEngine() {
      try {
        if (!canvasRef.current) return;
        console.log("MainPlayer: Initializing CreativeEngine on HTML5 canvas...");
        
        // Initialize CreativeEngine directly targeting the canvas ref
        const engine = await CreativeEngine.init({
          canvas: canvasRef.current,
          userId: 'starterkit-start-with-video-user',
        });

        if (!isMounted) {
          engine.dispose();
          return;
        }

        engineRef.current = engine;
        engineInstance = engine;
        onEngineInit(engine);
        console.log("MainPlayer: CreativeEngine initialized successfully!");

        // Load the initial asset if available
        if (activeUrl) {
          await loadAsset(engine, activeUrl);
        }
      } catch (error) {
        // Print engine initialization failures via a structured try/catch block
        console.error("MainPlayer: Structured catch - CreativeEngine initialization failed:", error);
      }
    }

    initializeEngine();

    return () => {
      isMounted = false;
      onEngineInit(null);
      if (engineInstance) {
        console.log("MainPlayer: Disposing CreativeEngine instance...");
        try {
          engineInstance.dispose();
        } catch (e) {
          console.error("MainPlayer: Error during engine disposal:", e);
        }
      }
    };
  }, [onEngineInit]);

  // Secondary effect to reload/update asset when activeUrl changes
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !activeUrl) return;

    loadAsset(engine, activeUrl);
  }, [activeUrl]);

  // Unified asset loading helper
  async function loadAsset(engine: CreativeEngine, url: string) {
    try {
      console.log(`MainPlayer: Loading active asset into workspace. Path/URL = ${url}`);

      // We support both createFromImage and createFromVideo/video block based on type
      const isVideo = url.toLowerCase().match(/\.(mp4|webm|mkv|mov|avi)$/) || url.includes('video') || url.includes('asset.localhost');

      if (isVideo) {
        console.log("MainPlayer: Asset identified as video. Attempting createFromVideo...");
        try {
          await engine.scene.createFromVideo(url);
          console.log("MainPlayer: Video scene created successfully via createFromVideo.");
        } catch (videoSceneErr) {
          console.warn("MainPlayer: createFromVideo failed. Falling back to programmatic 'ly.img.video' block creation:", videoSceneErr);
          
          // Create fallback video scene programmatically
          const scene = await engine.scene.create();
          const page = engine.block.create('ly.img.page' as any);
          engine.block.appendChild(scene, page);
          
          // Explicitly call engine.block.create('ly.img.video') to load it into active workspace canvas
          const videoBlock = engine.block.create('ly.img.video' as any);
          engine.block.setString(videoBlock, 'video/videoFileURI', url);
          engine.block.appendChild(page, videoBlock);
          
          console.log("MainPlayer: Video block created programmatically.");
        }
      } else {
        console.log("MainPlayer: Asset identified as image. Explicitly calling createFromImage...");
        // Explicitly calls engine.scene.createFromImage(url)
        await engine.scene.createFromImage(url);
        console.log("MainPlayer: Image scene created successfully via createFromImage.");
      }

      // Auto zoom to fit the active scene in view
      const activeScene = engine.scene.get();
      if (activeScene !== null) {
        engine.scene.zoomToBlock(activeScene);
      }
    } catch (err) {
      console.error("MainPlayer: Structured catch - Failed to load asset:", err);
    }
  }

  return (
    <div className={styles.playerContainer}>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
