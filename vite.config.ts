import react from '@vitejs/plugin-react';
import fs from 'fs';
import { pathToFileURL } from 'url';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const WINDOWS_RETRYABLE_CODES = new Set(['EBUSY', 'EPERM']);
const SOURCE_FILE_RETRY_PATTERN = /\.(css|js|jsx|json|ts|tsx)$/i;

function normalizeFilePath(filePath: string) {
  return filePath.replace(/\\/g, '/');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readFileWithRetry(filePath: string, attempts = 6) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code || '';
      if (!WINDOWS_RETRYABLE_CODES.has(code) || attempt === attempts - 1) {
        throw error;
      }
      await sleep(80 * (attempt + 1));
    }
  }

  throw new Error(`Unable to read ${filePath}`);
}

function createJsonResponse(res: any) {
  let statusCode = 200;
  return {
    status(code: number) {
      statusCode = code;
      res.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      if (!res.headersSent) {
        res.statusCode = statusCode;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify(payload));
    },
    setHeader(name: string, value: string) {
      res.setHeader(name, value);
    },
  };
}

function localApiPlugin(): Plugin {
  return {
    name: 'local-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const reqUrl = req.url || '';
        if (!reqUrl.startsWith('/api/')) {
          next();
          return;
        }

        const cleanPath = reqUrl.split('?')[0];
        let routedPath = cleanPath;
        if (cleanPath.startsWith('/api/scorm-content-file/')) {
          const rest = cleanPath.slice('/api/scorm-content-file/'.length);
          const [packageId = '', ...pathParts] = rest.split('/');
          const filePath = pathParts.join('/') || 'index_lms.html';
          req.url = `/api/scorm-content?packageId=${encodeURIComponent(decodeURIComponent(packageId))}&path=${encodeURIComponent(decodeURIComponent(filePath))}`;
          routedPath = '/api/scorm-content';
        }
        const apiPath = path.resolve(__dirname, `.${routedPath}.js`);
        if (!fs.existsSync(apiPath)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: false, error: `Local API not found: ${routedPath}` }));
          return;
        }

        try {
          const moduleUrl = `${pathToFileURL(apiPath).href}?t=${Date.now()}`;
          const mod = await import(moduleUrl);
          const handler = mod.default;

          if (typeof handler !== 'function') {
            throw new Error(`API handler is invalid for ${cleanPath}`);
          }

          (res as any).status = (code: number) => {
            res.statusCode = code;
            return createJsonResponse(res).status(code);
          };
          (res as any).json = (payload: unknown) => createJsonResponse(res).json(payload);

          await handler(req, res);
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      });
    },
  };
}

function suniSpaFallbackPlugin(): Plugin {
  return {
    name: 'suni-spa-fallback',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const reqUrl = req.url || '';
        const cleanPath = decodeURIComponent(reqUrl.split('?')[0] || '');

        if (!cleanPath.startsWith('/suni/vdiscussion/')) {
          next();
          return;
        }

        const publicRoot = path.resolve(__dirname, 'public');
        const requestedFile = path.resolve(publicRoot, `.${cleanPath}`);
        if (!requestedFile.startsWith(publicRoot)) {
          res.statusCode = 400;
          res.end('Invalid Suni asset path');
          return;
        }

        try {
          const stats = await fs.promises.stat(requestedFile);
          if (stats.isFile()) {
            next();
            return;
          }
        } catch {
          // Route fallback below.
        }

        const suniIndex = path.resolve(publicRoot, 'suni/vdiscussion/index.html');
        try {
          const html = await fs.promises.readFile(suniIndex, 'utf8');
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

function windowsLockedFileRetryPlugin(rootDir: string): Plugin {
  const normalizedRoot = normalizeFilePath(path.resolve(rootDir));

  return {
    name: 'windows-locked-file-retry',
    enforce: 'pre',
    async load(id) {
      if (process.platform !== 'win32') return null;
      if (!id || id.startsWith('\0')) return null;

      const filePath = id.split('?')[0];
      const normalizedFilePath = normalizeFilePath(filePath);

      if (!normalizedFilePath.startsWith(`${normalizedRoot}/`)) return null;
      if (normalizedFilePath.includes('/node_modules/')) return null;
      if (!SOURCE_FILE_RETRY_PATTERN.test(normalizedFilePath)) return null;

      try {
        const stats = await fs.promises.stat(filePath);
        if (!stats.isFile()) return null;
      } catch {
        return null;
      }

      return readFileWithRetry(filePath);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isWindows = process.platform === 'win32';
  Object.assign(process.env, env);

  return {
    plugins: [windowsLockedFileRetryPlugin(__dirname), react(), suniSpaFallbackPlugin(), localApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('xlsx')) return 'vendor-xlsx';
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('@tanstack/react-query')) return 'vendor-query';
            if (id.includes('react-router')) return 'vendor-router';
            if (id.includes('react-dom') || id.includes('react')) return 'vendor-react';
            return undefined;
          },
        },
      },
    },
    server: {
      proxy: {
        '/vuni-api': {
          target: 'https://vuniversity-api.southeastasia.cloudapp.azure.com',
          changeOrigin: true,
          secure: true,
          rewrite: (requestPath) => requestPath.replace(/^\/vuni-api/, '/api'),
        },
        '/vuniversity': {
          target: 'https://vuniversity.vercel.app',
          changeOrigin: true,
          secure: true,
        },
      },
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: isWindows
        ? {
            // Windows editors can briefly hard-lock large TSX files while saving.
            awaitWriteFinish: {
              stabilityThreshold: 350,
              pollInterval: 100,
            },
          }
        : undefined,
    },
  };
});
