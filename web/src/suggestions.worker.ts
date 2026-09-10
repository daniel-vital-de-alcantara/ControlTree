/// <reference lib="webworker" />

import type { ParsedDataset } from "./dataset";
import { calculateSplitSuggestions } from "./suggestions";

self.onmessage = (event: MessageEvent<{ dataset: ParsedDataset; target: string; rowIndices?: number[] }>) => {
  try {
    const { dataset, target, rowIndices } = event.data;
    self.postMessage({ candidates: calculateSplitSuggestions(dataset, target, rowIndices) });
  } catch (reason) {
    self.postMessage({ error: reason instanceof Error ? reason.message : "Could not compute split suggestions." });
  }
};
