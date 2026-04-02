import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {

  const env = loadEnv(mode || 'development', process.cwd(), '');
  
  return {
    server: {
      port: 3000,
      host: true,
      allowedHosts: ['localhost', '127.0.0.1', 'ziyasuite.com'],
      proxy: {
        '/api': {
          target: env.VITE_API_BASE_URL,
          changeOrigin: true,
          secure: false,
        }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname),
      }
    },
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(env.VITE_API_BASE_URL),
      'import.meta.env.VITE_API_PATH': JSON.stringify(env.VITE_API_PATH),
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'import.meta.env.VITE_ELEVEN_LABS_API_KEY': JSON.stringify(env.ELEVEN_LABS_API_KEY),
      'import.meta.env.VITE_DEEPGRAM_API_KEY': JSON.stringify(env.DEEPGRAM_API_KEY),
    }
  };
});