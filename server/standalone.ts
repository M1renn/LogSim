// Запуск сервера без Electron: для разработки и демонстрации в браузере.
import path from 'node:path';
import { startServer } from './app';

const port = Number(process.env.PORT || 3001);
const staticDir = path.resolve(process.cwd(), 'dist');

startServer(port, staticDir).then((p) => {
  console.log(`LogiSim сервер: http://127.0.0.1:${p}`);
});
