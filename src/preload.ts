// Simplified preload script - minimal IPC exposure
// Currently empty, but structure preserved for future use

import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('api', {
    // API methods will be added here as needed
});
