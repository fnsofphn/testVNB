import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const bundled = path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const python = process.env.VCOACHING_PYTHON || (existsSync(bundled) ? bundled : 'python');
const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1',
  PYTHONPATH: [path.join(root, '.cache/vcoaching-deps'), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) };
const worker = spawn(python, ['vcoaching/server.py'], { cwd: root, env, stdio: 'inherit', windowsHide: true });
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '3000', '--strictPort'], { cwd: root, env, stdio: 'inherit', windowsHide: true });
const stop = () => { worker.kill(); vite.kill(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
worker.on('error', e => { console.error(e.message); stop(); });
worker.on('exit', code => { if (code) { console.error('V-Coaching worker stopped. Install vcoaching/requirements.txt with the configured Python.'); vite.kill(); } });
vite.on('exit', () => worker.kill());
