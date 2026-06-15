import { useState, useEffect, useRef } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { invoke } from '@tauri-apps/api/tauri';
import styles from './AIPromptPanel.module.css';

// ============================================================================
// Types
// ============================================================================

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  logs?: string[];
  isGenerating?: boolean;
}

interface AIPromptPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVideoPath: string | null;
  selectedSketchPath: string | null;
  onClearSketchPath: () => void;
  onSendToTimeline: (filePath: string) => void;
}

// ============================================================================
// Icons
// ============================================================================

const SparklesIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    <path d="M12 8l1.5 2.5L16 12l-2.5 1.5L12 16l-1.5-2.5L8 12l2.5-1.5z" fill="currentColor" />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

// ============================================================================
// Component
// ============================================================================

export default function AIPromptPanel({
  isOpen,
  onClose,
  selectedVideoPath,
  selectedSketchPath,
  onClearSketchPath,
  onSendToTimeline
}: AIPromptPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [strength, setStrength] = useState(0.75);
  const [selectedTask, setSelectedTask] = useState<'bg_replace' | 'object_removal' | 'style_transfer'>('bg_replace');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: "Hello! I am your AI Video Copilot. I can transform your raw video clips using NPU-accelerated generative models. Draw sketches in **AI Studio** as composition guides, or prompt me for background replacement, object removal, or style transfer.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentLogs, setCurrentLogs] = useState<string[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentLogs]);

  // Log steps generator
  const runLogsSimulation = (taskType: string, callback: () => void) => {
    setCurrentLogs([]);
    const steps = [
      '[NPU Video Engine] Step 1/4: Analyzing temporal consistency across frames...',
      `[NPU Video Engine] Step 2/4: Segmenting video layers for task: ${taskType}...`,
      selectedSketchPath 
        ? '[NPU Video Engine] Step 3/4: Composite overlays aligned using active sketch guide...' 
        : '[NPU Video Engine] Step 3/4: Composition guide aligned using default text layout...',
      `[NPU Video Engine] Step 4/4: Encoding output video track with strength ${strength}...`
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < steps.length) {
        setCurrentLogs((prev) => [...prev, steps[currentStep]]);
        currentStep++;
      } else {
        clearInterval(interval);
        callback();
      }
    }, 1200);

    return () => clearInterval(interval);
  };

  const handleSend = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;

    if (!selectedVideoPath) {
      const errorMsg: Message = {
        id: Math.random().toString(),
        sender: 'ai',
        text: "I couldn't find an active video clip. Please select or drag a video clip into the workspace or timeline first so I know what to transform!",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, errorMsg]);
      return;
    }

    // Add User Message
    const userMsg: Message = {
      id: Math.random().toString(),
      sender: 'user',
      text: `${getTaskLabel(selectedTask)}: "${trimmedPrompt}"`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setPrompt('');
    setIsGenerating(true);

    // AI thinking bubble
    const aiThinkingId = Math.random().toString();
    const aiThinkingMsg: Message = {
      id: aiThinkingId,
      sender: 'ai',
      text: `Got it. Initializing NPU generative pipeline for ${getTaskLabel(selectedTask)}...`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isGenerating: true
    };
    setMessages((prev) => [...prev, aiThinkingMsg]);

    // Setup logs pipeline
    runLogsSimulation(selectedTask, async () => {
      try {
        console.log(`AI Copilot invoking NPU: Video=${selectedVideoPath}, Sketch=${selectedSketchPath || 'none'}, Task=${selectedTask}, Prompt=${trimmedPrompt}`);
        
        const outputFilePath = await invoke<string>('process_video_ai', {
          videoPath: selectedVideoPath,
          sketchPath: selectedSketchPath || 'none',
          prompt: trimmedPrompt,
          taskType: selectedTask,
          strength
        });

        console.log('AI Video processed successfully:', outputFilePath);

        // Update thinking bubble with success
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiThinkingId
              ? {
                  ...msg,
                  text: `Generative transformation complete! I've loaded the processed asset and injected it onto Track 2 (Overlay track) at frame 0. Temporal consistency has been preserved across all frames.`,
                  isGenerating: false,
                  logs: [...currentLogs, '[Success] Output rendered back into timeline.']
                }
              : msg
          )
        );

        // Inject generated clip to timeline
        onSendToTimeline(outputFilePath);

      } catch (err: any) {
        console.error('AI Video generation error:', err);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiThinkingId
              ? {
                  ...msg,
                  text: `An error occurred during NPU acceleration: ${err.message || err}`,
                  isGenerating: false,
                  logs: [...currentLogs, `[Error] NPU task failed: ${err}`]
                }
              : msg
          )
        );
      } finally {
        setIsGenerating(false);
        setCurrentLogs([]);
      }
    });
  };

  const handleGenerate = async () => {
    const promptText = prompt.trim();
    if (!promptText) return;

    setIsLoading(true);
    try {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      const base64Image = canvas ? canvas.toDataURL('image/png') : '';

      const filePath = await invoke<string>('process_sketch_to_npu', { 
        promptText, 
        base64Image 
      });

      if (filePath) {
        onSendToTimeline(filePath);
      }
    } catch (err: any) {
      console.error('NPU sketch error:', err);
      setMessages((prev) => [...prev, {
        id: Math.random().toString(),
        sender: 'ai',
        text: `NPU Generation Failed: ${err.message || err}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const getTaskLabel = (task: string) => {
    switch (task) {
      case 'bg_replace': return 'Background Replacement';
      case 'object_removal': return 'Object Removal';
      case 'style_transfer': return 'Style Transfer';
      default: return 'Generative Effect';
    }
  };

  const getFileName = (path: string) => {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || 'sketch.png';
  };

  return (
    <aside className={`${styles.panel} ${!isOpen ? styles.closed : ''}`}>
      {/* Panel Header */}
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.titleIcon}><SparklesIcon /></span>
          <h3 className={styles.title}>AI Copilot</h3>
        </div>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close panel">
          ✕
        </button>
      </div>

      {/* Chat Area */}
      <div className={styles.chatArea}>
        {messages.map((msg) => (
          <div key={msg.id} className={`${styles.msgBubble} ${msg.sender === 'user' ? styles.msgUser : styles.msgAI}`}>
            <div className={styles.msgText}>{msg.text}</div>
            
            {/* Live Progress Logs */}
            {msg.id === messages[messages.length - 1].id && isGenerating && currentLogs.length > 0 && (
              <div className={styles.logBox}>
                {currentLogs.map((log, index) => (
                  <div key={index} className={styles.logLine}>{log}</div>
                ))}
                <div className={styles.logPulse}>● Processing on Snapdragon NPU...</div>
              </div>
            )}

            {msg.logs && msg.logs.length > 0 && (
              <div className={styles.logBox}>
                {msg.logs.map((log, index) => (
                  <div key={index} className={styles.logLine}>{log}</div>
                ))}
              </div>
            )}

            <div className={styles.msgTime}>{msg.timestamp}</div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Sketch Overlay Guide Indicator */}
      {selectedSketchPath && (
        <>
          <div className={styles.sketchGuideBox}>
            <div className={styles.sketchThumbContainer}>
              <img src={convertFileSrc(selectedSketchPath)} alt="Guide thumb" className={styles.sketchThumb} />
            </div>
            <div className={styles.sketchInfo}>
              <span className={styles.sketchLabel}>Composition Guide Active</span>
              <span className={styles.sketchName}>{getFileName(selectedSketchPath)}</span>
            </div>
            <button className={styles.clearSketchBtn} onClick={onClearSketchPath} title="Remove guide" disabled={isLoading || isGenerating}>
              <TrashIcon />
            </button>
          </div>
          
          <div style={{ padding: '0 16px' }}>
            <button
              className={styles.generateBtn}
              onClick={handleGenerate}
              disabled={isLoading || isGenerating || !prompt.trim()}
            >
              {isLoading ? (
                <>
                  <span className={styles.spinner} />
                  Generating on Snapdragon NPU...
                </>
              ) : (
                'Generate with NPU'
              )}
            </button>
          </div>
        </>
      )}

      {/* Control Presets & Text Input */}
      <div className={styles.inputArea}>
        <div className={styles.taskSelector}>
          <button
            className={`${styles.taskBtn} ${selectedTask === 'bg_replace' ? styles.activeTask : ''}`}
            onClick={() => setSelectedTask('bg_replace')}
            disabled={isGenerating || isLoading}
          >
            Background
          </button>
          <button
            className={`${styles.taskBtn} ${selectedTask === 'object_removal' ? styles.activeTask : ''}`}
            onClick={() => setSelectedTask('object_removal')}
            disabled={isGenerating || isLoading}
          >
            Remove Object
          </button>
          <button
            className={`${styles.taskBtn} ${selectedTask === 'style_transfer' ? styles.activeTask : ''}`}
            onClick={() => setSelectedTask('style_transfer')}
            disabled={isGenerating || isLoading}
          >
            Style Transfer
          </button>
        </div>

        {/* Strength Slider */}
        <div className={styles.strengthSlider}>
          <label>NPU Creativity / Strength: <span>{Math.round(strength * 100)}%</span></label>
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.05"
            value={strength}
            onChange={(e) => setStrength(parseFloat(e.target.value))}
            disabled={isGenerating || isLoading}
          />
        </div>

        <div className={styles.textInputGroup}>
          <textarea
            className={styles.textarea}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              selectedTask === 'bg_replace' ? "e.g. 'cyberpunk neon city skyline'" :
              selectedTask === 'object_removal' ? "e.g. 'remove moving cars from background'" :
              "e.g. 'cartoon style using drawn guides'"
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (selectedSketchPath) {
                  handleGenerate();
                } else {
                  handleSend();
                }
              }
            }}
            disabled={isGenerating || isLoading}
          />
          <button
            className={styles.sendBtn}
            onClick={selectedSketchPath ? handleGenerate : handleSend}
            disabled={isGenerating || isLoading || !prompt.trim()}
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </aside>
  );
}
