import React, { useState } from 'react';
import { FiChevronDown, FiChevronRight, FiShare, FiCopy, FiUser, FiGlobe, FiBriefcase } from 'react-icons/fi';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ClassificationResult } from '../../types/classification';

// === Theme Type ===
type Theme = {
  name: string;
  active: string;
  bg: string;
  text: string;
  bold: string;
  italic: string;
  link: string;
  mute: string;
  tableBorder: string;
  error: string;
  success: string;
  warning: string;
};

type Entities = {
    people?: string[];
    organizations?: string[];
    locations?: string[];
  };

interface InfoBoxProps {
  title: string;
  summary:string;
  tags: string[];
  qa_pairs: { question: string; answer: string }[];
  entities?: Entities;
  classification: ClassificationResult | null;
  theme: Theme;
  onSave: () => void;
}

// === Utilities ===
function isColorDark(color: string): boolean {
  if (!color) return false;
  const hex = color.replace(/[^0-9a-f]/gi, '');
  let r, g, b;
  if (hex.length <= 4) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else {
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  }
  if (isNaN(r) || isNaN(g) || isNaN(b)) return false;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128;
}

// === Mappings for Classification Display ===
const styleDisplayMap: Record<string, { name: string; emoji: string; greeting: string }> = {
    A: { name: 'Hard News', emoji: '📰', greeting: "Which part do you need me to confirm about {{title}}?" },
    B: { name: 'Feature', emoji: '✍️', greeting: "Ha, anything about {{title}}?" },
    C: { name: 'Opinion', emoji: '⚖️', greeting: "What's your take on the arguments in {{title}}?" },
    D: { name: 'Investigative', emoji: '🔍', greeting: "What details in {{title}} were most surprising to you?" },
    E: { name: 'Analysis', emoji: '📊', greeting: "Need help breaking down the analysis in {{title}}?" },
    F: { name: 'Informal', emoji: '💬', greeting: "Hi, want to discuss more about {{title}}?" },
  };

const topicDisplayMap: Record<string, string> = {
    POLITICS: 'Politics',
    BUSINESS_ECONOMY: 'Business',
    SCIENCE_TECHNOLOGY: 'Technology',
    HEALTH_MEDICINE: 'Health',
    EDUCATION: 'Education',
    CRIME_LAW: 'Law',
    CULTURE_ENTERTAINTAINMENT: 'Culture',
    SPORTS: 'Sports',
    SOCIETY_LIFESTYLE: 'Lifestyle',
  };

