// Сборка серверной части и Electron main-процесса в CommonJS-бандлы.
import { build } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  packages: 'external',
  sourcemap: false,
  logLevel: 'info',
};

await build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.cjs', external: ['electron'] });
await build({ ...common, entryPoints: ['server/standalone.ts'], outfile: 'dist-server/server.cjs' });
