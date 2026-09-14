import { contextBridge, ipcRenderer } from "electron";
import { IPC, type PrismApi } from "../shared/ipc.js";

const api: PrismApi = {
  openProject: (root) => ipcRenderer.invoke(IPC.openProject, root),
  openMap: (root, id) => ipcRenderer.invoke(IPC.openMap, root, id),
};

contextBridge.exposeInMainWorld("prism", api);