// === Components ===
const InfoBox: React.FC<InfoBoxProps> = ({ title, summary, tags, qa_pairs, entities, classification, theme, onSave }) => {
  const [isSaveHovered, setIsSaveHovered] = useState(false);
  const [isCopyHovered, setIsCopyHovered] = useState(false);
  const [showFullSummary, setShowFullSummary] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const handleCopy = () => {
    const qaText = qa_pairs.map(qa => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n');
    const contentToCopy = `Title: ${title}\n\nSummary:\n${summary}\n\n${qaText}`;
    navigator.clipboard.writeText(contentToCopy).then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000); // Reset after 2 seconds
    });
  };

  const {
    name: mainTag = 'General',
    emoji = '💡',
    greeting: greetingTemplate = 'Hello! Want to talk more about {{title}}?',
  } = classification ? styleDisplayMap[classification.style] || {} : {};

  const topicTag = classification ? topicDisplayMap[classification.topic] : null;
  const greeting = greetingTemplate.replace('{{title}}', title);

  const displayedSummary =
    showFullSummary || summary.length <= 300
      ? summary
      : summary.slice(0, 300) + '…';

  return (
    <div
      className="relative p-4 rounded-lg"
      style={{
        backgroundColor: `${theme.active}33`, // 20% opacity
        color: theme.text,
      }}
    >
      {/* Action Buttons */}
      <div className="absolute top-3 right-2 flex items-center space-x-1">
        {/* Copy Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleCopy}
              onMouseEnter={() => setIsCopyHovered(true)}
              onMouseLeave={() => setIsCopyHovered(false)}
              className="p-2 rounded-full"
              style={{
                backgroundColor: isCopyHovered ? `${theme.text}22` : 'transparent',
                color: theme.text,
                transition: 'background-color 0.2s ease-in-out',
              }}
              aria-label="Copy summary"
            >
              <FiCopy size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{copySuccess ? "Copied!" : "Copy summary"}</p>
          </TooltipContent>
        </Tooltip>

        {/* Save Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onSave}
              onMouseEnter={() => setIsSaveHovered(true)}
              onMouseLeave={() => setIsSaveHovered(false)}
              className="p-2 rounded-full"
              style={{
                backgroundColor: isSaveHovered ? `${theme.text}22` : 'transparent',
                color: theme.text,
                transition: 'background-color 0.2s ease-in-out',
              }}
              aria-label="Save to note"
            >
              <FiShare size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Save to note</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Title */}
      <h2 className="text-sm font-bold pr-16 flex items-center gap-2 mt-1">
        <span role="img" aria-label={mainTag}>
          {emoji}
        </span>
        {title}
      </h2>

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-2 my-2">
        <span
          className="px-2 py-0.5 text-xs rounded-full"
          style={{
            backgroundColor: theme.link,
            color: isColorDark(theme.link) ? '#FFFFFF' : '#000000',
          }}
        >
          {mainTag}
        </span>
        {topicTag && (
          <span
            className="px-2 py-0.5 text-xs rounded-full"
            style={{
              backgroundColor: theme.active,
              color: isColorDark(theme.active) ? '#FFFFFF' : '#000000',
            }}
          >
            {topicTag}
          </span>
        )}
        {tags?.slice(0, 3).map((tag, index) => (
          <span
            key={index}
            className="px-2 py-0.5 text-xs rounded-full"
            style={{
              backgroundColor: theme.active,
              color: isColorDark(theme.active) ? '#FFFFFF' : '#000000',
            }}
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Summary */}
      <p className="text-sm leading-snug break-word hyphens-auto">
        {displayedSummary}
        {summary.length > 300 && (
          <button
            className="text-xs ml-1 underline"
            onClick={() => setShowFullSummary(!showFullSummary)}
          >
            {showFullSummary ? 'Show less' : 'Read more'}
          </button>
        )}
      </p>

        {/* Entities */}
        <div className="mt-4 space-y-3">
            <EntityList title="People" icon={<FiUser />} entities={entities?.people} theme={theme} />
            <EntityList title="Organizations" icon={<FiBriefcase />} entities={entities?.organizations} theme={theme} />
            <EntityList title="Locations" icon={<FiGlobe />} entities={entities?.locations} theme={theme} />
        </div>

      {/* QA Pairs */}
      <div className="mt-4 break-word hyphens-auto">
        {Array.isArray(qa_pairs) &&
          qa_pairs.map((qa, index) => (
            <ToggleBullet key={index} question={qa.question} answer={qa.answer} />
          ))}
      </div>

      {/* Divider */}
      <hr
        className="my-4 border-t opacity-50"
        style={{ borderColor: theme.mute }}
      />

      {/* Greeting */}
      <p className="text-sm italic opacity-80">{greeting}</p>
    </div>
  );
};

// === Entity List Component ===
const EntityList: React.FC<{ title: string; icon: React.ReactNode; entities?: string[]; theme: Theme }> = ({ title, icon, entities, theme }) => {
    if (!entities || entities.length === 0) return null;

    return (
      <div>
        <h3 className="text-xs font-semibold flex items-center gap-2" style={{ color: theme.mute }}>
          {icon}
          {title}
        </h3>
        <div className="flex flex-wrap items-center gap-1 mt-1">
          {entities.map((entity, index) => (
            <span
              key={index}
              className="px-1.5 py-0.5 text-xs rounded"
              style={{
                backgroundColor: `${theme.text}1A`, // 10% opacity
              }}
            >
              {entity}
            </span>
          ))}
        </div>
      </div>
    );
};

// === Toggle Q&A ===
const ToggleBullet: React.FC<{ question: string; answer: string }> = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center w-full text-left focus:outline-none"
      >
        <span className="mr-2">
          {isOpen ? <FiChevronDown /> : <FiChevronRight />}
        </span>
        <span className="font-semibold">{question}</span>
      </button>
      <div
        className={`grid transition-all duration-300 ease-in-out ${
          isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden pl-6 mt-1 text-sm">
          <p>{answer}</p>
        </div>
      </div>
    </div>
  );
};

export default InfoBox;
