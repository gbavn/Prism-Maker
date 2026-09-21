import { contextBridge, ipcRenderer } from "electron";
import { IPC, type PrismApi } from "../shared/ipc.js";

const api: PrismApi = {
  openProject: (root) => ipcRenderer.invoke(IPC.openProject, root),
  openMap: (root, id) => ipcRenderer.invoke(IPC.openMap, root, id),
  buildScene: (root, id, heights, tiles, objects) =>
    ipcRenderer.invoke(IPC.buildScene, root, id, heights, tiles, objects),
  saveTiles: (root, id, tiles) =>
    ipcRenderer.invoke(IPC.saveTiles, root, id, tiles),
  saveElevation: (root, id, heights) =>
    ipcRenderer.invoke(IPC.saveElevation, root, id, heights),
  confirmSave: (mapName) => ipcRenderer.invoke(IPC.confirmSave, mapName),
  playtest: (root) => ipcRenderer.invoke(IPC.playtest, root),
  bakeObject: (root, name, png) =>
    ipcRenderer.invoke(IPC.bakeObject, root, name, png),
  listModels: (root) => ipcRenderer.invoke(IPC.listModels, root),
  saveObjects: (root, id, objects) =>
    ipcRenderer.invoke(IPC.saveObjects, root, id, objects),
};

contextBridge.exposeInMainWorld("prism", api);
