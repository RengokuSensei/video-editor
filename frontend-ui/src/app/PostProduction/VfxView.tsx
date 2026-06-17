import { useState, useEffect } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import MainPlayer from '../MainPlayer/MainPlayer';
import styles from './VfxView.module.css';

interface VfxViewProps {
  selectedVideo: { full: string; alt: string } | null;
  engine: any;
}

export default function VfxView({ selectedVideo, engine }: VfxViewProps) {
  const [activeTab, setActiveTab] = useState<'effects' | 'keyframes' | 'transitions'>('effects');
  
  // Effects states
  const [blurActive, setBlurActive] = useState(false);
  const [chromaActive, setChromaActive] = useState(false);
  const [glowActive, setGlowActive] = useState(false);
  const [vignetteActive, setVignetteActive] = useState(false);
  
  // Slider values
  const [blurVal, setBlurVal] = useState(30);
  const [glowVal, setGlowVal] = useState(50);
  const [chromaTolerance, setChromaTolerance] = useState(25);
  
  // Keyframes timeline simulator
  const [keyframes, setKeyframes] = useState<{ frame: number; property: string }[]>([
    { frame: 0, property: 'scale' },
    { frame: 60, property: 'scale' },
    { frame: 120, property: 'opacity' }
  ]);
  const [selectedProperty, setSelectedProperty] = useState<string>('scale');
  
  // Bezier curve states
  const [cp1, setCp1] = useState({ x: 35, y: 35 });
  const [cp2, setCp2] = useState({ x: 65, y: 5 });

  // Transition state
  const [selectedTransition, setSelectedTransition] = useState<string>('Cross Dissolve');
  const [transitionDuration, setTransitionDuration] = useState(30); // 1 sec (30 frames)

  const handleDragCp = (e: React.MouseEvent<SVGCircleElement>, point: 1 | 2) => {
    e.preventDefault();
    const svgElement = e.currentTarget.ownerSVGElement;
    if (!svgElement) return;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (moveEvent.buttons === 0) {
        handleMouseUp();
        return;
      }
      const rect = svgElement.getBoundingClientRect();
      const x = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      const y = ((moveEvent.clientY - rect.top) / rect.height) * 40;

      const finalX = Math.max(0, Math.min(100, x));
      const finalY = Math.max(0, Math.min(40, y));

      if (point === 1) {
        setCp1({ x: finalX, y: finalY });
      } else {
        setCp2({ x: finalX, y: finalY });
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleDragKeyframe = (e: React.MouseEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    const trackElement = e.currentTarget.parentElement;
    if (!trackElement) return;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (moveEvent.buttons === 0) {
        handleMouseUp();
        return;
      }
      const rect = trackElement.getBoundingClientRect();
      const dropX = moveEvent.clientX - rect.left;
      const frame = Math.max(0, Math.min(150, Math.round((dropX / rect.width) * 150)));

      setKeyframes(prev => {
        const copy = [...prev];
        copy[index] = { ...copy[index], frame };
        return copy.sort((a, b) => a.frame - b.frame);
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

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

  const addKeyframe = () => {
    // Avoid duplicates on the same frame and property
    if (keyframes.some(k => k.frame === currentTime && k.property === selectedProperty)) return;
    
    setKeyframes(prev => [...prev, { frame: currentTime, property: selectedProperty }].sort((a, b) => a.frame - b.frame));
    console.log(`Added keyframe for '${selectedProperty}' at frame ${currentTime}`);
  };

  const clearKeyframes = () => {
    setKeyframes([]);
  };

  // Simulate active transition opacity/transformations based on playback frame
  let transitionStyle: React.CSSProperties = {};
  let transitionOverlay: React.ReactNode = null;

  if (currentTime < transitionDuration) {
    const progress = currentTime / transitionDuration;
    if (selectedTransition === 'Cross Dissolve') {
      transitionStyle = { opacity: progress };
    } else if (selectedTransition === 'Fade to Black') {
      transitionOverlay = (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: '#000000',
          opacity: 1 - progress,
          zIndex: 8,
          pointerEvents: 'none'
        }} />
      );
    } else if (selectedTransition === 'Zoom In') {
      transitionStyle = { transform: `scale(${0.8 + 0.2 * progress})` };
    } else if (selectedTransition === 'Slide Up') {
      transitionStyle = { transform: `translateY(${(1 - progress) * 100}px)` };
    }
  }

  return (
    <div className={styles.container}>
      {/* Left: Video Preview */}
      <div className={styles.previewPanel}>
        <div className={styles.playerWrapper}>
          {selectedVideo ? (
            <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', ...transitionStyle }}>
              <MainPlayer activeUrl={activeUrl} onEngineInit={() => {}} />
              {/* Transition Overlays */}
              {transitionOverlay}
              {/* Vignette Overlay */}
              {vignetteActive && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  pointerEvents: 'none',
                  boxShadow: 'inset 0 0 100px rgba(0, 0, 0, 0.8)',
                  zIndex: 6
                }} />
              )}
            </div>
          ) : (
            <div className={styles.emptyPlayer}>
              <span>Select a video from the Editor's library to start compositing</span>
            </div>
          )}
          
          {/* Overlay simulation filters */}
          {blurActive && <div className={styles.blurOverlay} style={{ backdropFilter: `blur(${blurVal / 5}px)`, WebkitBackdropFilter: `blur(${blurVal / 5}px)` }} />}
          {glowActive && <div className={styles.glowOverlay} style={{ opacity: glowVal / 100 }} />}
          {chromaActive && <div className={styles.chromaOverlay} />}
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

      {/* Right: VFX Panel */}
      <div className={styles.inspectorPanel}>
        <div className={styles.inspectorHeader}>
          <h3>Fusion VFX & Motion Graphics</h3>
          <div className={styles.tabButtons}>
            <button 
              className={`${styles.tabBtn} ${activeTab === 'effects' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('effects')}
            >
              Effects Stack
            </button>
            <button 
              className={`${styles.tabBtn} ${activeTab === 'keyframes' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('keyframes')}
            >
              Keyframes
            </button>
            <button 
              className={`${styles.tabBtn} ${activeTab === 'transitions' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('transitions')}
            >
              Transitions
            </button>
          </div>
        </div>

        <div className={styles.inspectorContent}>
          {activeTab === 'effects' && (
            <div className={styles.effectsStack}>
              {/* Effect: Gaussian Blur */}
              <div className={`${styles.effectCard} ${blurActive ? styles.effectCardActive : ''}`}>
                <div className={styles.effectHeader}>
                  <label className={styles.checkboxLabel}>
                    <input type="checkbox" checked={blurActive} onChange={e => setBlurActive(e.target.checked)} />
                    <span className={styles.effectTitle}>Gaussian Blur</span>
                  </label>
                </div>
                {blurActive && (
                  <div className={styles.effectParams}>
                    <div className={styles.paramRow}>
                      <span>Radius</span>
                      <input type="range" min="0" max="100" value={blurVal} onChange={e => setBlurVal(parseInt(e.target.value))} />
                      <span className={styles.paramVal}>{blurVal}px</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Effect: Green Screen Chroma Key */}
              <div className={`${styles.effectCard} ${chromaActive ? styles.effectCardActive : ''}`}>
                <div className={styles.effectHeader}>
                  <label className={styles.checkboxLabel}>
                    <input type="checkbox" checked={chromaActive} onChange={e => setChromaActive(e.target.checked)} />
                    <span className={styles.effectTitle}>Chroma Key (Green Screen)</span>
                  </label>
                </div>
                {chromaActive && (
                  <div className={styles.effectParams}>
                    <div className={styles.paramRow}>
                      <span>Tolerance</span>
                      <input type="range" min="5" max="80" value={chromaTolerance} onChange={e => setChromaTolerance(parseInt(e.target.value))} />
                      <span className={styles.paramVal}>{chromaTolerance}%</span>
                    </div>
                    <div className={styles.colorPickerRow}>
                      <span>Target Color</span>
                      <div className={styles.colorSwatch} style={{ backgroundColor: '#10b981' }} />
                      <span className={styles.colorLabel}>Pure Green</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Effect: Glow Bloom */}
              <div className={`${styles.effectCard} ${glowActive ? styles.effectCardActive : ''}`}>
                <div className={styles.effectHeader}>
                  <label className={styles.checkboxLabel}>
                    <input type="checkbox" checked={glowActive} onChange={e => setGlowActive(e.target.checked)} />
                    <span className={styles.effectTitle}>Glow / Bloom</span>
                  </label>
                </div>
                {glowActive && (
                  <div className={styles.effectParams}>
                    <div className={styles.paramRow}>
                      <span>Intensity</span>
                      <input type="range" min="0" max="100" value={glowVal} onChange={e => setGlowVal(parseInt(e.target.value))} />
                      <span className={styles.paramVal}>{glowVal}%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Effect: Radial Vignette */}
              <div className={`${styles.effectCard} ${vignetteActive ? styles.effectCardActive : ''}`}>
                <div className={styles.effectHeader}>
                  <label className={styles.checkboxLabel}>
                    <input type="checkbox" checked={vignetteActive} onChange={e => setVignetteActive(e.target.checked)} />
                    <span className={styles.effectTitle}>Vignette Frame Overlay</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'keyframes' && (
            <div className={styles.keyframesContainer}>
              <div className={styles.keyframeActionPanel}>
                <div className={styles.selectWrapper}>
                  <label>Property</label>
                  <select 
                    value={selectedProperty} 
                    onChange={e => setSelectedProperty(e.target.value)}
                    className={styles.dropdown}
                  >
                    <option value="scale">Scale Factor</option>
                    <option value="opacity">Opacity Alpha</option>
                    <option value="positionX">Position X Offset</option>
                    <option value="positionY">Position Y Offset</option>
                    <option value="rotation">Z-Rotation angle</option>
                  </select>
                </div>
                <div className={styles.kfBtns}>
                  <button className={styles.addKfBtn} onClick={addKeyframe}>
                    <span>◆</span> Add Keyframe
                  </button>
                  <button className={styles.clearKfBtn} onClick={clearKeyframes}>
                    Clear All
                  </button>
                </div>
              </div>

              <div className={styles.keyframesTrackContainer}>
                <div className={styles.trackLabelHeader}>
                  <span>Timeline Keyframes</span>
                  <span className={styles.kfFrameLabel}>Frame: {currentTime}</span>
                </div>
                
                <div className={styles.kfTimelineTrack}>
                  {/* Progress Head */}
                  <div 
                    className={styles.kfPlayheadLine} 
                    style={{ left: `${(currentTime / 150) * 100}%` }}
                  />
                  
                  {/* Render Diamond markers */}
                  {keyframes.map((kf, i) => (
                    <div
                      key={i}
                      className={`${styles.kfMarker} ${kf.property === selectedProperty ? styles.activeKfMarker : ''}`}
                      style={{ left: `${(kf.frame / 150) * 100}%` }}
                      title={`Keyframe: ${kf.property} at Frame ${kf.frame} (Drag to adjust)`}
                      onMouseDown={(e) => handleDragKeyframe(e, i)}
                    />
                  ))}
                </div>
                <div className={styles.kfTimeTicks}>
                  <span>F0</span>
                  <span>F30 (1s)</span>
                  <span>F60 (2s)</span>
                  <span>F90 (3s)</span>
                  <span>F120 (4s)</span>
                  <span>F150</span>
                </div>
              </div>

              <div className={styles.keyframeDetails}>
                <div className={styles.detailsTitle}>Interpolation Curve</div>
                <div className={styles.curvesPreviewBox}>
                  <svg viewBox="0 0 100 40" className={styles.curvesPreviewSvg}>
                    <path d={`M 5 35 C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} 95 5`} fill="none" stroke="#db2777" strokeWidth="2" />
                    <line x1="5" y1="35" x2={cp1.x} y2={cp1.y} stroke="#64748b" strokeWidth="0.5" strokeDasharray="1 1" />
                    <line x1="95" y1="5" x2={cp2.x} y2={cp2.y} stroke="#64748b" strokeWidth="0.5" strokeDasharray="1 1" />
                    <circle cx={cp1.x} cy={cp1.y} r="3" fill="#db2777" style={{ cursor: 'pointer' }} onMouseDown={(e) => handleDragCp(e, 1)} />
                    <circle cx={cp2.x} cy={cp2.y} r="3" fill="#db2777" style={{ cursor: 'pointer' }} onMouseDown={(e) => handleDragCp(e, 2)} />
                    <circle cx="5" cy="35" r="2" fill="#ffffff" stroke="#db2777" />
                    <circle cx="95" cy="5" r="2" fill="#ffffff" stroke="#db2777" />
                  </svg>
                  <span>Ease In / Ease Out (Bezier)</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'transitions' && (
            <div className={styles.transitionsContainer}>
              <div className={styles.transitionsGrid}>
                {[
                  { name: 'Cross Dissolve', desc: 'Smooth dissolve blend overlay', icon: '░' },
                  { name: 'Fade to Black', desc: 'Fade video track to black out', icon: '■' },
                  { name: 'Wipe Right', desc: 'Horizontally wipe transition', icon: '▶' },
                  { name: 'Slide Up', desc: 'Slide overlay upwards transition', icon: '▲' },
                  { name: 'Zoom In', desc: 'Smooth zoom scaling overlap transition', icon: '🔍' }
                ].map(trans => (
                  <div 
                    key={trans.name}
                    className={`${styles.transitionCard} ${selectedTransition === trans.name ? styles.activeTransitionCard : ''}`}
                    onClick={() => setSelectedTransition(trans.name)}
                  >
                    <div className={styles.transitionIcon}>{trans.icon}</div>
                    <div className={styles.transitionInfo}>
                      <div className={styles.transitionName}>{trans.name}</div>
                      <div className={styles.transitionDesc}>{trans.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.transitionDurationBox}>
                <div className={styles.durationLabelRow}>
                  <span>Transition Duration</span>
                  <span>{transitionDuration} frames ({(transitionDuration / 30).toFixed(1)}s)</span>
                </div>
                <input 
                  type="range" 
                  min="5" 
                  max="90" 
                  value={transitionDuration} 
                  onChange={e => setTransitionDuration(parseInt(e.target.value))} 
                  className={styles.durationScrubber}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
