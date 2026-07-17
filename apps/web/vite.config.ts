import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons';

export default defineConfig(({ mode }) => {
  // Prefer repo-root / apps/web env; support both GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_ID
  const envWeb = loadEnv(mode, path.resolve(__dirname), '');
  const envRoot = loadEnv(mode, path.resolve(__dirname, '../..'), '');
  const googleClientId =
    envWeb.GOOGLE_CLIENT_ID ||
    envWeb.VITE_GOOGLE_CLIENT_ID ||
    envRoot.GOOGLE_CLIENT_ID ||
    envRoot.VITE_GOOGLE_CLIENT_ID ||
    '';

  return {
    plugins: [
      react(),
      createSvgIconsPlugin({
        iconDirs: [path.resolve(__dirname, 'src/assets/svg')],
        symbolId: 'icon-[dir]-[name]',
        inject: 'body-last',
        customDomId: '__svg__icons__dom__',
        svgoOptions: {
          plugins: [
            {
              name: 'preset-default',
              params: {
                overrides: {
                  removeViewBox: false,
                },
              },
            },
            {
              name: 'convertColors',
              params: { currentColor: true },
            },
          ],
        },
      }),
    ],
    define: {
      __GOOGLE_CLIENT_ID__: JSON.stringify(googleClientId),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@agent-skills': path.resolve(__dirname, 'agent-skills'),
      },
    },
    server: {
      port: 3000,
      open: true,
      fs: {
        allow: [path.resolve(__dirname), path.resolve(__dirname, 'agent-skills')],
      },
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
