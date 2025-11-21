export interface VoiceOption {
  name: string;
  lang: string;
}

export const getAvailableVoices = (): Promise<VoiceOption[]> => {
  return new Promise(resolve => {
    let voices = window.speechSynthesis.getVoices();

    if (voices.length) {
      resolve(voices.map(voice => ({ name: voice.name, lang: voice.lang })));

      return;
    }

    const handleVoicesChanged = () => {
      voices = window.speechSynthesis.getVoices();

      if (voices.length) {
        resolve(voices.map(voice => ({ name: voice.name, lang: voice.lang })));
        window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged); // Clean up listener
      }
    };

    window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
  });
};

let currentUtterance: SpeechSynthesisUtterance | null = null;
let onEndCallback: (() => void) | null = null;
let onStartCallback: (() => void) | null = null;
let onPauseCallback: (() => void) | null = null;
let onResumeCallback: (() => void) | null = null;

// Add these state tracking variables at the top
let isSpeechPaused = false;
let currentText = '';
let currentVoice: SpeechSynthesisVoice | null = null;
let currentRate = 1;

export const isCurrentlySpeaking = (): boolean => window.speechSynthesis.speaking;
export const isCurrentlyPaused = (): boolean => 
  isSpeechPaused || window.speechSynthesis.paused;

export const speakMessage = (
  text: string,
  voiceName?: string,
  rate: number = 1,
  callbacks?: {
    onStart?: () => void;
    onEnd?: () => void;
    onPause?: () => void;
    onResume?: () => void;
  },
) => {
  if (isCurrentlySpeaking() || window.speechSynthesis.pending) {
    stopSpeech(); // Use the enhanced stopSpeech which handles callbacks
  }

  const utterance = new SpeechSynthesisUtterance(text);

  utterance.rate = rate;

  if (voiceName) {
    const voices = window.speechSynthesis.getVoices();
    const selectedVoice = voices.find(voice => voice.name === voiceName);

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    } else {
      console.warn(`Voice "${voiceName}" not found. Using default.`);
    }
  }

  onStartCallback = callbacks?.onStart || null;
  onEndCallback = callbacks?.onEnd || null;
  onPauseCallback = callbacks?.onPause || null;
  onResumeCallback = callbacks?.onResume || null;

  utterance.onstart = () => {
    currentUtterance = utterance; // Move this here to ensure it's set when speech actually starts

    if (onStartCallback) onStartCallback();
  };

  utterance.onend = () => {
    if (currentUtterance === utterance) {
        currentUtterance = null;

        if (onEndCallback) onEndCallback();

        onStartCallback = onEndCallback = onPauseCallback = onResumeCallback = null;
    }
  };

  utterance.onpause = () => {
     if (currentUtterance === utterance && onPauseCallback) onPauseCallback();
  };

  utterance.onresume = () => {
     if (currentUtterance === utterance && onResumeCallback) onResumeCallback();
  };

  utterance.onerror = event => {
    console.error('SpeechSynthesisUtterance error:', event.error);

     if (currentUtterance === utterance) {
        currentUtterance = null;

        if (onEndCallback) onEndCallback(); // Treat error as end

        onStartCallback = onEndCallback = onPauseCallback = onResumeCallback = null;
     }
  };

  window.speechSynthesis.speak(utterance);
};

export const stopSpeech = () => {
  if (!currentUtterance && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
    return;
  }

  const callback = onEndCallback; // Capture callback before clearing

  currentUtterance = null;
  currentText = '';
  currentVoice = null;
  isSpeechPaused = false;
  onStartCallback = onEndCallback = onPauseCallback = onResumeCallback = null;

  window.speechSynthesis.cancel(); // Stop speaking and clear queue

  if (callback) {
    callback();
  }
};

export const pauseSpeech = () => {
  if (currentUtterance && isCurrentlySpeaking() && !isSpeechPaused) {
    try {
      isSpeechPaused = true;
      window.speechSynthesis.pause();

      if (onPauseCallback) onPauseCallback();
    } catch (error) {
      console.error('Error pausing speech:', error);

      // Fallback: Store current state for manual resume
      if (currentUtterance) {
        currentText = currentUtterance.text;
        currentVoice = currentUtterance.voice;
        currentRate = currentUtterance.rate;
      }
    }
  }
};

let openAiAudio: HTMLAudioElement | null = null;
let onEndOpenAICallback: (() => void) | null = null;
let onPauseOpenAICallback: (() => void) | null = null;
let onResumeOpenAICallback: (() => void) | null = null;
let isOpenAiPaused = false;
let isOpenAiPlaying = false;
let isOpenAiLoading = false; // <-- Add this

export const isOpenAISpeaking = () =>
  (isOpenAiPlaying && !!openAiAudio && !openAiAudio.paused && !openAiAudio.ended) || isOpenAiLoading;

