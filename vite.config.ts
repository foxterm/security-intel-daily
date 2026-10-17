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
        // Copy index.json
        const indexPath = path.join(dataDir, 'index.json');
        if (fs.existsSync(indexPath)) {
          fs.copyFileSync(indexPath, path.join(distDataDir, 'index.json'));
        }
        // Copy date directories
        for (const entry of fs.readdirSync(dataDir)) {
          const srcPath = path.join(dataDir, entry);
          const stat = fs.statSync(srcPath);
          if (stat.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry)) {
            const destDir = path.join(distDataDir, entry);
            fs.mkdirSync(destDir, { recursive: true });
            for (const file of fs.readdirSync(srcPath)) {
              if (file.endsWith('.json')) {
                fs.copyFileSync(path.join(srcPath, file), path.join(destDir, file));
              }
            }
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
