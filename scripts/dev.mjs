import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const commands = [
  { name: 'api', cwd: resolve(root, 'server'), args: ['--watch', 'src/index.js'] },
  { name: 'web', cwd: resolve(root, 'client'), args: ['../node_modules/vite/bin/vite.js', '--host', '127.0.0.1'] },
];
const children = commands.map(({ name, cwd, args }) => {
  process.stdout.write(`[${name}] starting\n`);
  return spawn(process.execPath, args, { cwd, stdio: 'inherit' });
});
for (const child of children) {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      for (const other of children) if (other !== child) other.kill();
      process.exitCode = code;
    }
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
    process.exit(0);
  });
}
