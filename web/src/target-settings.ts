export type TargetSettings = {
  dismissTargetReminder: boolean;
  useForRecommendations: boolean;
  useForTests: boolean;
  useForDistribution: boolean;
  showHighlightedMetric: boolean;
};

export const defaultTargetSettings: TargetSettings = {
  dismissTargetReminder: false,
  useForRecommendations: true,
  useForTests: true,
  useForDistribution: true,
  showHighlightedMetric: true,
};
