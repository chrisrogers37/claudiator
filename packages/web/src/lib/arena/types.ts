// Shared Arena types

export interface RubricDimension {
  key: string;
  label: string;
  description: string;
  maxScore: number; // always 25 (4 dimensions x 25 = 100)
}

export interface ScoringRubric {
  dimensions: [RubricDimension, RubricDimension, RubricDimension, RubricDimension];
}

export const DEFAULT_RUBRIC: ScoringRubric = {
  dimensions: [
    { key: "accuracy", label: "Accuracy", description: "Correctness and relevance of the response", maxScore: 25 },
    { key: "completeness", label: "Completeness", description: "How thoroughly the scenario is addressed", maxScore: 25 },
    { key: "style", label: "Style", description: "Quality of formatting, communication, and user experience", maxScore: 25 },
    { key: "efficiency", label: "Efficiency", description: "Conciseness, avoiding unnecessary steps", maxScore: 25 },
  ],
};
