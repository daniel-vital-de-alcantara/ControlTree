const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("controlTreeDesktop", {
  saveProject: (contents, suggestedName) => ipcRenderer.invoke(
    "controltree:save-project",
    { contents, suggestedName },
  ),
});
