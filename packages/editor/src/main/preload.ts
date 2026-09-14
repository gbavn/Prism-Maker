import { contextBridge, ipcRenderer } from "electron";
import { IPC, type PrismApi } from "../shared/ipc.js";

const api: PrismApi = {
  openProject: (root) => ipcRenderer.invoke(IPC.openProject, root),
  openMap: (root, id) => ipcRenderer.invoke(IPC.openMap, root, id),
  buildScene: (root, id, heights) =>
    ipcRenderer.invoke(IPC.buildScene, root, id, heights),
  saveElevation: (root, id, heights) =>
    ipcRenderer.invoke(IPC.saveElevation, root, id, heights),
};

contextBridge.exposeInMainWorld("prism", api);
