import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FiCopy, FiEdit, FiFastForward, FiPause, FiPlay, FiRepeat, FiSquare, FiTrash,
} from 'react-icons/fi';

import type { MessageTurn } from '../../types/chatTypes';

import { Button } from "@/components/ui/button";

interface MessageActionButtonsProps {
  turn: MessageTurn;
  index: number;
  isLastTurn: boolean;
  isEditing: boolean;
  speakingIndex: number;
  ttsIsPaused: boolean;
  onStartEdit: (index: number, content: string) => void;
  onDelete: (messageId: string) => void;
  onContinue: (messageId: string) => void;
  onCopy: (text: string) => void;
  onReload: () => void;
  onPlay: (index: number, text: string) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export const MessageActionButtons: FC<MessageActionButtonsProps> = ({
  turn,
  index,
  isLastTurn,
  isEditing,
  speakingIndex,
  ttsIsPaused,
  onStartEdit,
  onDelete,
  onContinue,
  onCopy,
  onReload,
  onPlay,
  onPause,
  onResume,
  onStop,
}) => {
  const { t } = useTranslation();

  if (isEditing || turn.role === 'tool') {
    return null;
  }

  const hasGenerationInfo = turn.role === 'assistant' && turn.promptTokens && turn.completionTokens;

  return (
    <div className="flex items-center justify-end space-x-1 p-1">
      {hasGenerationInfo && (
        <div className="flex items-center space-x-1 text-xs text-muted-foreground mr-2">
          <span>{turn.tokensPerSecond} {t('tokensPerSecond')}</span>
          <span className='font-bold'>|</span>
          <span>{turn.promptTokens} {t('prompt')}</span>
          <span className='font-bold'>|</span>
          <span>{turn.completionTokens} {t('gen')}</span>
        </div>
      )}
      <Button aria-label={t('editMessage')} size="xs" variant="ghost" onClick={() => onStartEdit(index, turn.content)}>
        <FiEdit className="h-4 w-4" />
      </Button>
      <Button aria-label={t('deleteMessage')} size="xs" variant="ghost" onClick={() => onDelete(turn.id)}>
        <FiTrash className="h-4 w-4" />
      </Button>
      <Button aria-label={t('continueFromHere')} size="xs" variant="ghost" onClick={() => onContinue(turn.id)}>
        <FiFastForward className="h-4 w-4" />
      </Button>
      <Button aria-label={t('copyMessage')} size="xs" title={t('copyMessage')} variant="ghost" onClick={() => onCopy(turn.content)}>
        <FiCopy className="h-4 w-4" />
      </Button>
      {speakingIndex === index ? (
        <>
          <Button
            aria-label={ttsIsPaused ? t('resume') : t('pause')}
            size="xs"
            title={ttsIsPaused ? t('resumeSpeech') : t('pauseSpeech')}
            variant="ghost"
            onClick={ttsIsPaused ? onResume : onPause}
          >
            {ttsIsPaused ? <FiPlay className="h-4 w-4" /> : <FiPause className="h-4 w-4" />}
          </Button>
          <Button aria-label={t('stop')} size="xs" title={t('stopSpeech')} variant="ghost" onClick={onStop}>
            <FiSquare className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <Button aria-label={t('speak')} size="xs" title={t('speakMessage')} variant="ghost" onClick={() => onPlay(index, turn.content)}>
          <FiPlay className="h-4 w-4" />
        </Button>
      )}
      {turn.role === 'assistant' && isLastTurn && (
        <Button aria-label={t('reload')} size="xs" title={t('reloadLastPrompt')} variant="ghost" onClick={onReload}>
          <FiRepeat className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};
