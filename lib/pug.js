import {readFileSync} from 'fs';
import {dirname, join} from 'path';
import {compile} from 'pug';
import {fileURLToPath} from 'url';

function getDirName() {
  const __filename = fileURLToPath(import.meta.url);
  return dirname(__filename);
}

const pages = join(getDirName(), '..', 'www');

const cache = {};

export function sendPug(res, page, locals) {
  if (!(page in cache)) {
    const file = join(pages, `${page}.pug`);
    const fn = compile(readFileSync(file), {filename: file});
    cache[page] = fn;
  }
  const html = cache[page](locals);
  res.send(html);
}
