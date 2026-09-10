import type { TreeAppearance } from "./tree-settings";

function pageStyles(): string {
  return [...document.styleSheets].map((sheet) => {
    try {
      return [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
    } catch {
      return "";
    }
  }).join("\n");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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
  const width = Math.ceil(Math.max(treeElement.scrollWidth, treeElement.offsetWidth)) + padding * 2;
  const height = Math.ceil(Math.max(treeElement.scrollHeight, treeElement.offsetHeight)) + padding * 2;
  const clone = treeElement.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".node-card--selected").forEach((node) => node.classList.remove("node-card--selected"));
  const grid = appearance.showGrid
    ? "background-image:radial-gradient(circle,rgba(117,128,120,.32) 1px,transparent 1px);background-size:22px 22px;"
    : "";
  const computedTreeStyle = getComputedStyle(treeElement);
  const variables = [
    `--tree-node-color:${appearance.nodeColor}`,
    `--tree-accent-color:${appearance.accentColor}`,
    `--tree-connector-color:${appearance.connectorColor}`,
    `--tree-background-color:${appearance.backgroundColor}`,
    `--summary-count:${computedTreeStyle.getPropertyValue("--summary-count") || "0"}`,
    `--visible-field-count:${computedTreeStyle.getPropertyValue("--visible-field-count") || "2"}`,
  ].join(";");
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <foreignObject width="100%" height="100%">
      <div xmlns="http://www.w3.org/1999/xhtml" style="${escapeAttribute(`${variables};width:${width}px;height:${height}px;padding:${padding}px;box-sizing:border-box;background-color:${appearance.backgroundColor};${grid}`)}">
        <style>${pageStyles().replace(/<\/style/gi, "<\\/style")}</style>
        ${clone.outerHTML}
      </div>
    </foreignObject>
  </svg>`;
  const svgBlob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  const image = new Image();
  image.decoding = "async";
  image.src = svgUrl;
  await image.decode();

  const scale = Math.min(2, 12000 / width, 12000 / height, Math.sqrt(64_000_000 / (width * height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not create the tree image.");
  context.scale(scale, scale);
  context.drawImage(image, 0, 0, width, height);
  URL.revokeObjectURL(svgUrl);
  const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The tree image could not be created.")), "image/png"));
  const stem = datasetName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-") || "tree";
  const fileName = `${stem}-tree.png`;
  downloadBlob(png, fileName);
  return fileName;
}
