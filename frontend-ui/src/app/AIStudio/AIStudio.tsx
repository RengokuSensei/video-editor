import React, { useRef, useState, useEffect } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import styles from './AIStudio.module.css';

// ============================================================================
// Types
// ============================================================================

interface AIStudioProps {
  onSendToTimeline: (filePath: string) => void;
  onUseAsSketchGuide?: (filePath: string) => void;
}

const BRUSH_COLORS = [
  '#000000', // Black
  '#ffffff', // White
  '#ff4a4a', // Vibrant Red
  '#00d2fc', // Vibrant Blue
  '#00f576', // Vibrant Green
  '#ffd300', // Vibrant Yellow
  '#ff9f00', // Vibrant Orange
  '#b624ff', // Vibrant Purple
];

// ============================================================================
// Component
// ============================================================================

export default function AIStudio({ onSendToTimeline, onUseAsSketchGuide }: AIStudioProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState('#000000');
  const [brushWidth, setBrushWidth] = useState(8);
  const [prompt, setPrompt] = useState('A warm sunset over cyber mountains, digital art style');
  const [strength, setStrength] = useState(0.75);
  
  // Status states
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [generatedFilePath, setGeneratedFilePath] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [studioMode, setStudioMode] = useState<'image' | 'video'>('image');

  // Initialize Canvas dimensions and default settings
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set dimensions with higher pixel ratio for sharp drawing
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Fill background with clean off-white
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  // Handle drawing events
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getEventCoords(e, canvas);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    
    // Set drawing styles
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushWidth;

    setIsDrawing(true);
    
    // Draw a single dot on click
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getEventCoords(e, canvas);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const getEventCoords = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement
  ) => {
    const rect = canvas.getBoundingClientRect();
    
    // Check if TouchEvent
    if ('touches' in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setGeneratedFilePath(null);
    setErrorText(null);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setErrorText('Please specify an AI prompt.');
      return;
    }

    setIsGenerating(true);
    setErrorText(null);
    setGeneratedFilePath(null);

    if (studioMode === 'image') {
      const canvas = canvasRef.current;
      if (!canvas) {
        setIsGenerating(false);
        return;
      }
      setStatusMessage('Capturing sketch pad and initializing local NPU engine...');
      try {
        const sketchDataUrl = canvas.toDataURL('image/png');
        setStatusMessage('Executing neural rendering on local Windows NPU...');
        const resultPath = await invoke<string>('process_sketch_to_npu', {
          sketchDataUrl,
          prompt,
          strength,
        });
        setGeneratedFilePath(resultPath);
        setStatusMessage('Generation completed successfully!');
      } catch (err: any) {
        console.error('NPU process error:', err);
        setErrorText(`NPU Generation Failed: ${err.message || err}`);
      } finally {
        setIsGenerating(false);
      }
    } else {
      setStatusMessage('Spawning local NPU text-to-video synthesis pipeline...');
      try {
        const resultPath = await invoke<string>('process_video_ai', {
          videoPath: 'none',
          sketchPath: 'none',
          prompt,
          taskType: 'text-to-video',
          strength
        });
        setGeneratedFilePath(resultPath);
        setStatusMessage('AI Video Synthesis completed successfully!');
      } catch (err: any) {
        console.error('NPU video process error:', err);
        setErrorText(`NPU Video Synthesis Failed: ${err.message || err}`);
      } finally {
        setIsGenerating(false);
      }
    }
  };

  const handleSendToTimeline = () => {
    if (!generatedFilePath) return;
    onSendToTimeline(generatedFilePath);
  };

  const handleUseAsSketchGuide = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsGenerating(true);
    setErrorText(null);
    setStatusMessage('Saving sketch overlay as composition guide...');

    try {
      const sketchDataUrl = canvas.toDataURL('image/png');
      
      const resultPath = await invoke<string>('process_sketch_to_npu', {
        sketchDataUrl,
        prompt: 'composition_guide_only',
        strength: 0.0,
      });

      console.log('Saved sketch guide at:', resultPath);
      if (onUseAsSketchGuide) {
        onUseAsSketchGuide(resultPath);
      }
    } catch (err: any) {
      console.error('Failed to save sketch guide:', err);
      setErrorText(`Failed to save sketch guide: ${err.message || err}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className={styles.workspace}>
      {/* Left Column: Sketchpad */}
      <div className={styles.sketchpadColumn}>
        <div className={styles.columnHeader}>
          <h2>AI Brush Sketchpad</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className={styles.clearButton} onClick={handleUseAsSketchGuide} disabled={isGenerating}>
              Use as Sketch Guide
            </button>
            <button className={styles.clearButton} onClick={handleClear} disabled={isGenerating}>
              Clear Workspace
            </button>
          </div>
        </div>

        <div className={styles.canvasContainer}>
          <canvas
            ref={canvasRef}
            className={styles.sketchCanvas}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>

        {/* Brush Controls */}
        <div className={styles.brushToolbar}>
          <div className={styles.brushSizeControl}>
            <label>Brush Width: <span>{brushWidth}px</span></label>
            <input
              type="range"
              min="1"
              max="50"
              value={brushWidth}
              onChange={(e) => setBrushWidth(parseInt(e.target.value))}
              disabled={isGenerating}
            />
          </div>

          <div className={styles.colorPalette}>
            {BRUSH_COLORS.map((color) => (
              <button
                key={color}
                className={`${styles.colorButton} ${brushColor === color ? styles.activeColor : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => setBrushColor(color)}
                disabled={isGenerating}
                title={color === '#ffffff' ? 'White Eraser' : color}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Right Column: Controls */}
      <div className={styles.controlsColumn}>
        <div className={styles.columnHeader}>
          <h2>Local NPU Controls</h2>
        </div>

        {/* Tab switcher for Image vs Video Mode */}
        <div style={{ display: 'flex', backgroundColor: '#080810', borderRadius: '8px', padding: '3px', border: '1px solid #1c1d2e', marginBottom: '16px' }}>
          <button
            style={{ flex: 1, border: 'none', padding: '6px', borderRadius: '6px', background: studioMode === 'image' ? '#831843' : 'transparent', color: studioMode === 'image' ? '#ffffff' : '#64748b', fontSize: '0.72rem', cursor: 'pointer' }}
            onClick={() => { setStudioMode('image'); setGeneratedFilePath(null); }}
            disabled={isGenerating}
          >
            Sketch-to-Image
          </button>
          <button
            style={{ flex: 1, border: 'none', padding: '6px', borderRadius: '6px', background: studioMode === 'video' ? '#831843' : 'transparent', color: studioMode === 'video' ? '#ffffff' : '#64748b', fontSize: '0.72rem', cursor: 'pointer' }}
            onClick={() => { setStudioMode('video'); setGeneratedFilePath(null); }}
            disabled={isGenerating}
          >
            Text-to-Video
          </button>
        </div>

        <div className={styles.controlGroup}>
          <label className={styles.controlLabel}>AI Prompt</label>
          <textarea
            className={styles.promptTextarea}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={studioMode === 'image' ? "Describe what you want the local NPU to generate from your sketch..." : "Describe the video clip details you want the text-to-video AI compiler to synthesize..."}
            disabled={isGenerating}
          />
        </div>

        <div className={styles.controlGroup}>
          <label className={styles.controlLabel}>
            AI Influence / Creativity: <span>{Math.round(strength * 100)}%</span>
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={strength}
            onChange={(e) => setStrength(parseFloat(e.target.value))}
            className={styles.influenceSlider}
            disabled={isGenerating}
          />
          <div className={styles.sliderLabels}>
            <span>Strict (Match Sketch)</span>
            <span>Creative (NPU Freedom)</span>
          </div>
        </div>

        <button
          className={`${styles.generateButton} ${isGenerating ? styles.generating : ''}`}
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <div className={styles.spinner} />
              Generating on Local NPU...
            </>
          ) : (
            'Generate with Local NPU'
          )}
        </button>

        {/* Status / Output Section */}
        {isGenerating && (
          <div className={styles.statusBox}>
            <div className={styles.progressBar}>
              <div className={styles.progressBarFill} />
            </div>
            <p className={styles.statusText}>{statusMessage}</p>
          </div>
        )}

        {errorText && (
          <div className={styles.errorBox}>
            <span className={styles.errorIcon}>⚠</span>
            <p className={styles.errorText}>{errorText}</p>
          </div>
        )}

        {generatedFilePath && !isGenerating && (
          <div className={styles.outputBox}>
            <h3>Generated AI Asset</h3>
            <div className={styles.previewContainer}>
              {generatedFilePath.toLowerCase().match(/\.(mp4|webm|mkv|mov|avi)$/) ? (
                <video
                  src={convertFileSrc(generatedFilePath)}
                  controls
                  className={styles.previewImage}
                  style={{ width: '100%', borderRadius: '8px', maxHeight: '180px', backgroundColor: '#030307' }}
                />
              ) : (
                <img
                  src={convertFileSrc(generatedFilePath)}
                  alt="AI Output Preview"
                  className={styles.previewImage}
                />
              )}
            </div>
            <button className={styles.timelineButton} onClick={handleSendToTimeline}>
              Send to Timeline
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
