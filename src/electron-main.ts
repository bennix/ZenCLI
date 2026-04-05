// ============================================================
// zen-cli  —  Electron Main Process
// ============================================================
// Creates a native window that loads the built-in web server.
// Falls back gracefully if Electron is not available.

import { app, BrowserWindow, Menu, dialog, shell } from 'electron';
import { getUserConfigDir, loadConfig, validateConfig } from './config.js';
import { DEFAULT_APP_PORT, startWebServerWithFallback } from './server-bootstrap.js';
import { applyShellEnvironmentToProcess } from './core/shell-environment.js';
import { WebServer } from './ui/web-server.js';

const ABOUT_TITLE = 'About zen-cli';
const ABOUT_DETAIL = [
  '版权所有 2026（c）',
].join('\n');

let mainWindow: BrowserWindow | null = null;
let server: WebServer | null = null;

async function showAboutDialog(): Promise<void> {
  await dialog.showMessageBox({
    type: 'info',
    title: ABOUT_TITLE,
    message: 'zen-cli',
    detail: ABOUT_DETAIL,
    buttons: ['OK'],
    defaultId: 0,
    noLink: true,
  });
}

async function triggerNewConversation(): Promise<void> {
  if (!mainWindow) return;
  await mainWindow.webContents.executeJavaScript(
    'typeof window.startNewConversation === "function" ? window.startNewConversation() : undefined',
    true,
  );
}

async function createWindow(): Promise<void> {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return;
  }

  await applyShellEnvironmentToProcess();

  // Load config
  const config = loadConfig();
  const errors = validateConfig(config);

  if (errors.length > 0) {
    console.error('Configuration errors:', errors.join('\n'));
    app.quit();
    return;
  }

  // Start web server
  server = new WebServer(config);
  const { providers, active, port } = await startWebServerWithFallback(server, DEFAULT_APP_PORT);

  console.log(`[zen-cli] Active provider: ${active.name} (${active.model})`);
  console.log(`[zen-cli] UI server: http://127.0.0.1:${port}`);
  for (const p of providers) {
    console.log(`  ${p.name}: ${p.available ? 'available' : 'unavailable'}`);
  }

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    minWidth: 600,
    minHeight: 400,
    title: 'zen-cli',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 12, y: 10 },
    backgroundColor: '#1a1b26',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Wire window control buttons from web UI
  server.setWindowActionHandler((action) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    switch (action) {
      case 'minimize':
        mainWindow.minimize();
        break;
      case 'toggle-maximize':
        if (mainWindow.isMaximized()) {
          mainWindow.unmaximize();
        } else {
          mainWindow.maximize();
        }
        break;
      case 'close':
        mainWindow.close();
        break;
    }
  });

  // Keep external links out of the app window and open them in the user's browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL() ?? '';
    if (url !== currentUrl && /^https?:\/\//i.test(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  // Build a minimal menu
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'New Conversation',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            void triggerNewConversation();
          },
        },
        { type: 'separator' },
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            await server?.showNativeFolderDialog('open');
          },
        },
        {
          label: 'New Folder...',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: async () => {
            await server?.showNativeFolderDialog('create');
          },
        },
        { type: 'separator' },
        {
          label: 'Open Config Folder',
          click: () => {
            shell.openPath(getUserConfigDir());
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About zen-cli',
          click: () => {
            void showAboutDialog();
          },
        },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);

  // Load the web UI
  await mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Electron lifecycle
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(createWindow);
}

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    void createWindow();
  }
});

app.on('before-quit', () => {
  if (server) {
    void server.stop().catch((error) => {
      console.error('[zen-cli] Failed to stop web server:', error);
    });
  }
});
