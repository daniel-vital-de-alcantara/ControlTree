import type { TreeNode } from "./domain";
import type { DistributionSnapshot } from "./distribution";
import type { NodeFieldVisibility, NodeSummaryMap, TreeAppearance } from "./tree-settings";

export type PresentationState = {
  tree: TreeNode;
  appearance: TreeAppearance;
  nodeFields: NodeFieldVisibility;
  summaries: NodeSummaryMap;
  summaryCount: number;
  datasetName: string;
  targetName?: string;
  distribution?: DistributionSnapshot;
};

export const PRESENTATION_CHANNEL = "controltree-presentation";
export const PRESENTATION_STORAGE_KEY = "controltree:presentation-state";

export function presentationTree(node: TreeNode): TreeNode {
  const { rowIndices: _rowIndices, ...safeNode } = node;
  return {
    ...safeNode,
    children: node.children.map(presentationTree),
  };
}

export function publishPresentation(state: PresentationState): void {
  localStorage.setItem(PRESENTATION_STORAGE_KEY, JSON.stringify(state));
  const channel = new BroadcastChannel(PRESENTATION_CHANNEL);
  channel.postMessage(state);
  channel.close();
}

export function presenterUrl(currentUrl: string): string {
  const url = new URL(currentUrl);
  url.searchParams.set("view", "present");
  url.hash = "";
  return url.toString();
}

export function openPresentationWindow(state: PresentationState): void {
  publishPresentation(state);
  window.open(presenterUrl(window.location.href), "controltree-presentation", "popup=yes,width=1400,height=900");
}
