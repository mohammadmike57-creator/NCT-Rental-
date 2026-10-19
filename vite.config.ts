import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

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
        __APP_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
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
