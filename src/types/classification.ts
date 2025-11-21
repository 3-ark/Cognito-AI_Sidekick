export type StyleCategory = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type TopicCategory =
  | 'POLITICS'
  | 'BUSINESS_ECONOMY'
  | 'SCIENCE_TECHNOLOGY'
  | 'HEALTH_MEDICINE'
  | 'EDUCATION'
  | 'CRIME_LAW'
  | 'CULTURE_ENTERTAINMENT'
  | 'SPORTS'
  | 'SOCIETY_LIFESTYLE';

export interface ClassificationResult {
  style: StyleCategory;
  topic: TopicCategory;
  entities: {
    people: string[];
    organizations: string[];
    locations: string[];
  };
}