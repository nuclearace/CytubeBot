import {readFile} from 'fs';

export function load(callback) {
  readFile('config.json', (err, data) => {
    if (err) {
      console.log('Config load failed');
      console.log(err);
      return;
    }

    try {
      data = JSON.parse(data + '');
    } catch (e) {
      console.log('Error parsing config');
      console.log(e);
    }

    callback(data);
  });
}
