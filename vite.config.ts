import path from 'path';
import { execSync } from 'child_process';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** The commit being built: Render's RENDER_GIT_COMMIT (passed into the Docker build), else git, else none. */
const buildCommit = (() => {
    const fromEnv = (process.env.RENDER_GIT_COMMIT || '').trim();
    if (fromEnv) return fromEnv.slice(0, 7);
    try { return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; }
})();

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      build: {
        // Keeps the build within small build machines (e.g. Render's 512 MB): skip the gzip size report.
        reportCompressedSize: false,
        // Run on older phones too (iOS 13+ Safari, Android Chrome 80+), not only 2022+ browsers.
        target: ['es2019', 'safari13', 'chrome80', 'firefox78', 'edge88'],
        cssTarget: ['safari13', 'chrome80'],
      },
      define: {
        // Shown in the account menu so staff can confirm which version is running after a deploy.
        __APP_BUILD__: JSON.stringify((buildCommit ? `${buildCommit} · ` : '') + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
