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
  const docsUrl = (
    envWeb.VITE_DOCS_URL ||
    envRoot.VITE_DOCS_URL ||
    (mode === 'development' ? 'http://localhost:5175' : 'https://docs.recombyn.com')
  ).replace(/\/$/, '');

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
                  // Keep multi-color brand marks (logo_mark) intact.
                  convertColors: false,
                },
              },
            },
            // Monochrome UI icons already use currentColor in source.
          ],
        },
      }),
    ],
    define: {
      __GOOGLE_CLIENT_ID__: JSON.stringify(googleClientId),
      __DOCS_URL__: JSON.stringify(docsUrl),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
      // Prefer TS sources — leftover/cached `.js` URLs must not 404 after sibling emits were removed.
      extensions: ['.mjs', '.mts', '.ts', '.tsx', '.jsx', '.js', '.json'],
      extensionAlias: {
        '.js': ['.ts', '.tsx', '.js', '.jsx'],
        '.jsx': ['.tsx', '.jsx'],
      },
    },
    optimizeDeps: {
      include: ['fontkit'],
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@ffmpeg/core'],
    },
    assetsInclude: ['**/*.wasm'],
    server: {
      port: 3000,
      open: true,
      fs: {
        allow: [path.resolve(__dirname), path.resolve(__dirname, '../..')],
      },
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
          // 0 = no limit (http-proxy skips setTimeout when falsy). Design SSE can run many minutes.
          timeout: 0,
          proxyTimeout: 0,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
