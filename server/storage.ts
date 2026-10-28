// Хранение настроек и автосохранения в JSON-файлах.
// В Electron папка данных — userData приложения, в браузерном режиме — ./data.
import fs from 'node:fs';
import path from 'node:path';

export function dataDir(): string {
  const dir = process.env.LOGISIM_DATA_DIR || path.join(process.cwd(), 'data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJson<T>(name: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir(), name), 'utf8')) as T;
  } catch {
    return null;
  }
}

export function writeJson(name: string, value: unknown) {
  const file = path.join(dataDir(), name);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}

export function removeFile(name: string) {
  try {
    fs.unlinkSync(path.join(dataDir(), name));
  } catch {
    /* файла нет — ничего страшного */
  }
}
