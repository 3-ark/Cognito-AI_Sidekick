import {
 useEffect,useLayoutEffect, useRef, useState, 
} from 'react';

import {
  isCurrentlyPaused,
  isCurrentlySpeaking,
  isOpenAIAudioActive,
  isOpenAIPaused,
  isOpenAISpeaking,
  pauseSpeech,
  pauseSpeechOpenAI,
  resumeSpeech,
  resumeSpeechOpenAI,
  speakMessage,
  speakMessageOpenAI,
  stopSpeech,
  stopSpeechOpenAI,
} from '../background/ttsUtils';
import { MessageTurn } from '../types/chatTypes';

import { MessageActionButtons } from './components/MessageActionButtons';
import { useConfig } from './ConfigContext';
import { EditableMessage } from './Message';

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

import { ContextIndicator } from './ContextIndicator';
import { Conversation } from '../types/chatTypes';

interface MessagesProps {
  turns?: MessageTurn[];
  isLoading?: boolean;
  onReload?: () => void;
  settingsMode?: boolean;
  onEditTurn: (index: number, newContent: string) => void;
  onDeleteTurn: (messageId: string) => void;
  onContinueTurn: (messageId: string) => void;
  sessionContext: string;
  onClearContext: () => void;
  onLoadChat: (conversation: Conversation) => void;
}

export const Messages: React.FC<MessagesProps> = ({
  turns = [], isLoading = false, onReload = () => {}, settingsMode = false, onEditTurn, onDeleteTurn, onContinueTurn, sessionContext, onClearContext, onLoadChat
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
      if (speakingIndex === -1) {
        return;
      }

      if (config.tts?.provider === 'openai') {
        if (isOpenAIAudioActive()) {
          const paused = isOpenAIPaused();
          if (ttsIsPaused !== paused) {
            setTtsIsPaused(paused);
          }
        } else {
          setSpeakingIndex(-1);
          setTtsIsPaused(false);
        }
      } else {
        const speaking = isCurrentlySpeaking();
        const paused = isCurrentlyPaused();
        if (!speaking && !paused) {
          setSpeakingIndex(-1);
          setTtsIsPaused(false);
        } else if (ttsIsPaused !== paused) {
          setTtsIsPaused(paused);
        }
      }
    }, 200);

    return () => clearInterval(interval);
  }, [speakingIndex, config.tts?.provider, ttsIsPaused]);

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
    if (config.tts?.provider === 'openai') {
      pauseSpeechOpenAI();
    } else {
      pauseSpeech();
    }
  };

  const handleResume = () => {
    if (config.tts?.provider === 'openai') {
      resumeSpeechOpenAI();
    } else {
      resumeSpeech();
    }
  };

  const handlePlay = (index: number, text: string) => {
    if (index === speakingIndex && ttsIsPaused) {
      handleResume();

      return;
    }

    const textToSpeak = cleanTextForTTS(text);

    setSpeakingIndex(index);

    const callbacks = {
      onStart: () => {
        setSpeakingIndex(index);
        setTtsIsPaused(false);
      },
      onEnd: () => {
        setSpeakingIndex(-1);
        setTtsIsPaused(false);
      },
      onPause: () => {
        setTtsIsPaused(true);
      },
      onResume: () => {
        setTtsIsPaused(false);
      },
    };

    if (config.tts?.provider === 'openai') {
      const DEFAULT_OPENAI_ENDPOINT = 'https://api.openai.com/v1/audio/speech';
      const isCustomEndpoint =
        config.tts?.endpoint && config.tts.endpoint !== DEFAULT_OPENAI_ENDPOINT;

      if (config.openAiApiKey || isCustomEndpoint) {
        speakMessageOpenAI(
          textToSpeak,
          config.openAiApiKey || '',
          config.tts.selectedVoice,
          config.tts.model,
          config.tts.endpoint,
          callbacks,
        );
      } else {
        console.error('OpenAI API key not found');
      }
    } else {
      speakMessage(textToSpeak, config?.tts?.selectedVoice, config?.tts?.rate, callbacks);
    }
  };

  const handleStop = () => {
    if (config.tts?.provider === 'openai') {
      stopSpeechOpenAI();
    } else {
      stopSpeech();
    }
  };

  const startEdit = (index: number, currentContent: string) => { setEditingIndex(index); setEditText(currentContent); };
  const cancelEdit = () => { setEditingIndex(null); setEditText(''); };
  const saveEdit = () => { if (editingIndex !== null && editText.trim()) { onEditTurn(editingIndex, editText); }

 cancelEdit(); };

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col flex-grow w-full overflow-y-auto p-2",
        "no-scrollbar",
      )}
      id="messages"
      style={{
        background: config?.paperTexture ? 'transparent' : 'var(--bg)',
        opacity: settingsMode ? 0 : 1,
      }}
    >
      <ContextIndicator context={sessionContext} onClear={onClearContext} />
      {turns.map(
        (turn, i) => {
          // Hide ALL assistant messages that contain a tool call
          if (
            turn.role === 'assistant' &&
            turn.tool_calls &&
            turn.tool_calls.length > 0 &&
            !turn.content
          ) {
             return (
                     <div key={turn.id} className="text-xs text-muted px-4 py-2 italic">
                     🤖 Calling {turn.tool_calls[0].function.name}...
                     </div>
                     );          
            }

          return (
            <div
              key={turn.id || `turn_${i}`}
              className={cn(
                "flex items-start w-full px-2 relative",
                turn.role === 'user' ? 'justify-end' : turn.role === 'assistant' ? 'justify-start' : 'justify-center',
              )}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(-1)}
            >
              <div className={cn("flex flex-col w-full", turn.role === 'user' ? 'items-end' : 'items-start')}>
                <EditableMessage
                  editText={editText}
                  index={i}
                  isEditing={editingIndex === i}
                  turn={turn}
                  onCancelEdit={cancelEdit}
                  onContinue={onContinueTurn}
                  onDelete={onDeleteTurn}
                  onSaveEdit={saveEdit}
                  onSetEditText={setEditText}
                  onStartEdit={startEdit}
                  onLoadChat={onLoadChat}
                />
                {(turn.role === 'assistant' || turn.role === 'user') && (
                  <div
                    className={cn(
                      "transition-opacity duration-100",
                      hoveredIndex === i ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
                    )}
                  >
                    <MessageActionButtons
                      index={i}
                      isEditing={editingIndex === i}
                      isLastTurn={i === turns.length - 1}
                      speakingIndex={speakingIndex}
                      ttsIsPaused={ttsIsPaused}
                      turn={turn}
                      onContinue={onContinueTurn}
                      onCopy={copyMessage}
                      onDelete={onDeleteTurn}
                      onPause={handlePause}
                      onPlay={handlePlay}
                      onReload={onReload}
                      onResume={handleResume}
                      onStartEdit={startEdit}
                      onStop={handleStop}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        },
      )}
      <div ref={messagesEndRef} style={{ height: '1px' }} />
    </div>
  );
};
