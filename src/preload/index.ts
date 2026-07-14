import { contextBridge, ipcRenderer } from 'electron'

export interface DbStatus {
  connected: boolean
  tableCount: number
  tables: string[]
}

const api = {
  getDbStatus: (): Promise<DbStatus> => ipcRenderer.invoke('db:status')
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
