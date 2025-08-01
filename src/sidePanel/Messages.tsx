import { useState, useLayoutEffect, useRef, useEffect } from 'react';
import { FiCopy, FiRepeat, FiPlay, FiPause, FiSquare } from 'react-icons/fi';
import { MessageTurn } from '../background/chatHistoryStorage';
import { EditableMessage } from './Message';
import { ToolCallMessage } from './components/ToolCallMessage';
import {
  speakMessage,
  stopSpeech,
  pauseSpeech,
  resumeSpeech,
  isCurrentlySpeaking,
  isCurrentlyPaused,
} from '../background/ttsUtils';
import { useConfig } from './ConfigContext';
import { Button } from "@/components/ui/button";
import { cn } from "@/src/background/util";

const cleanTextForTTS = (text: string): string => {
  let cleanedText = text;
  cleanedText = cleanedText.replace(/(https?:\/\/[^\s]+)/g, 'link');
  cleanedText = cleanedText.replace(/\\([*_{}[\]()#+.!~`-])/g, '$1');
  cleanedText = cleanedText.replace(/(\*\*|__|\*|_)(.*?)\1/g, '$2');
  cleanedText = cleanedText.replace(/~~(.*?)~~/g, '$1');
  cleanedText = cleanedText.replace(/```(?:[\w\-_]+)?\n([\s\S]*?)\n```/g, '$1');
  cleanedText = cleanedText.replace(/`([^`]+)`/g, '$1');
  cleanedText = cleanedText.replace(/^[*+-]\s+/gm, '');
  cleanedText = cleanedText.replace(/\*/g, '');
  cleanedText = cleanedText.replace(/:/g, '.');
  cleanedText = cleanedText.replace(/\//g, ' ');
  cleanedText = cleanedText.replace(/\s{2,}/g, ' ');
  cleanedText = cleanedText.replace(/<[^>]*>/g, '');
  cleanedText = cleanedText.replace(/:(?!\.|\s*\d)/g, '. ');
  cleanedText = cleanedText.replace(/[()[\]{}]/g, '');
  console.log('cleaned text:', cleanedText);

  return cleanedText.trim();
};

interface MessagesProps {
  turns?: MessageTurn[];
  isLoading?: boolean;
  onReload?: () => void;
  settingsMode?: boolean;
  onEditTurn: (index: number, newContent: string) => void;
}

export const Messages: React.FC<MessagesProps> = ({
  turns = [], isLoading = false, onReload = () => {}, settingsMode = false, onEditTurn
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number>(-1);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState<string>('');
  const [speakingIndex, setSpeakingIndex] = useState<number>(-1);
  const [ttsIsPaused, setTtsIsPaused] = useState<boolean>(false);
  const { config } = useConfig();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const speaking = isCurrentlySpeaking();
      const paused = isCurrentlyPaused();

      if (!speaking && speakingIndex !== -1) {
        setSpeakingIndex(-1);
        setTtsIsPaused(false);
      } else if (speaking) {
        setTtsIsPaused(paused);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [speakingIndex]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container) {
      const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      const isNearBottom = scrollBottom < 200;
      if (isNearBottom) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [turns]);

  const copyMessage = (text: string) => {
    navigator.clipboard.writeText(text)
  };

  const handlePause = () => {
    console.log("Handle pause called");
    if (!ttsIsPaused) {
      pauseSpeech();
    }
  };

  const handleResume = () => {
    console.log("Handle resume called");
    if (ttsIsPaused) {
      resumeSpeech();
    }
  };

  const handlePlay = (index: number, text: string) => {
    console.log(`Attempting to play index: ${index}`);
    
    if (index === speakingIndex && ttsIsPaused) {
      console.log('Attempting to resume paused speech');
      handleResume();
      return;
    }
    
    const textToSpeak = cleanTextForTTS(text);
    console.log(`Starting new speech for index: ${index}`);
    setSpeakingIndex(index);
    speakMessage(textToSpeak, config?.tts?.selectedVoice, config?.tts?.rate, {
      onStart: () => {
        console.log(`Speech started for index: ${index}`);
        setSpeakingIndex(index);
        setTtsIsPaused(false);
      },
      onEnd: () => {
        console.log(`Speech ended for index: ${index}`);
        setSpeakingIndex(-1);
        setTtsIsPaused(false);
      },
      onPause: () => {
        console.log(`Speech paused for index: ${index}`);
        setTtsIsPaused(true);
      },
      onResume: () => {
        console.log(`Speech resumed for index: ${index}`);
        setTtsIsPaused(false);
      },
    });
  };

  const handleStop = () => {
    console.log("Handle stop called");
    stopSpeech();
    setSpeakingIndex(-1);
    setTtsIsPaused(false);
  };

  const startEdit = (index: number, currentContent: string) => { setEditingIndex(index); setEditText(currentContent); };
  const cancelEdit = () => { setEditingIndex(null); setEditText(''); };
  const saveEdit = () => { if (editingIndex !== null && editText.trim()) { onEditTurn(editingIndex, editText); } cancelEdit(); };

  return (
    <div
      ref={containerRef}
      id="messages"
      className={cn(
        "flex flex-col flex-grow w-full overflow-y-auto pb-2 pt-2",
        "no-scrollbar"
      )}
      style={{
        background: config?.paperTexture ? 'transparent' : 'var(--bg)',
        opacity: settingsMode ? 0 : 1,
      }}
    >
      {turns.map(
        (turn, i) => {
          if (
            turn.role === 'assistant' &&
            turn.tool_calls &&
            turn.tool_calls.length > 0
          ) {
            return <ToolCallMessage key={`tool_call_${i}`} turn={turn} />;
          }

          return (
            <div
              key={turn.timestamp || `turn_${i}`}
              className={cn(
                "flex items-start w-full mt-1 mb-1 px-2 relative",
                turn.role === 'user' ? 'justify-start' : turn.role === 'assistant' ? 'justify-end' : 'justify-center'
              )}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(-1)}
            >
              {turn.role === 'assistant' && (
                <div
                  className={cn(
                    "flex flex-col items-center self-end space-y-0 mr-0 pb-3 transition-opacity duration-100",
                    hoveredIndex === i ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                  )}
                >
                  {editingIndex !== i && (
                    <Button aria-label="Copy" variant="message-action" size="xs" onClick={() => copyMessage(turn.content)} title="Copy message">
                      <FiCopy className="text-[var(--text)]" />
                    </Button>
                  )}
                  {speakingIndex === i && (
                    <>
                      <Button 
                        aria-label={ttsIsPaused ? "Resume" : "Pause"} 
                        variant="message-action" 
                        size="xs" 
                        onClick={ttsIsPaused ? handleResume : handlePause} 
                        title={ttsIsPaused ? "Resume speech" : "Pause speech"}
                      >
                        {ttsIsPaused ? <FiPlay className="text-[var(--text)]" /> : <FiPause className="text-[var(--text)]" />}
                      </Button>
                      <Button aria-label="Stop" variant="message-action" size="xs" onClick={handleStop} title="Stop speech">
                        <FiSquare className="text-[var(--text)]" />
                      </Button>
                    </>
                  )}
                  {speakingIndex !== i && (
                    <Button aria-label="Speak" variant="message-action" size="xs" onClick={() => handlePlay(i, turn.content)} title="Speak message">
                      <FiPlay className="text-[var(--text)]" />
                    </Button>
                  )}
                  {i === turns.length - 1 && (
                    <Button aria-label="Reload" variant="message-action" size="xs" onClick={onReload} title="Reload last prompt">
                      <FiRepeat className="text-[var(--text)]" />
                    </Button>
                  )}
                </div>
              )}
              <EditableMessage
                turn={turn}
                index={i}
                isEditing={editingIndex === i}
                editText={editText}
                onStartEdit={startEdit}
                onSetEditText={setEditText}
                onSaveEdit={saveEdit}
                onCancelEdit={cancelEdit} />
              {turn.role === 'user' && (
                (<div
                   className={cn(
                      "flex flex-col items-center self-end space-y-0 ml-0 pb-1 transition-opacity duration-100",
                      hoveredIndex === i ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                    )}
                >
                  {editingIndex !== i && (
                    <Button aria-label="Copy" variant="message-action" size="sm" onClick={() => copyMessage(turn.content)} title="Copy message">
                      <FiCopy className="text-[var(--text)]" />
                    </Button>
                  )}
                </div>)
              )}
            </div>
          );
        }
      )}
      <div ref={messagesEndRef} style={{ height: '1px' }} />
    </div>
  );
};