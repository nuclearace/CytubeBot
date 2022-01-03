import {readFile} from 'fs/promises';

export async function loadConfig() {
  try {
    const data = await readFile('config.json');
    let jsonData;
    try {
      jsonData = JSON.parse(data.toString());
    } catch (e) {
      console.log('Error parsing config');
      console.log(e);
    }
    return jsonData;
  } catch (err) {
    console.log('Config load failed');
    console.log(err);
  }
}
