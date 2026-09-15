import { contextBridge, ipcRenderer } from "electron";
import { IPC, type PrismApi } from "../shared/ipc.js";

const api: PrismApi = {
  openProject: (root) => ipcRenderer.invoke(IPC.openProject, root),
  openMap: (root, id) => ipcRenderer.invoke(IPC.openMap, root, id),
  buildScene: (root, id, heights, tiles) =>
    ipcRenderer.invoke(IPC.buildScene, root, id, heights, tiles),
  saveTiles: (root, id, tiles) =>
    ipcRenderer.invoke(IPC.saveTiles, root, id, tiles),
  saveElevation: (root, id, heights) =>
    ipcRenderer.invoke(IPC.saveElevation, root, id, heights),
  confirmSave: (mapName) => ipcRenderer.invoke(IPC.confirmSave, mapName),
  playtest: (root) => ipcRenderer.invoke(IPC.playtest, root),
  placeObject: (root, id, object, png) =>
    ipcRenderer.invoke(IPC.placeObject, root, id, object, png),
};

contextBridge.exposeInMainWorld("prism", api);
