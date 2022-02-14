import {readFile} from 'fs/promises';

export async function loadConfig() {
  let data;
  try {
    data = await readFile('config.json');
  } catch (err) {
    console.error('Failed to read config');
    console.error(err);
    throw err;
  }

  try {
    return JSON.parse(data.toString());
  } catch (e) {
    console.error('Error parsing config');
    console.error(e);
    throw err;
  }
}
