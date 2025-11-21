import { useCallback } from 'react';
import {
  ClassificationResult,
  StyleCategory,
  TopicCategory,
} from '../../../types/classification';

const stylePrompts: Record<StyleCategory, string> = {
  A: 'Summarize by extracting key facts (who, what, when, where, why, how) into a concise, objective paragraph. Omit opinions and descriptive language.',
  B: 'Summarize as a brief narrative. Identify the main characters or subjects, the core emotional arc, and the key events that shape the story.',
  C: "Summarize by identifying the author's primary argument or thesis. State it clearly, then list the three strongest pieces of evidence used for support.",
  D: 'Summarize by stating the main finding or revelation of the investigation. Detail its impact on the public or relevant systems, and any unresolved questions.',
  E: 'Summarize the key findings from the research or analysis. State the main hypothesis or question, the methods or data used, and the primary conclusion.',
  F: 'Summarize the main points from the informal text (e.g., post, comment thread). Identify the key opinions, questions asked, and overall sentiment of the discussion.',
};

const topicPrompts: Record<TopicCategory, string> = {
  POLITICS:
    'Focus the summary on the political implications. Highlight how government actions, elections, or diplomacy affect public policy, society, or international relations.',
  BUSINESS_ECONOMY:
    'Focus the summary on the financial and economic takeaways. Extract key business insights, market trends, and potential investment opportunities or risks.',
  SCIENCE_TECHNOLOGY:
    'Focus the summary on the technological innovation. Explain the core discovery, its practical applications, and its potential benefits or disruptions.',
  HEALTH_MEDICINE:
    'Focus the summary on health and wellness insights. Explain the key medical findings and their direct implications for personal health, treatment, or prevention.',
  EDUCATION:
    'Focus the summary on the impact on learning. Explain how the information affects educational systems, teaching methods, or student outcomes.',
  CRIME_LAW:
    'Focus the summary on the crime process and consequences aspects. Detail the key legal arguments, criminal activities, or judicial outcomes and their broader societal impact.',
  CULTURE_ENTERTAINMENT:
    'Focus the summary on the cultural significance. Explain how the subject influences art, media, or social trends, and what it reveals about cultural values.',
  SPORTS:
    'Focus the summary on performance and strategy. Detail the key outcomes, standout performances, and strategic decisions that influenced the result.',
  SOCIETY_LIFESTYLE:
    'Focus the summary on its relevance to everyday life. Extract practical advice, social insights, or lifestyle trends that a general reader can apply.',
};

export const usePromptManager = () => {
  const getPrompt = useCallback(
    (classification: ClassificationResult | null): string => {
      if (!classification) {
        return 'Summarize the following text:';
      }

      const stylePrompt = stylePrompts[classification.style];
      const topicPrompt = topicPrompts[classification.topic];

      return `${stylePrompt} ${topicPrompt}`;
    },
    []
  );

  return { getPrompt };
};