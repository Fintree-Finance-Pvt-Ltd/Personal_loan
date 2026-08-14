import process from 'node:process';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const rawTarget = env.VITE_API_BASE_URL || 'http://localhost:3000';
  const backendHost = rawTarget.replace(/\/api\/*$/, '');

  return {
    plugins: [react()],

    server: {
      port: 5173,
      strictPort: true,

      proxy: {
        '/api': {
          target: backendHost,
          changeOrigin: true,
          secure: false,
        },
      },
    },

    build: {
      rollupOptions: {
        output: {
          // Split rarely-changing vendor code from app code so a deploy that only
          // touches app logic doesn't invalidate the browser cache for React/router/
          // form/icon libraries too — returning users re-download just the small chunk.
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
            'vendor-icons': ['lucide-react'],
          },
        },
      },
    },
  };
});
