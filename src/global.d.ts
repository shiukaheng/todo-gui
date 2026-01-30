import { GraphExplorationUpdate } from "@/common/app_types/discoveryTypes";

type ExpandNodeUpdate = GraphExplorationUpdate & { 
  requestUUID: string;
  type?: 'final' | 'error';
  error?: {
    name: string;
    message: string;
    stack: string;
  };
};

declare global {
  interface Window {
    api: {
      expandNode: (nodeId: string, requestUUID: string) => Promise<void>;
      abortExpandNode: (requestUUID: string) => void;
      receiveExpandNodeUpdates: (callback: (update: ExpandNodeUpdate) => void) => void;
      removeExpandNodeUpdateListener: (callback: (update: ExpandNodeUpdate) => void) => void;
      saveFile: (filePath: string, content: unknown) => Promise<{ success: boolean; error?: string }>;
      saveFileAs: (content: unknown) => Promise<{ success: boolean; filePath?: string; message?: string; error?: string }>;
      openFile: () => Promise<{ success: boolean; content?: unknown; filePath?: string; message?: string; error?: string }>;
      receiveProjectLoad: (callback: (project: Project) => void) => (event: Electron.IpcRendererEvent, project: Project) => void;
      removeProjectLoadListener: (wrappedCallback: (event: Electron.IpcRendererEvent, project: Project) => void) => void;
    };
  }
}

export {};
