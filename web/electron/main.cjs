const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const applicationPage = path.join(__dirname, "..", "dist", "index.html");

function secureWindowOptions() {
  return {
    width: 1500,
    height: 960,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: "#f4f2ec",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  };
}

ipcMain.handle("controltree:save-project", async (event, payload) => {
  if (!payload || typeof payload.contents !== "string" || typeof payload.suggestedName !== "string") {
    throw new Error("The project save request was invalid.");
  }
  const parent = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(parent, {
    title: "Save ControlTree project",
    defaultPath: payload.suggestedName,
    buttonLabel: "Save project",
    filters: [{ name: "ControlTree project", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, payload.contents, "utf8");
  return path.basename(result.filePath);
});

function createMainWindow() {
  const window = new BrowserWindow(secureWindowOptions());
  window.loadFile(applicationPage);
}

app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("file:") && url.includes("view=present")) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          ...secureWindowOptions(),
          width: 1400,
          height: 900,
        },
      };
    }
    if (url.startsWith("https:")) shell.openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file:")) {
      event.preventDefault();
      if (url.startsWith("https:")) shell.openExternal(url);
    }
  });
});

app.whenReady().then(() => {
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
