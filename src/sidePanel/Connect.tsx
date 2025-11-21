import { FC } from 'react'; 
import { FiExternalLink } from 'react-icons/fi'; // FiChevronLeft removed

import AnimatedBackground from './AnimatedBackground';
// useConfig might be needed if any sub-components rely on it directly or for styling based on theme
import { useConfig } from './ConfigContext';
import { ConnectCustomEndpoint } from './ConnectCustomEndpoint';
import { ConnectGemini } from './ConnectGemini';
import { ConnectGroq } from './ConnectGroq';
import { ConnectLmStudio } from './ConnectLmStudio';
import { ConnectOllama } from './ConnectOllama';
import { ConnectOpenAI } from './ConnectOpenAI';
import { ConnectOpenRouter } from './ConnectOpenRouter';

// SettingTitle might not be needed if we use a simple h2
import { cn } from "@/src/background/util";

type ConnectionProps = {
  title: string;
  Component: FC<any>;
  link?: string;
};

const ConnectionSection: FC<ConnectionProps> = ({
  title,
  Component,
  link,
}) => (
  <div className="px-4 py-3 border-b border-[var(--text)]/20 last:border-b-0"> {/* Apply bg-[var(--input-background)] on the parent scroll div */}
    <div className="flex items-center justify-between mb-2">
      <h4 className="text-base font-medium capitalize text-[var(--text)] opacity-90">
        {title}
      </h4>
      {link && (
        <a
          className={cn(
            "text-xs inline-flex items-center gap-1",
            "text-[var(--link)] hover:text-[var(--active)] hover:underline",
            "focus-visible:ring-1 focus-visible:ring-[var(--ring)] rounded-sm p-0.5",
          )}
          href={link}
          rel="noopener noreferrer"
          target="_blank"
        >
          API Keys
          <FiExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
    <Component />
  </div>
);

export const Connect: FC = () => { // Simplified props, onBack removed
  // useConfig could be used here if needed for dynamic styling or conditional rendering based on config
  const { config } = useConfig(); // Keep useConfig if sub-components or ConnectionSection might need it implicitly or for styling

  return (
    <div className="relative z-[1] flex flex-col h-full flex-1 overflow-y-auto p-6 text-[var(--text)] no-scrollbar">
      <AnimatedBackground />
      <div className="space-y-0"> {/* Use space-y-0 if ConnectionSection already has bottom margin/border, or adjust as needed */}
        <ConnectionSection Component={ConnectOllama} title="Ollama" />
        <ConnectionSection Component={ConnectLmStudio} title="LM Studio" />
        <ConnectionSection
          Component={ConnectGroq}
          link="https://console.groq.com/keys"
          title="Groq"
        />
        <ConnectionSection
          Component={ConnectGemini}
          link="https://aistudio.google.com/app/apikey"
          title="Gemini"
        />
        <ConnectionSection
          Component={ConnectOpenAI}
          link="https://platform.openai.com/api-keys"
          title="OpenAI"
        />
        <ConnectionSection
          Component={ConnectOpenRouter}
          link="https://openrouter.ai/settings/keys"
          title="OpenRouter"
        />
        {config.customEndpoints?.map((endpoint, index) => (
          <ConnectionSection
            key={endpoint.id}
            Component={() => <ConnectCustomEndpoint endpointData={endpoint} index={index} />}
            title={endpoint.name}
          />
        ))}
      </div>
    </div>
  );
};
