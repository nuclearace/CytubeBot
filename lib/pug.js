const pug = require('pug');
const fs = require('fs');
const path = require('path');
const pages = path.join(__dirname, '..', 'www');

const cache = {};

function sendPug(res, page, locals) {
  if (!(page in cache)) {
    const file = path.join(pages, page + '.pug');
    const fn = pug.compile(fs.readFileSync(file), {filename: file});
    cache[page] = fn;
  }
  const html = cache[page](locals);
  res.send(html);
}

module.exports = {
  sendPug: sendPug,
};
