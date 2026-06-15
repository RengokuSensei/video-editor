import { useState, useEffect } from 'react';
import styles from './EffectsSelector.module.css';

interface EffectsSelectorProps {
  engine: any;
}

export default function EffectsSelector({ engine }: EffectsSelectorProps) {
  const [brightness, setBrightness] = useState(0); // -1 to 1
  const [contrast, setContrast] = useState(0); // -1 to 1
  const [saturation, setSaturation] = useState(0); // -1 to 1
  const [vignette, setVignette] = useState(0); // 0 to 1

  // Synchronize slider states with CreativeEngine
  useEffect(() => {
    if (!engine) return;
    try {
      const videoBlocks = engine.block.findByType('ly.img.video');
      const imageBlocks = engine.block.findByType('ly.img.image');
      const blocks = [...videoBlocks, ...imageBlocks];
      
      for (const block of blocks) {
        // Ensure adjustments block properties are activated if engine supports it
        if (engine.block.hasProperty(block, 'adjustments/active')) {
          engine.block.setBoolean(block, 'adjustments/active', true);
        }
        if (engine.block.hasProperty(block, 'adjustments/brightness')) {
          engine.block.setFloat(block, 'adjustments/brightness', brightness);
        }
        if (engine.block.hasProperty(block, 'adjustments/contrast')) {
          engine.block.setFloat(block, 'adjustments/contrast', contrast);
        }
        if (engine.block.hasProperty(block, 'adjustments/saturation')) {
          engine.block.setFloat(block, 'adjustments/saturation', saturation);
        }
        if (engine.block.hasProperty(block, 'adjustments/vignette')) {
          engine.block.setFloat(block, 'adjustments/vignette', vignette);
        }
      }
    } catch (err) {
      console.warn("EffectsSelector: Error applying adjustments to blocks:", err);
    }
  }, [brightness, contrast, saturation, vignette, engine]);

  const handleReset = () => {
    setBrightness(0);
    setContrast(0);
    setSaturation(0);
    setVignette(0);
  };

  const formatPercent = (val: number) => {
    const pct = Math.round(val * 100);
    return pct >= 0 ? `+${pct}%` : `${pct}%`;
  };

  return (
    <aside className={styles.sidebar}>
      <h3 className={styles.title}>Effects & Compositing</h3>
      
      <div className={styles.sliderGroup}>
        <div className={styles.sliderHeader}>
          <label>Brightness</label>
          <span className={styles.valueLabel}>{formatPercent(brightness)}</span>
        </div>
        <input
          type="range"
          min="-1"
          max="1"
          step="0.05"
          value={brightness}
          onChange={(e) => setBrightness(parseFloat(e.target.value))}
          className={styles.rangeInput}
        />
      </div>

      <div className={styles.sliderGroup}>
        <div className={styles.sliderHeader}>
          <label>Contrast</label>
          <span className={styles.valueLabel}>{formatPercent(contrast)}</span>
        </div>
        <input
          type="range"
          min="-1"
          max="1"
          step="0.05"
          value={contrast}
          onChange={(e) => setContrast(parseFloat(e.target.value))}
          className={styles.rangeInput}
        />
      </div>

      <div className={styles.sliderGroup}>
        <div className={styles.sliderHeader}>
          <label>Saturation</label>
          <span className={styles.valueLabel}>{formatPercent(saturation)}</span>
        </div>
        <input
          type="range"
          min="-1"
          max="1"
          step="0.05"
          value={saturation}
          onChange={(e) => setSaturation(parseFloat(e.target.value))}
          className={styles.rangeInput}
        />
      </div>

      <div className={styles.sliderGroup}>
        <div className={styles.sliderHeader}>
          <label>Vignette Strength</label>
          <span className={styles.valueLabel}>{Math.round(vignette * 100)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={vignette}
          onChange={(e) => setVignette(parseFloat(e.target.value))}
          className={styles.rangeInput}
        />
      </div>

      <button className={styles.resetButton} onClick={handleReset}>
        Reset Adjustments
      </button>
    </aside>
  );
}
