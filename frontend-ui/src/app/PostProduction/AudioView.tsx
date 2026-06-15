import { useState, useEffect } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import MainPlayer from '../MainPlayer/MainPlayer';
import styles from './AudioView.module.css';

interface AudioViewProps {
  selectedVideo: { full: string; alt: string } | null;
  engine: any;
}

export default function AudioView({ selectedVideo, engine }: AudioViewProps) {
  // Mixer states
  const [track0Volume, setTrack0Volume] = useState(-5);
  const [track1Volume, setTrack1Volume] = useState(-10);
  const [track2Volume, setTrack2Volume] = useState(-15);
  const [masterVolume, setMasterVolume] = useState(-3);



  const [mutes, setMutes] = useState<boolean[]>([false, false, false, false]);
  const [solos, setSolos] = useState<boolean[]>([false, false, false, false]);

  // Live DB levels for animations
  const [dbLevels, setDbLevels] = useState<number[]>([5, 5, 5, 5]);

  // Voiceover generator states
  const [voiceText, setVoiceText] = useState('');
  const [voiceActor, setVoiceActor] = useState('narrator_cinematic');
  const [isGeneratingVo, setIsGeneratingVo] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; message: string }[]>([]);

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

  // DB meter animation ticker effect
  useEffect(() => {
    if (!isPlaying) {
      setDbLevels([5, 5, 5, 5]);
      return;
    }
    const interval = setInterval(() => {
      setDbLevels([
        mutes[0] ? 0 : Math.max(5, Math.floor(45 + Math.random() * 25 + track0Volume)),
        mutes[1] ? 0 : Math.max(5, Math.floor(35 + Math.random() * 20 + track1Volume)),
        mutes[2] ? 0 : Math.max(5, Math.floor(30 + Math.random() * 15 + track2Volume)),
        mutes[3] ? 0 : Math.max(5, Math.floor(40 + Math.random() * 20 + masterVolume)),
      ]);
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying, mutes, track0Volume, track1Volume, track2Volume, masterVolume]);

  const changeVolume = async (track: number, gain: number) => {
    if (track === 0) setTrack0Volume(gain);
    if (track === 1) setTrack1Volume(gain);
    if (track === 2) setTrack2Volume(gain);
    if (track === 3) setMasterVolume(gain);
    try {
      await invoke('set_track_volume', { trackIndex: track, gain });
    } catch (e) {
      console.warn("Failed to set track volume on backend:", e);
    }
  };

  const toggleMute = async (index: number) => {
    const nextMutes = [...mutes];
    nextMutes[index] = !nextMutes[index];
    setMutes(nextMutes);
    try {
      await invoke('set_track_mute_solo', { trackIndex: index, mute: nextMutes[index], solo: solos[index] });
    } catch (e) {
      console.warn("Failed to set mute/solo on backend:", e);
    }
  };

  const toggleSolo = async (index: number) => {
    const nextSolos = [...solos];
    nextSolos[index] = !nextSolos[index];
    setSolos(nextSolos);
    try {
      await invoke('set_track_mute_solo', { trackIndex: index, mute: mutes[index], solo: nextSolos[index] });
    } catch (e) {
      console.warn("Failed to set mute/solo on backend:", e);
    }
  };

  const handleGenerateVoiceover = () => {
    if (!voiceText.trim()) return;
    
    setIsGeneratingVo(true);
    setTimeout(() => {
      setIsGeneratingVo(false);
      setVoiceText('');
      addToast(`Fairlight: AI Voiceover added successfully to Track 2!`);
    }, 2000);
  };

  const addToast = (message: string) => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  return (
    <div className={styles.container}>
      {/* Toast Notification Layer */}
      <div className={styles.toastContainer}>
        {toasts.map((toast) => (
          <div key={toast.id} className={styles.toast}>
            <span>✓</span> {toast.message}
          </div>
        ))}
      </div>

      {/* Left: Video Preview */}
      <div className={styles.previewPanel}>
        <div className={styles.playerWrapper}>
          {selectedVideo ? (
            <MainPlayer activeUrl={activeUrl} onEngineInit={() => {}} />
          ) : (
            <div className={styles.emptyPlayer}>
              <span>Select a video from the Editor's library to start audio mixing</span>
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

      {/* Right: Audio Fairlight Inspector */}
      <div className={styles.inspectorPanel}>
        <div className={styles.inspectorHeader}>
          <h3>Fairlight Audio post-production</h3>
        </div>

        <div className={styles.inspectorContent}>
          {/* Channel Faders Mixer */}
          <div className={styles.mixerSection}>
            <h4 className={styles.sectionTitle}>Multi-Channel Track Mixer</h4>
            
            <div className={styles.mixerGrid}>
              {/* Channel 1: Track 0 */}
              <div className={styles.mixerTrack}>
                <div className={styles.dbMeterContainer}>
                  <div className={styles.dbMeterFill} style={{ height: `${dbLevels[0]}%` }} />
                </div>
                <input 
                  type="range" 
                  min="-60" 
                  max="6" 
                  value={track0Volume} 
                  onChange={e => changeVolume(0, parseInt(e.target.value))}
                  className={styles.faderScrubber}
                />
                <div className={styles.channelLabel}>Track 0</div>
                <div className={styles.dbLabel}>{track0Volume > 0 ? `+${track0Volume}` : track0Volume}dB</div>
                <div className={styles.trackActions}>
                  <button className={`${styles.actionBtn} ${mutes[0] ? styles.activeMute : ''}`} onClick={() => toggleMute(0)}>M</button>
                  <button className={`${styles.actionBtn} ${solos[0] ? styles.activeSolo : ''}`} onClick={() => toggleSolo(0)}>S</button>
                </div>
              </div>

              {/* Channel 2: Track 1 */}
              <div className={styles.mixerTrack}>
                <div className={styles.dbMeterContainer}>
                  <div className={styles.dbMeterFill} style={{ height: `${dbLevels[1]}%` }} />
                </div>
                <input 
                  type="range" 
                  min="-60" 
                  max="6" 
                  value={track1Volume} 
                  onChange={e => changeVolume(1, parseInt(e.target.value))}
                  className={styles.faderScrubber}
                />
                <div className={styles.channelLabel}>Track 1</div>
                <div className={styles.dbLabel}>{track1Volume > 0 ? `+${track1Volume}` : track1Volume}dB</div>
                <div className={styles.trackActions}>
                  <button className={`${styles.actionBtn} ${mutes[1] ? styles.activeMute : ''}`} onClick={() => toggleMute(1)}>M</button>
                  <button className={`${styles.actionBtn} ${solos[1] ? styles.activeSolo : ''}`} onClick={() => toggleSolo(1)}>S</button>
                </div>
              </div>

              {/* Channel 3: Track 2 */}
              <div className={styles.mixerTrack}>
                <div className={styles.dbMeterContainer}>
                  <div className={styles.dbMeterFill} style={{ height: `${dbLevels[2]}%` }} />
                </div>
                <input 
                  type="range" 
                  min="-60" 
                  max="6" 
                  value={track2Volume} 
                  onChange={e => changeVolume(2, parseInt(e.target.value))}
                  className={styles.faderScrubber}
                />
                <div className={styles.channelLabel}>Track 2</div>
                <div className={styles.dbLabel}>{track2Volume > 0 ? `+${track2Volume}` : track2Volume}dB</div>
                <div className={styles.trackActions}>
                  <button className={`${styles.actionBtn} ${mutes[2] ? styles.activeMute : ''}`} onClick={() => toggleMute(2)}>M</button>
                  <button className={`${styles.actionBtn} ${solos[2] ? styles.activeSolo : ''}`} onClick={() => toggleSolo(2)}>S</button>
                </div>
              </div>

              {/* Master Volume */}
              <div className={`${styles.mixerTrack} ${styles.masterTrack}`}>
                <div className={styles.dbMeterContainer} style={{ background: '#090d16' }}>
                  <div 
                    className={styles.dbMeterFill} 
                    style={{ 
                      height: `${dbLevels[3]}%`,
                      background: 'linear-gradient(to top, #10b981 60%, #eab308 85%, #ef4444 100%)'
                    }} 
                  />
                </div>
                <input 
                  type="range" 
                  min="-60" 
                  max="6" 
                  value={masterVolume} 
                  onChange={e => changeVolume(3, parseInt(e.target.value))}
                  className={styles.faderScrubber}
                />
                <div className={styles.channelLabel} style={{ color: '#8b5cf6', fontWeight: 700 }}>Master</div>
                <div className={styles.dbLabel} style={{ color: '#8b5cf6' }}>{masterVolume > 0 ? `+${masterVolume}` : masterVolume}dB</div>
                <div className={styles.trackActions}>
                  <button className={`${styles.actionBtn} ${mutes[3] ? styles.activeMute : ''}`} onClick={() => toggleMute(3)}>M</button>
                  <button className={`${styles.actionBtn} ${solos[3] ? styles.activeSolo : ''}`} onClick={() => toggleSolo(3)}>S</button>
                </div>
              </div>
            </div>
          </div>

          {/* AI Voiceover generator */}
          <div className={styles.voiceoverSection}>
            <h4 className={styles.sectionTitle}>AI Voiceover Script Compiler</h4>
            <div className={styles.voForm}>
              <div className={styles.textareaWrapper}>
                <textarea 
                  className={styles.voTextarea}
                  placeholder="Enter script dialog for AI speech voiceover overlay..."
                  value={voiceText}
                  onChange={e => setVoiceText(e.target.value)}
                  disabled={isGeneratingVo}
                />
              </div>
              
              <div className={styles.actorSelectRow}>
                <label>Voice Actor Profile</label>
                <select
                  value={voiceActor}
                  onChange={e => setVoiceActor(e.target.value)}
                  className={styles.voSelect}
                  disabled={isGeneratingVo}
                >
                  <option value="narrator_cinematic">Cinematic Narrator (Male, Deep)</option>
                  <option value="reviewer_tech">Tech Reviewer (Male, Fast)</option>
                  <option value="ad_energetic">Energetic Promo (Female, Bright)</option>
                  <option value="smooth_ai">AI Assistant (Female, Clear)</option>
                </select>
              </div>

              <button 
                className={styles.voGenerateBtn}
                onClick={handleGenerateVoiceover}
                disabled={isGeneratingVo || !voiceText.trim()}
              >
                {isGeneratingVo ? (
                  <>
                    <div className={styles.voSpinner} /> Generating Audio Track...
                  </>
                ) : (
                  'Generate Voiceover & Append'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
