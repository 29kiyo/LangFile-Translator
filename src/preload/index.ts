import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type Api } from '@shared/types'

const api: Api = {
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (patch) => ipcRenderer.invoke(IPC.setSettings, patch),
  getLocale: () => ipcRenderer.invoke(IPC.getLocale),
  onCommandLog: (cb) => {
    ipcRenderer.on(IPC.commandLog, (_e, text: string) => cb(text))
  }
}

contextBridge.exposeInMainWorld('api', api)
