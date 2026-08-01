import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const rawTarget = env.VITE_API_BASE_URL || 'http://localhost:3005';
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
  };
});
