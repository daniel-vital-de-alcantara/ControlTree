import type { TreeAppearance } from "./tree-settings";

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function downloadTreePng(treeElement: HTMLElement, appearance: TreeAppearance, datasetName: string): Promise<string> {
  const padding = 48;
  const computedTreeStyle = getComputedStyle(treeElement);
  const clone = treeElement.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".node-card--selected, .node-card--keyboard-focused").forEach((node) => {
    node.classList.remove("node-card--selected", "node-card--keyboard-focused");
  });

  const exportSurface = document.createElement("div");
  exportSurface.setAttribute("aria-hidden", "true");
  exportSurface.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    "z-index:-2147483647",
    "display:inline-block",
    `padding:${padding}px`,
    "box-sizing:border-box",
    `background-color:${appearance.backgroundColor}`,
    appearance.showGrid
      ? "background-image:radial-gradient(circle,rgba(117,128,120,.32) 1px,transparent 1px);background-size:22px 22px"
      : "background-image:none",
  ].join(";");
  exportSurface.style.setProperty("--tree-node-color", appearance.nodeColor);
  exportSurface.style.setProperty("--tree-accent-color", appearance.accentColor);
  exportSurface.style.setProperty("--tree-connector-color", appearance.connectorColor);
  exportSurface.style.setProperty("--tree-background-color", appearance.backgroundColor);
  exportSurface.style.setProperty("--tree-font-scale", String(appearance.fontScale));
  exportSurface.style.setProperty("--tree-spacing", String(appearance.nodeSpacing));
  exportSurface.style.setProperty("--summary-count", computedTreeStyle.getPropertyValue("--summary-count") || "0");
  exportSurface.style.setProperty("--visible-field-count", computedTreeStyle.getPropertyValue("--visible-field-count") || "2");
  exportSurface.appendChild(clone);
  document.body.appendChild(exportSurface);

  try {
    await document.fonts?.ready;
    const { default: html2canvas } = await import("html2canvas");
    const width = Math.ceil(Math.max(clone.scrollWidth, clone.offsetWidth)) + padding * 2;
    const height = Math.ceil(Math.max(clone.scrollHeight, clone.offsetHeight)) + padding * 2;
    exportSurface.style.width = `${width}px`;
    exportSurface.style.height = `${height}px`;
    const scale = Math.min(2, 12000 / width, 12000 / height, Math.sqrt(64_000_000 / (width * height)));
    const canvas = await html2canvas(exportSurface, {
      backgroundColor: appearance.backgroundColor,
      logging: false,
      scale,
      useCORS: true,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
    });
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("The tree image could not be created.")),
      "image/png",
    ));
    const stem = datasetName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-") || "tree";
    const fileName = `${stem}-tree.png`;
    downloadBlob(png, fileName);
    return fileName;
  } finally {
    exportSurface.remove();
  }
}
