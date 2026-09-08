import type { SplitCandidate, TreeNode } from "./domain";

export const initialTree: TreeNode = {
  id: "root",
  title: "All passengers",
  samples: 891,
  children: [],
};

export const splitCandidates: SplitCandidate[] = [
  {
    id: "sex-female",
    feature: "sex",
    operator: "==",
    value: "female",
    gain: 0.1396,
    leftCount: 314,
    rightCount: 577,
  },
  {
    id: "fare-26",
    feature: "fare",
    operator: "<=",
    value: 26,
    gain: 0.1082,
    leftCount: 547,
    rightCount: 344,
  },
  {
    id: "class-third",
    feature: "class",
    operator: "==",
    value: "Third",
    gain: 0.0741,
    leftCount: 491,
    rightCount: 400,
  },
];
