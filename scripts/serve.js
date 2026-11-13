// 本機預覽：port 自動取得空閒的，啟動後打開瀏覽器。伺服器本體在 server.js。
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { exec } from 'node:child_process';
import { createAppServer } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = createAppServer({ root });

server.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log(`Dinner slot running at ${url}`);
  console.log('Close this window to stop.');
  if (!process.env.NO_OPEN) {
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd);
  }
});
