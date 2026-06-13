import React, { useState, useEffect, useRef } from 'react';

// Type declarations for Emscripten bindings
interface WasmVideoTimelineManager {
  initializeProfile(profileName: string): boolean;
  addClip(type: string, source: string, trackIndex: number): boolean;
  exportFrameToPpm(frameIndex: number, outputPath: string, width: number, height: number): boolean;
  printTimelineInfo(): void;
  detectAndApplyAutoCut(trackIndex: number, modelPath: string): any; // Embind Vector
  delete(): void;
}

interface WasmModule {
  VideoTimelineManager: new (profileName: string) => WasmVideoTimelineManager;
  FS: {
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
  };
}

interface MediaClip {
  id: string;
  name: string;
  size: string;
  path: string;
}

interface ShotSegment {
  id: number;
  label: string;
  start: number;
  end: string | number;
}

export default function App() {
  const [wasmModule, setWasmModule] = useState<WasmModule | null>(null);
  const [timelineEngine, setTimelineEngine] = useState<WasmVideoTimelineManager | null>(null);
  
  const [mediaBin, setMediaBin] = useState<MediaClip[]>([]);
  const [activeClip, setActiveClip] = useState<MediaClip | null>(null);
  const [timelineShots, setTimelineShots] = useState<ShotSegment[]>([
    { id: 1, label: "Color Clip [Blue] (Base)", start: 0, end: "End" }
  ]);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [statusText, setStatusText] = useState("System: Ready");
  const [monitorText, setMonitorText] = useState("Wasm Engine Preview Canvas\n[Select an asset to begin]");
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 1. Initialize Emscripten Wasm Module
  useEffect(() => {
    setStatusText("System: Loading Wasm Core...");
    
    // Dynamically import Emscripten factory module
    // In local dev Vite loads this from /public/wasm/video_editor_wasm.js
    const loadWasm = async () => {
      try {
        const moduleFactory = (window as any).createVideoEditorModule || 
          (await import(/* @vite-ignore */ '/wasm/video_editor_wasm.js')).default;
          
        const module = await moduleFactory({
          locateFile: (path: string) => `/wasm/${path}`
        });

        setWasmModule(module);
        
        // Initialize timeline manager
        const engine = new module.VideoTimelineManager("atsc_1080p_30");
        setTimelineEngine(engine);
        
        setStatusText("System: Wasm Engine Connected");
        setMonitorText("Wasm Core initialized successfully!\n[Double-click bin items to mount to timeline]");
      } catch (err) {
        console.error("Failed to load Wasm:", err);
        setStatusText("System: Wasm Load Failed");
        setMonitorText("WebAssembly Core failed to load.\nEnsure Emscripten builds are compiled into public/wasm/");
      }
    };

    loadWasm();

    return () => {
      if (timelineEngine) {
        timelineEngine.delete();
      }
    };
  }, []);

  // 2. Play / Pause Control
  const handlePlayToggle = () => {
    if (!wasmModule || !timelineEngine) return;
    
    const nextState = !isPlaying;
    setIsPlaying(nextState);
    if (nextState) {
      setStatusText("Status: Playing (Wasm)");
      setMonitorText("SharedArrayBuffer Multithreaded playback active...\n[Running Web Workers render loop]");
    } else {
      setStatusText("Status: Paused");
      setMonitorText("Playback paused.");
    }
  };

  // 3. File Import
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const newClip: MediaClip = {
      id: Math.random().toString(36).substring(7),
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(2) + " MB",
      path: file.name // virtual local path
    };

    setMediaBin((prev) => [...prev, newClip]);
    setStatusText(`Imported clip: ${file.name}`);
  };

  // 4. Mount Clip to Timeline via Double-Click
  const handleClipDoubleClick = (clip: MediaClip) => {
    if (!wasmModule || !timelineEngine) return;

    // Load in C++ Wasm timeline track 0
    // Maps to "avformat" in our core-engine
    const success = timelineEngine.addClip("avformat", clip.path, 0);
    if (success) {
      setActiveClip(clip);
      setStatusText(`Active Timeline Clip: ${clip.name}`);
      setMonitorText(`Mounted active clip:\n${clip.name}\n\n[Click 'Auto-Cut (AI)' or 'Export Frame']`);
      
      // Update visual timeline
      setTimelineShots([
        { id: 1, label: `Active: ${clip.name}`, start: 0, end: "End" }
      ]);
    }
  };

  // 5. Run AI Scene Cut Detection on the GPU/NPU (DirectML / Fallback)
  const handleAutoCut = () => {
    if (!wasmModule || !timelineEngine || !activeClip) {
      alert("Please import and double-click a media file to mount it on the timeline first.");
      return;
    }

    setStatusText("Status: AI Scene Scanning...");
    setMonitorText("Running DirectML Accelerated ONNX Scene Model in sandbox...\n[Evaluating contiguous video frames]");

    setTimeout(() => {
      try {
        // Runs the C++ detectAndApplyAutoCut which triggers the scene cuts vector
        const cutsVector = timelineEngine.detectAndApplyAutoCut(0, "scene_detection.onnx");
        
        // Convert Embind std::vector<int> to JavaScript Array
        const cuts: number[] = [];
        for (let i = 0; i < cutsVector.size(); ++i) {
          cuts.push(cutsVector.get(i));
        }

        if (cuts.length === 0) {
          setStatusText("Status: AI Cut Complete (No cuts)");
          setMonitorText("Inference complete. No scene changes found.");
          return;
        }

        // Generate visual timeline partitions (shots)
        const newShots: ShotSegment[] = [];
        let prev = 0;
        cuts.forEach((cutFrame, index) => {
          newShots.push({
            id: index + 1,
            label: `Shot ${index + 1} (f${prev}-${cutFrame})`,
            start: prev,
            end: cutFrame
          });
          prev = cutFrame;
        });
        newShots.push({
          id: cuts.length + 1,
          label: `Shot ${cuts.length + 1} (f${prev}-End)`,
          start: prev,
          end: "End"
        });

        setTimelineShots(newShots);
        setStatusText(`Status: AI Cut Complete (${newShots.length} shots)`);
        setMonitorText(`AI scene analysis completed successfully!\nDetected ${cuts.length} cuts.\nTimeline partitioned into ${newShots.length} shot segments.`);

      } catch (err) {
        console.error("AI Scene Detection error:", err);
        setStatusText("Status: AI Scan Failed");
      }
    }, 800); // slight delay to show processing text
  };

  // 6. Export Frame & Render to HTML5 Canvas
  const handleExportFrame = () => {
    if (!wasmModule || !timelineEngine) return;

    setStatusText("Status: Rendering Frame...");
    const tempFileName = "wasm_render.ppm";
    const width = 480;
    const height = 270;

    try {
      // 1. Call Wasm engine to render current frame 0 to MEMFS virtual disk
      const success = timelineEngine.exportFrameToPpm(0, tempFileName, width, height);
      if (!success) {
        throw new Error("Wasm engine failed to write PPM frame.");
      }

      // 2. Read raw PPM P6 bytes from Emscripten Virtual File System (MEMFS)
      const fileBytes = wasmModule.FS.readFile(tempFileName);
      
      // 3. Parse binary PPM P6 to extract raw RGB buffers
      const parsed = parsePPMP6(fileBytes);
      
      // 4. Paint raw RGB data directly onto HTML5 Canvas
      renderRGBToCanvas(parsed.pixelData, parsed.width, parsed.height);

      // Clean up Virtual file system allocation
      wasmModule.FS.unlink(tempFileName);

      setStatusText("Status: Frame Rendered");
    } catch (err: any) {
      console.error("Frame render failed:", err);
      setStatusText("Status: Render Failed");
      setMonitorText(`Render Error: ${err.message}`);
    }
  };

  // Helper: Parse binary PPM P6 raw image format
  const parsePPMP6 = (bytes: Uint8Array) => {
    let i = 0;
    let headerStr = "";
    
    // Read header lines (P6, width, height, maxVal)
    while (i < bytes.length && headerStr.split(/\s+/).length <= 4) {
      headerStr += String.fromCharCode(bytes[i]);
      i++;
    }

    const tokens = headerStr.trim().split(/\s+/);
    if (tokens[0] !== "P6") throw new Error("File is not in binary PPM (P6) format.");

    const width = parseInt(tokens[1]);
    const height = parseInt(tokens[2]);
    const maxVal = parseInt(tokens[3]);

    // Find the exact starting position of the raw pixel data
    let whitespaceCount = 0;
    let headerLength = 0;
    for (let j = 0; j < bytes.length; ++j) {
      const b = bytes[j];
      if (b === 10 || b === 32 || b === 13 || b === 9) { // newline, space, CR, tab
        if (j > 0 && !(bytes[j - 1] === 10 || bytes[j - 1] === 32 || bytes[j - 1] === 13 || bytes[j - 1] === 9)) {
          whitespaceCount++;
          if (whitespaceCount === 4) {
            headerLength = j + 1;
            break;
          }
        }
      }
    }

    const pixelData = bytes.subarray(headerLength);
    return { width, height, maxVal, pixelData };
  };

  // Helper: Copy raw RGB bytes to canvas ImageData
  const renderRGBToCanvas = (pixelData: Uint8Array, w: number, h: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = ctx.createImageData(w, h);

    // Map RGB to RGBA (Canvas needs alpha channel)
    for (let src = 0, dest = 0; src < pixelData.length; src += 3, dest += 4) {
      imgData.data[dest] = pixelData[src];     // Red
      imgData.data[dest + 1] = pixelData[src + 1]; // Green
      imgData.data[dest + 2] = pixelData[src + 2]; // Blue
      imgData.data[dest + 3] = 255;                // Alpha
    }

    ctx.putImageData(imgData, 0, 0);
  };

  return (
    <div style={styles.appContainer}>
      <header style={styles.header}>
        <h2 style={styles.appTitle}>Wasm Video Editor Module</h2>
        <span style={styles.statusBadge}>{statusText}</span>
      </header>

      {/* Main split viewport layout */}
      <div style={styles.workspace}>
        {/* Left Panel: Media Bin */}
        <section style={styles.leftPanel}>
          <h3 style={styles.sectionTitle}>Media Bin</h3>
          <div style={styles.mediaList}>
            {mediaBin.length === 0 ? (
              <div style={styles.emptyText}>No clips imported yet.</div>
            ) : (
              mediaBin.map((clip) => (
                <div 
                  key={clip.id} 
                  style={{
                    ...styles.mediaItem,
                    borderColor: activeClip?.id === clip.id ? '#007acc' : '#2d2d2d'
                  }}
                  onDoubleClick={() => handleClipDoubleClick(clip)}
                  title="Double-click to mount to timeline"
                >
                  <div style={styles.clipName}>{clip.name}</div>
                  <div style={styles.clipMeta}>{clip.size}</div>
                </div>
              ))
            )}
          </div>
          <button style={styles.accentButton} onClick={handleImportClick}>
            Import Clip
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleFileChange}
            accept="video/*,audio/*"
          />
        </section>

        {/* Right Panel: Playback Monitor */}
        <section style={styles.rightPanel}>
          <h3 style={styles.sectionTitle}>Playback Monitor</h3>
          <div style={styles.monitorCanvas}>
            {/* Draw PPM outputs dynamically on Canvas if rendered, else show text */}
            <canvas 
              ref={canvasRef} 
              style={{
                display: statusText === "Status: Frame Rendered" ? 'block' : 'none',
                maxWidth: '100%',
                maxHeight: '100%',
                borderRadius: '4px'
              }}
            />
            {statusText !== "Status: Frame Rendered" && (
              <pre style={styles.monitorLabel}>{monitorText}</pre>
            )}
          </div>

          <div style={styles.controlBar}>
            <button style={styles.btn} onClick={handlePlayToggle}>
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button style={styles.btn} onClick={handleExportFrame}>
              Export Frame
            </button>
          </div>
        </section>
      </div>

      {/* Bottom Panel: Multitrack Timeline */}
      <section style={styles.bottomPanel}>
        <div style={styles.timelineHeader}>
          <h3 style={styles.sectionTitle}>Multitrack Timeline</h3>
          <div style={styles.timelineTools}>
            <button style={styles.accentButton} onClick={handleAutoCut}>
              Auto-Cut (AI)
            </button>
          </div>
        </div>

        {/* Timeline Tracks Grid */}
        <div style={styles.tracksGrid}>
          {/* Track V0 */}
          <div style={styles.trackRow}>
            <div style={styles.trackHeader}>Track V0</div>
            <div style={styles.trackContent}>
              {timelineShots.map((shot) => (
                <div 
                  key={shot.id} 
                  style={{
                    ...styles.shotSegment,
                    flex: timelineShots.length === 1 ? 1 : 'unset',
                    width: timelineShots.length > 1 ? `${100 / timelineShots.length}%` : 'auto'
                  }}
                >
                  <div style={styles.shotLabel}>{shot.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Track A0 */}
          <div style={styles.trackRow}>
            <div style={styles.trackHeader}>Track A0</div>
            <div style={styles.trackContent}>
              <div style={styles.audioPlaceholder}>[00:00 - 05:00] Master Audio Track</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// Styling definitions (Premium Dark Theme matching QSS styles)
const styles: { [key: string]: React.CSSProperties } = {
  appContainer: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: '#121212',
    color: '#e0e0e0',
    fontFamily: "'Segoe UI', Arial, sans-serif",
    fontSize: '12px',
    boxSizing: 'border-box'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 16px',
    backgroundColor: '#1a1a1a',
    borderBottom: '1px solid #2d2d2d'
  },
  appTitle: {
    margin: 0,
    fontSize: '15px',
    fontWeight: 'bold',
    color: '#007acc'
  },
  statusBadge: {
    padding: '4px 8px',
    backgroundColor: '#282828',
    borderRadius: '4px',
    border: '1px solid #333',
    color: '#888',
    fontSize: '11px'
  },
  workspace: {
    display: 'flex',
    flex: 2,
    borderBottom: '1px solid #2d2d2d',
    overflow: 'hidden'
  },
  leftPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '12px',
    borderRight: '1px solid #2d2d2d',
    backgroundColor: '#1e1e1e'
  },
  rightPanel: {
    flex: 2.2,
    display: 'flex',
    flexDirection: 'column',
    padding: '12px',
    backgroundColor: '#1e1e1e'
  },
  bottomPanel: {
    flex: 1.2,
    display: 'flex',
    flexDirection: 'column',
    padding: '12px',
    backgroundColor: '#1e1e1e',
    overflowY: 'auto'
  },
  sectionTitle: {
    margin: '0 0 10px 0',
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#007acc'
  },
  mediaList: {
    flex: 1,
    backgroundColor: '#151515',
    border: '1px solid #2d2d2d',
    borderRadius: '4px',
    padding: '8px',
    marginBottom: '10px',
    overflowY: 'auto'
  },
  emptyText: {
    color: '#555',
    textAlign: 'center',
    paddingTop: '20px'
  },
  mediaItem: {
    backgroundColor: '#1c1c1c',
    border: '1px solid #2d2d2d',
    borderRadius: '4px',
    padding: '8px',
    marginBottom: '6px',
    cursor: 'pointer',
    userSelect: 'none'
  },
  clipName: {
    fontWeight: 'bold',
    color: '#ffffff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  clipMeta: {
    fontSize: '10px',
    color: '#666',
    marginTop: '2px'
  },
  accentButton: {
    backgroundColor: '#007acc',
    color: '#ffffff',
    border: '1px solid #0098ff',
    borderRadius: '4px',
    padding: '6px 14px',
    cursor: 'pointer',
    fontWeight: 'bold',
    textAlign: 'center'
  },
  btn: {
    backgroundColor: '#2d2d2d',
    color: '#ffffff',
    border: '1px solid #3f3f3f',
    borderRadius: '4px',
    padding: '6px 14px',
    cursor: 'pointer',
    marginRight: '8px'
  },
  monitorCanvas: {
    flex: 1,
    backgroundColor: '#090909',
    border: '1px solid #2d2d2d',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: '5px'
  },
  monitorLabel: {
    margin: 0,
    color: '#888',
    textAlign: 'center',
    fontFamily: 'inherit',
    fontSize: '12px',
    lineHeight: '1.6'
  },
  controlBar: {
    display: 'flex',
    marginTop: '10px'
  },
  timelineHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px'
  },
  timelineTools: {
    display: 'flex',
    gap: '8px'
  },
  tracksGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    backgroundColor: '#151515',
    border: '1px solid #2d2d2d',
    borderRadius: '4px',
    padding: '8px',
    flex: 1
  },
  trackRow: {
    display: 'flex',
    height: '42px',
    backgroundColor: '#1e1e1e',
    borderRadius: '4px',
    overflow: 'hidden',
    border: '1px solid #282828'
  },
  trackHeader: {
    width: '70px',
    backgroundColor: '#282828',
    color: '#888',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    borderRight: '1px solid #252525'
  },
  trackContent: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    padding: '0 4px',
    gap: '6px',
    overflowX: 'auto'
  },
  shotSegment: {
    backgroundColor: '#1e2830',
    color: '#72b2e8',
    border: '1px solid #203c54',
    borderRadius: '3px',
    height: '30px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 10px',
    boxSizing: 'border-box',
    cursor: 'default'
  },
  shotLabel: {
    fontSize: '11px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  audioPlaceholder: {
    color: '#555',
    fontSize: '11px',
    paddingLeft: '10px'
  }
};
