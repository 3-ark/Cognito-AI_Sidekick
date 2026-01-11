import { FiPlay, FiPause, FiSquare } from 'react-icons/fi';
import { Button } from "@/components/ui/button";

interface TtsButtonsProps {
  isSpeaking: boolean;
  isPaused: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
}

export const TtsButtons: React.FC<TtsButtonsProps> = ({
  isSpeaking,
  isPaused,
  onPlay,
  onPause,
  onStop,
}) => {
  if (isSpeaking) {
    return (
      <>
        <Button
          aria-label={isPaused ? "Resume" : "Pause"}
          variant="message-action"
          size="xs"
          onClick={isPaused ? onPlay : onPause}
          title={isPaused ? "Resume speech" : "Pause speech"}
        >
          {isPaused ? <FiPlay className="text-(--text)" /> : <FiPause className="text-(--text)" />}
        </Button>
        <Button aria-label="Stop" variant="message-action" size="xs" onClick={onStop} title="Stop speech">
          <FiSquare className="text-(--text)" />
        </Button>
      </>
    );
  }

  return (
    <Button aria-label="Speak" variant="message-action" size="xs" onClick={onPlay} title="Speak message">
      <FiPlay className="text-(--text)" />
    </Button>
  );
};
