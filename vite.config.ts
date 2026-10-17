import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as fs from 'node:fs';
import * as path from 'node:path';

function copyDataPlugin() {
  return {
    name: 'copy-data',
    writeBundle() {
      const dataDir = path.resolve('data');
      const distDataDir = path.resolve('dist/data');
      if (fs.existsSync(dataDir)) {
        fs.mkdirSync(distDataDir, { recursive: true });
        for (const file of fs.readdirSync(dataDir)) {
          if (file.endsWith('.json')) {
            fs.copyFileSync(path.join(dataDir, file), path.join(distDataDir, file));
          }
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyDataPlugin()],
  base: './',
});
