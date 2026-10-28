// Electron-обёртка: запускает встроенный сервер и открывает игру в окне приложения.
import path from 'node:path';
import { app, BrowserWindow, shell } from 'electron';
import { startServer } from '../server/app';

const DEV_URL = process.env.VITE_DEV_URL; // например http://localhost:5173 при разработке

async function createWindow() {
  process.env.LOGISIM_DATA_DIR = app.getPath('userData');

  let url: string;
  if (DEV_URL) {
    await startServer(3001); // Vite проксирует /api на этот порт
    url = DEV_URL;
  } else {
    const port = await startServer(0, path.join(app.getAppPath(), 'dist'));
    url = `http://127.0.0.1:${port}`;
  }

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 720,
    title: 'LogiSim',
    backgroundColor: '#0f1419',
    autoHideMenuBar: true,
    icon: path.join(app.getAppPath(), 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // внешние ссылки (например, сайты ИИ-провайдеров) открываем в обычном браузере
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    void shell.openExternal(target);
    return { action: 'deny' };
  });

  await win.loadURL(url);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
