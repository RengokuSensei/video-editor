import { useState, useEffect } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import MainPlayer from '../MainPlayer/MainPlayer';
import styles from './ColorGradingView.module.css';

interface ColorGradingViewProps {
  selectedVideo: { full: string; alt: string } | null;
  engine: any;
}

export default function ColorGradingView({ selectedVideo, engine }: ColorGradingViewProps) {
  const [activeTab, setActiveTab] = useState<'luts' | 'wheels' | 'sliders' | 'curves'>('luts');
  const [selectedLut, setSelectedLut] = useState<string>('None');
  
  // Sliders state
  const [exposure, setExposure] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [temperature, setTemperature] = useState(0);
  const [tint, setTint] = useState(0);
  const [vignette, setVignette] = useState(0);

  // Wheels state
  const [liftOffset, setLiftOffset] = useState({ x: 0, y: 0 });
  const [gammaOffset, setGammaOffset] = useState({ x: -10, y: -5 });
  const [gainOffset, setGainOffset] = useState({ x: 10, y: 5 });

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const isLocalPath = (path: string) => {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return false;
    }
    return path.includes(':\\') || path.includes(':/') || path.startsWith('\\\\');
  };

  const activeUrl = selectedVideo 
    ? (isLocalPath(selectedVideo.full) ? convertFileSrc(selectedVideo.full) : selectedVideo.full) 
    : null;

  // Apply adjustments to CreativeEngine
  useEffect(() => {
    if (!engine) return;
    try {
      const adjustments = engine.block.findByType('ly.img.block');
      for (const block of adjustments) {
        if (engine.block.getType(block) === 'ly.img.video' || engine.block.getType(block) === 'ly.img.image') {
          // Adjust properties based on sliders & color wheels offsets
          engine.block.setFloat(block, 'adjustments/brightness', exposure / 100);
          engine.block.setFloat(block, 'adjustments/contrast', contrast / 100);
          engine.block.setFloat(block, 'adjustments/saturation', (saturation + 100) / 100);
          engine.block.setFloat(block, 'adjustments/vignette', vignette / 100);

          if (engine.block.hasProperty(block, 'adjustments/temperature')) {
            engine.block.setFloat(block, 'adjustments/temperature', temperature / 100);
          }
          if (engine.block.hasProperty(block, 'adjustments/tint')) {
            engine.block.setFloat(block, 'adjustments/tint', tint / 100);
          }

          engine.block.setFloat(block, 'adjustments/shadows', (liftOffset.x + liftOffset.y) / 100);
          engine.block.setFloat(block, 'adjustments/midtones', (gammaOffset.x + gammaOffset.y) / 100);
          engine.block.setFloat(block, 'adjustments/highlights', (gainOffset.x + gainOffset.y) / 100);
        }
      }
    } catch (e) {
      console.warn("Failed to set engine adjustments directly (fallback applied):", e);
    }
  }, [exposure, contrast, saturation, vignette, temperature, tint, liftOffset, gammaOffset, gainOffset, engine]);

  // CSS Filter and Color Overlays for Instant Visual Color Grading Feedback
  const filterStyle = {
    filter: `brightness(${100 + exposure}%) contrast(${100 + contrast}%) saturate(${100 + saturation}%) sepia(${vignette / 2}%) hue-rotate(${tint / 5}deg)`
  };

  const overlayStyle = {
    backgroundColor: `rgba(${128 + gainOffset.x * 2.5}, ${128 + gammaOffset.y * 2.5}, ${128 + liftOffset.x * 2.5}, 0.15)`,
    mixBlendMode: 'soft-light' as any,
    pointerEvents: 'none' as any,
    position: 'absolute' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: '8px',
    zIndex: 10
  };

  const handleLutSelect = (lutName: string) => {
    setSelectedLut(lutName);
    if (!engine) return;
    
    // Simulate LUT grading in console/engine
    console.log(`Applying LUT template: ${lutName}`);
    
    // Customize adjustments depending on LUT
    if (lutName === 'Teal & Orange') {
      setExposure(5);
      setContrast(20);
      setSaturation(15);
      setTemperature(-10);
      setTint(10);
    } else if (lutName === 'Golden Hour') {
      setExposure(10);
      setContrast(10);
      setSaturation(25);
      setTemperature(30);
      setTint(-5);
    } else if (lutName === 'Noir') {
      setExposure(-10);
      setContrast(35);
      setSaturation(-100);
      setTemperature(0);
      setTint(0);
    } else if (lutName === 'Cyberpunk') {
      setExposure(0);
      setContrast(15);
      setSaturation(40);
      setTemperature(-25);
      setTint(35);
    } else {
      // None / Reset
      setExposure(0);
      setContrast(0);
      setSaturation(0);
      setTemperature(0);
      setTint(0);
      setVignette(0);
      setLiftOffset({ x: 0, y: 0 });
      setGammaOffset({ x: 0, y: 0 });
      setGainOffset({ x: 0, y: 0 });
    }
  };

  const handleWheelMouseDown = (e: React.MouseEvent<HTMLDivElement>, wheelType: 'lift' | 'gamma' | 'gain') => {
    const wheelElement = e.currentTarget;
    const rect = wheelElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (moveEvent.buttons === 0) {
        handleMouseUp();
        return;
      }
      const dx = moveEvent.clientX - centerX;
      const dy = moveEvent.clientY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const capDist = Math.min(50, dist);
      const angle = Math.atan2(dy, dx);
      const finalX = Math.round(capDist * Math.cos(angle));
      const finalY = Math.round(capDist * Math.sin(angle));

      if (wheelType === 'lift') {
        setLiftOffset({ x: finalX, y: finalY });
      } else if (wheelType === 'gamma') {
        setGammaOffset({ x: finalX, y: finalY });
      } else if (wheelType === 'gain') {
        setGainOffset({ x: finalX, y: finalY });
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // Initial click placement
    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const capDist = Math.min(50, dist);
    const angle = Math.atan2(dy, dx);
    const finalX = Math.round(capDist * Math.cos(angle));
    const finalY = Math.round(capDist * Math.sin(angle));
    if (wheelType === 'lift') {
      setLiftOffset({ x: finalX, y: finalY });
    } else if (wheelType === 'gamma') {
      setGammaOffset({ x: finalX, y: finalY });
    } else if (wheelType === 'gain') {
      setGainOffset({ x: finalX, y: finalY });
    }
  };

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
        if (prev >= 150) return 0; // reset at 5s
        return prev + 1;
      });
    }, 1000 / 30);
    return () => clearInterval(interval);
  }, [isPlaying]);

  return (
    <div className={styles.container}>
      {/* Left: Video Preview */}
      <div className={styles.previewPanel}>
        <div className={styles.playerWrapper} style={filterStyle}>
          {selectedVideo ? (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              <MainPlayer activeUrl={activeUrl} onEngineInit={() => {}} />
              {/* Lift/Gamma/Gain overlay simulation */}
              <div style={overlayStyle} />
            </div>
          ) : (
            <div className={styles.emptyPlayer}>
              <span>Select a video from the Editor's library to start grading</span>
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

      {/* Right: Color Inspector */}
      <div className={styles.inspectorPanel}>
        <div className={styles.inspectorHeader}>
          <h3>Color Grading Inspector</h3>
          <div className={styles.tabButtons}>
            <button 
              className={`${styles.tabBtn} ${activeTab === 'luts' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('luts')}
            >
              LUTs
            </button>
            <button 
              className={`${styles.tabBtn} ${activeTab === 'wheels' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('wheels')}
            >
              Wheels
            </button>
            <button 
              className={`${styles.tabBtn} ${activeTab === 'sliders' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('sliders')}
            >
              Sliders
            </button>
            <button 
              className={`${styles.tabBtn} ${activeTab === 'curves' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('curves')}
            >
              Curves
            </button>
          </div>
        </div>

        <div className={styles.inspectorContent}>
          {activeTab === 'luts' && (
            <div className={styles.lutGrid}>
              {[
                { name: 'None', desc: 'No grading applied', color: '#1e293b' },
                { name: 'Teal & Orange', desc: 'Hollywood cinematic look', color: '#0f766e' },
                { name: 'Golden Hour', desc: 'Warm sunset glowing tone', color: '#c2410c' },
                { name: 'Noir', desc: 'Dramatic high-contrast black & white', color: '#4b5563' },
                { name: 'Cyberpunk', desc: 'Stylized neon pink & blue tint', color: '#701a75' }
              ].map(lut => (
                <div 
                  key={lut.name} 
                  className={`${styles.lutCard} ${selectedLut === lut.name ? styles.activeCard : ''}`}
                  onClick={() => handleLutSelect(lut.name)}
                >
                  <div className={styles.lutPreview} style={{ backgroundColor: lut.color }} />
                  <div className={styles.lutInfo}>
                    <div className={styles.lutName}>{lut.name}</div>
                    <div className={styles.lutDesc}>{lut.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'wheels' && (
            <div className={styles.wheelsContainer}>
              <div className={styles.wheelWrapper}>
                <div className={styles.wheelOuter}>
                  <div className={styles.wheelInner} onMouseDown={(e) => handleWheelMouseDown(e, 'lift')}>
                    <div className={styles.wheelCrosshair} style={{ left: `${50 + (liftOffset.x / 50) * 50}%`, top: `${50 + (liftOffset.y / 50) * 50}%` }} />
                  </div>
                </div>
                <span className={styles.wheelLabel}>Lift (Shadows: {liftOffset.x}, {liftOffset.y})</span>
              </div>

              <div className={styles.wheelWrapper}>
                <div className={styles.wheelOuter} style={{ borderImageSource: 'linear-gradient(to right, #ec4899, #8b5cf6)' }}>
                  <div className={styles.wheelInner} onMouseDown={(e) => handleWheelMouseDown(e, 'gamma')}>
                    <div className={styles.wheelCrosshair} style={{ left: `${50 + (gammaOffset.x / 50) * 50}%`, top: `${50 + (gammaOffset.y / 50) * 50}%` }} />
                  </div>
                </div>
                <span className={styles.wheelLabel}>Gamma (Midtones: {gammaOffset.x}, {gammaOffset.y})</span>
              </div>

              <div className={styles.wheelWrapper}>
                <div className={styles.wheelOuter}>
                  <div className={styles.wheelInner} onMouseDown={(e) => handleWheelMouseDown(e, 'gain')}>
                    <div className={styles.wheelCrosshair} style={{ left: `${50 + (gainOffset.x / 50) * 50}%`, top: `${50 + (gainOffset.y / 50) * 50}%` }} />
                  </div>
                </div>
                <span className={styles.wheelLabel}>Gain (Highlights: {gainOffset.x}, {gainOffset.y})</span>
              </div>
            </div>
          )}

          {activeTab === 'sliders' && (
            <div className={styles.slidersContainer}>
              <div className={styles.sliderRow}>
                <label>Exposure (Brightness)</label>
                <div className={styles.sliderControl}>
                  <input type="range" min="-100" max="100" value={exposure} onChange={e => setExposure(parseInt(e.target.value))} />
                  <span>{exposure > 0 ? `+${exposure}` : exposure}</span>
                </div>
              </div>

              <div className={styles.sliderRow}>
                <label>Contrast</label>
                <div className={styles.sliderControl}>
                  <input type="range" min="-100" max="100" value={contrast} onChange={e => setContrast(parseInt(e.target.value))} />
                  <span>{contrast > 0 ? `+${contrast}` : contrast}</span>
                </div>
              </div>

              <div className={styles.sliderRow}>
                <label>Saturation</label>
                <div className={styles.sliderControl}>
                  <input type="range" min="-100" max="100" value={saturation} onChange={e => setSaturation(parseInt(e.target.value))} />
                  <span>{saturation > 0 ? `+${saturation}` : saturation}</span>
                </div>
              </div>

              <div className={styles.sliderRow}>
                <label>Temperature (Kelvin)</label>
                <div className={styles.sliderControl}>
                  <input type="range" min="-100" max="100" value={temperature} onChange={e => setTemperature(parseInt(e.target.value))} />
                  <span style={{ color: temperature > 0 ? '#fb923c' : '#60a5fa' }}>
                    {temperature > 0 ? `+${temperature}K` : `${temperature}K`}
                  </span>
                </div>
              </div>

              <div className={styles.sliderRow}>
                <label>Tint (Green / Magenta)</label>
                <div className={styles.sliderControl}>
                  <input type="range" min="-100" max="100" value={tint} onChange={e => setTint(parseInt(e.target.value))} />
                  <span>{tint > 0 ? `+${tint}` : tint}</span>
                </div>
              </div>

              <div className={styles.sliderRow}>
                <label>Vignette Strength</label>
                <div className={styles.sliderControl}>
                  <input type="range" min="0" max="100" value={vignette} onChange={e => setVignette(parseInt(e.target.value))} />
                  <span>{vignette}%</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'curves' && (
            <div className={styles.curvesContainer}>
              <div className={styles.curvesHeader}>
                <span className={styles.activeCurveType}>RGB Mix</span>
                <span>Red</span>
                <span>Green</span>
                <span>Blue</span>
              </div>
              <div className={styles.curvesEditor}>
                <svg viewBox="0 0 100 100" className={styles.curvesSvg}>
                  {/* Grid Lines */}
                  <line x1="25" y1="0" x2="25" y2="100" stroke="#1c1d2e" strokeWidth="0.5" />
                  <line x1="50" y1="0" x2="50" y2="100" stroke="#1c1d2e" strokeWidth="0.5" />
                  <line x1="75" y1="0" x2="75" y2="100" stroke="#1c1d2e" strokeWidth="0.5" />
                  <line x1="0" y1="25" x2="100" y2="25" stroke="#1c1d2e" strokeWidth="0.5" />
                  <line x1="0" y1="50" x2="100" y2="50" stroke="#1c1d2e" strokeWidth="0.5" />
                  <line x1="0" y1="75" x2="100" y2="75" stroke="#1c1d2e" strokeWidth="0.5" />
                  
                  {/* Diagonal Reference */}
                  <line x1="0" y1="100" x2="100" y2="0" stroke="#475569" strokeWidth="0.75" strokeDasharray="2" />
                  
                  {/* Curve Path */}
                  <path d="M 0 100 Q 35 85 50 50 T 100 0" fill="none" stroke="#8b5cf6" strokeWidth="2" />
                  
                  {/* Control Points */}
                  <circle cx="50" cy="50" r="3" fill="#ffffff" stroke="#8b5cf6" strokeWidth="1" />
                  <circle cx="25" cy="73" r="2" fill="#ffffff" stroke="#8b5cf6" strokeWidth="1" />
                  <circle cx="75" cy="27" r="2" fill="#ffffff" stroke="#8b5cf6" strokeWidth="1" />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
