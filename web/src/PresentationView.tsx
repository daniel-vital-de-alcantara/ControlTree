import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  PRESENTATION_CHANNEL,
  PRESENTATION_STORAGE_KEY,
  type PresentationState,
} from "./presentation";
import { TreeCanvas } from "./TreeCanvas";
import { defaultAppearance, defaultNodeFields } from "./tree-settings";
import { DistributionResults } from "./DistributionPane";
import { shortcutForEvent } from "./keyboard-shortcuts";

function readInitialState(): PresentationState | null {
  const stored = localStorage.getItem(PRESENTATION_STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as PresentationState;
  } catch {
    return null;
  }
}

export function PresentationView({ onExit }: { onExit?: () => void } = {}) {
  const [state, setState] = useState<PresentationState | null>(readInitialState);
  const [zoom, setZoom] = useState(1);
  const [controlIndex, setControlIndex] = useState(0);
  const controlsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const channel = new BroadcastChannel(PRESENTATION_CHANNEL);
    channel.onmessage = (event: MessageEvent<PresentationState>) => setState(event.data);
    function handleStorage(event: StorageEvent) {
      if (event.key === PRESENTATION_STORAGE_KEY && event.newValue) {
        setState(JSON.parse(event.newValue) as PresentationState);
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => {
      channel.close();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      const shortcut = shortcutForEvent(event, "presentation");
      if (!shortcut) return;
      event.preventDefault();
      if (shortcut.id === "zoom-in") setZoom((value) => Math.min(1.5, value + .1));
      if (shortcut.id === "zoom-out") setZoom((value) => Math.max(.5, value - .1));
      if (shortcut.id === "fit") setZoom(1);
      if (shortcut.id === "escape") {
        if (onExit) onExit();
        else if (document.fullscreenElement) void document.exitFullscreen();
      }
    }
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [onExit]);

  function moveControls(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    if (!controls.length) return;
    event.preventDefault();
    const active = Math.max(0, controls.findIndex((button) => button === document.activeElement));
    const next = event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1 : (active + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + controls.length) % controls.length;
    setControlIndex(next);
    controls[next].focus();
  }

  if (!state) {
    return <main className="presentation-empty">Open presentation mode from the ControlTree editor.</main>;
  }

  const style = {
    "--tree-node-color": state.appearance.nodeColor,
    "--tree-accent-color": state.appearance.accentColor,
    "--tree-connector-color": state.appearance.connectorColor,
    "--tree-background-color": state.appearance.backgroundColor ?? defaultAppearance.backgroundColor,
    "--tree-grid-opacity": (state.appearance.showGrid ?? defaultAppearance.showGrid) ? .32 : 0,
    "--summary-count": state.summaryCount,
    "--visible-field-count": [
      (state.nodeFields ?? defaultNodeFields).nodeName,
      (state.nodeFields ?? defaultNodeFields).nodeTitle,
      (state.nodeFields ?? defaultNodeFields).rowCount,
    ].filter(Boolean).length,
    "--presentation-zoom": zoom,
  } as CSSProperties;

  return (
    <div className="presentation" style={style}>
      <header className="presentation__header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">⌁</span>
          ControlTree
        </div>
        <div className="presentation__context">
          <strong>{state.datasetName}</strong>
          {state.targetName && <span>Recommendation target: {state.targetName}</span>}
        </div>
        <div className="presentation__live"><span /> Live</div>
        <div ref={controlsRef} className="presentation__controls keyboard-region" data-keyboard-region="presentation-controls" role="toolbar" aria-label="Presentation controls" onKeyDown={moveControls}>
          <button tabIndex={controlIndex === 0 ? 0 : -1} onFocus={() => setControlIndex(0)} type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(.5, value - .1))}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button tabIndex={controlIndex === 1 ? 0 : -1} onFocus={() => setControlIndex(1)} type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.5, value + .1))}>+</button>
          <button tabIndex={controlIndex === 2 ? 0 : -1} onFocus={() => setControlIndex(2)} type="button" onClick={() => document.documentElement.requestFullscreen()}>Full screen</button>
          {onExit && <button tabIndex={controlIndex === 3 ? 0 : -1} onFocus={() => setControlIndex(3)} type="button" onClick={onExit}>Back to editor</button>}
        </div>
      </header>
      <div className={`presentation__stage${state.distribution ? " presentation__stage--split" : ""}`}>
        <main className={`presentation__canvas${state.distribution ? " presentation__canvas--with-distribution" : ""}`}>
          <div className="canvas__grid" />
          <div className="presentation__tree">
            <TreeCanvas
              node={state.tree}
              selectedNodeId={state.distribution?.nodeId ?? ""}
              keyboardFocusedNodeId=""
              onSelectNode={() => undefined}
              summaries={state.summaries}
              nodeFields={state.nodeFields ?? defaultNodeFields}
            />
          </div>
        </main>
        {state.distribution && (
          <section className="presentation-distribution">
            <div className="presentation-distribution__heading">
              <div>
                <p className="kicker">Node {state.distribution.nodeId} · {state.distribution.nodeSamples.toLocaleString()} rows</p>
                <h2>{state.distribution.variable}</h2>
              </div>
              <span>{state.distribution.numeric ? "Histogram" : "Value distribution"}</span>
            </div>
            <div className="presentation-distribution__body">
              <DistributionResults snapshot={state.distribution} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
