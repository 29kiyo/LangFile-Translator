import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type Api } from '@shared/types'

const api: Api = {
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (patch) => ipcRenderer.invoke(IPC.setSettings, patch),
  getLocale: () => ipcRenderer.invoke(IPC.getLocale),
  testProvider: (p) => ipcRenderer.invoke(IPC.testProvider, p),
  getOutputDir: () => ipcRenderer.invoke(IPC.getOutputDir),
  openFiles: () => ipcRenderer.invoke(IPC.openFiles),
  chooseDir: () => ipcRenderer.invoke(IPC.chooseDir),
  saveFile: (name, content) => ipcRenderer.invoke(IPC.saveFile, name, content),
  onCommandLog: (cb) => {
    ipcRenderer.on(IPC.commandLog, (_e, text: string) => cb(text))
  }
}

contextBridge.exposeInMainWorld('api', api)