export const isOpenAIPaused = () => isOpenAiPaused;

export const isOpenAIAudioActive = () =>
  isOpenAiLoading ||
  isOpenAiPlaying ||
  isOpenAiPaused ||
  (!!openAiAudio && !openAiAudio.ended);

export const speakMessageOpenAI = async (
  text: string,
  apiKey: string,
  voice: string = 'alloy',
  model: string = 'tts-1',
  endpoint: string = 'https://api.openai.com/v1/audio/speech',
  callbacks?: {
    onStart?: () => void;
    onEnd?: () => void;
    onPause?: () => void;
    onResume?: () => void;
  },
) => {
  if (openAiAudio) {
    stopSpeechOpenAI();
  }

  // Set callbacks
  onEndOpenAICallback = callbacks?.onEnd || null;
  onPauseOpenAICallback = callbacks?.onPause || null;
  onResumeOpenAICallback = callbacks?.onResume || null;

  isOpenAiPaused = false;
  isOpenAiPlaying = false;
  isOpenAiLoading = true;

  callbacks?.onStart?.();

  try {
    let finalEndpoint = endpoint;
    if (finalEndpoint.endsWith('/v1') || finalEndpoint.endsWith('/v1/')) {
      finalEndpoint = `${finalEndpoint.replace(/\/v1\/?$/, '')}/v1/audio/speech`;
    }

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(finalEndpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        model: model,
        input: text,
        voice: voice,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API request failed with status ${response.status}`);
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    openAiAudio = new Audio(audioUrl);

    openAiAudio.onplaying = () => {
      isOpenAiPlaying = true;
      isOpenAiPaused = false;
      isOpenAiLoading = false;
      onResumeOpenAICallback && onResumeOpenAICallback();
    };
    openAiAudio.onpause = () => {
      isOpenAiPaused = true;
      isOpenAiPlaying = false;
      onPauseOpenAICallback && onPauseOpenAICallback();
    };
    openAiAudio.onended = () => {
      isOpenAiPlaying = false;
      isOpenAiPaused = false;
      isOpenAiLoading = false;
      // Only clean up after ended
      cleanupOpenAIAudio();
      if (onEndOpenAICallback) onEndOpenAICallback();
    };
    openAiAudio.onerror = () => {
      isOpenAiPlaying = false;
      isOpenAiPaused = false;
      isOpenAiLoading = false;
      // Only clean up after error
      cleanupOpenAIAudio();
      if (onEndOpenAICallback) onEndOpenAICallback();
    };

    openAiAudio.play();
  } catch (error) {
    console.error('Error with OpenAI TTS:', error);
    isOpenAiLoading = false;
    cleanupOpenAIAudio();
    if (onEndOpenAICallback) onEndOpenAICallback();
  }
};

function cleanupOpenAIAudio() {
  if (openAiAudio) {
    openAiAudio.pause();
    openAiAudio.src = '';
    openAiAudio = null;
  }
  isOpenAiPaused = false;
  isOpenAiPlaying = false;
  isOpenAiLoading = false;
  onEndOpenAICallback = null;
  onPauseOpenAICallback = null;
  onResumeOpenAICallback = null;
}

export const stopSpeechOpenAI = () => {
  // Only clean up if audio exists
  cleanupOpenAIAudio();
};

export const pauseSpeechOpenAI = () => {
  if (openAiAudio && !openAiAudio.paused) {
    openAiAudio.pause();
    isOpenAiPaused = true;
  }
};

export const resumeSpeechOpenAI = () => {
  if (openAiAudio && openAiAudio.paused) {
    openAiAudio.play();
    isOpenAiPaused = false;
  }
};

export const resumeSpeech = () => {
  if (!isSpeechPaused) return;

  try {
    window.speechSynthesis.resume();
    isSpeechPaused = false;

    if (onResumeCallback) onResumeCallback();
  } catch (error) {
    console.error('Error resuming speech, attempting fallback:', error);

    // Fallback: Recreate utterance and start from approximate position
    if (currentText && currentUtterance) {
      window.speechSynthesis.cancel();
      const newUtterance = new SpeechSynthesisUtterance(currentText);

      newUtterance.voice = currentVoice;
      newUtterance.rate = currentRate;
      
      newUtterance.onend = currentUtterance.onend;
      newUtterance.onstart = currentUtterance.onstart;
      newUtterance.onpause = currentUtterance.onpause;
      newUtterance.onresume = currentUtterance.onresume;
      newUtterance.onerror = currentUtterance.onerror;
      
      currentUtterance = newUtterance;
      window.speechSynthesis.speak(newUtterance);
      isSpeechPaused = false;

      if (onResumeCallback) onResumeCallback();
    }
  }
};
