import translate from 'google-translate-api';
import http from 'http';
import https from 'https';
import {parseXml} from 'libxmljs2';

import {errlog} from './logger.js';

// API call to anagramgenius.com
export async function callAnagram(msg, callback) {
  const options = {
    host: 'anagramgenius.com',
    path: `/server.php?source_text=${encodeURI(msg)}&vulgar=1`,
    timeout: 20,
  };

  const {data} = await urlRetrieve(http, options);

  callback(data.match(/.*<span class=\"black-18\">'(.*)'<\/span>/));
}

// API call to wolframalpha.com
export async function callWolfram(query, apiKey, callback) {
  const options = {
    host: 'api.wolframalpha.com',
    path: `/v2/query?input=${encodeURIComponent(query)}&appid=${apiKey}`,
    timeout: 20,
  };

  const findAnswer = (pods) => {
    for (let i = 0; i < pods.length; i++) {
      if (pods[i].primary) {
        return callback(pods[i].subpods[0].value);
      };
    }

    // We couldn't find one, pick the next thing after
    // the input pod with data
    for (let i = 1; i < pods.length; i++) {
      if (pods[i].subpods[0].value) {
        return callback(pods[i].subpods[0].value);
      } else if (pods[i].subpods[0].text) {
        return callback(pods[i].subpods[0].text);
      }
    }

    // We couldn't find anything
    return callback('WolframAlpha query failed');
  };

  const getPods = (xml) => {
    const root = xml.root();
    if (root.attr('error').value() !== 'false') {
      return callback(root.get('//error/msg').text());
    }

    const pods = root.find('pod').map((pod) => {
      // The name of the pod
      const title = pod.attr('title').value();

      // Retrive the subpods
      const subpods = pod.find('subpod').map((node) => {
        return {
          title: node.attr('title').value(),
          value: node.get('plaintext').text(),
        };
      });

      // Is this the primary pod?
      const primary =
          (pod.attr('primary') && pod.attr('primary').value()) == 'true';
      return {
        title: title,
        subpods: subpods,
        primary: primary,
      };
    });

    return pods;
  };

  const {data} = await urlRetrieve(http, options);

  let xmlDoc = {};

  // Sometimes WolframAlpha sends you malformed XML
  try {
    xmlDoc = parseXml(data);
  } catch (e) {
    return callback('Error parsing XML');
  }

  return findAnswer(getPods(xmlDoc));
}

// API call to weatherunderground.com for weather
export async function callWeather(data, apiKey, callback) {
  if (data.split(' ').length === 1) {
    const options = {
      host: 'api.wunderground.com',
      path: `/api/${apiKey}'/conditions/q/${data}.json`,
      timeout: 20,
    };

    const {data: resp} = await urlRetrieve(http, options);
    callback(resp);
    return;
  }

  try {
    const /** @type {!Array<string>} */ stringData = data.split(' ');

    // Strip off the country
    const country = stringData[stringData.length - 1];
    stringData.splice(stringData.length - 1, 1);

    let fixedString = '';

    // Put the location together for the query
    for (const letter of stringData) {
      fixedString += letter + '_';
    }

    // Trim off the last _
    fixedString = fixedString.slice(0, fixedString.lastIndexOf('_'));

    const query = `${country}/${fixedString}`;
    const options = {
      host: 'api.wunderground.com',
      path: `/api/${apiKey}/conditions/q/${query}.json`,
      timeout: 20,
    };

    const {data: resp} = await urlRetrieve(http, options);
    callback(resp);
  } catch (e) {
    errlog.log(e);
  }
}

// API call to weatherunderground.com for forecasts
export async function callForecast(data, apiKey, callback) {
  if (data.split(' ').length === 1) {
    const options = {
      host: 'api.wunderground.com',
      path: `/api/${apiKey}/conditions/forecast/q/${data}.json`,
      timeout: 20,
    };

    const {data: resp} = await urlRetrieve(http, options);
    return resp;
  }

  try {
    const stringData /** @type {!Array<string>} */ = data.split(' ');

    // Strip off the country
    const country = stringData[stringData.length - 1];
    stringData.splice(stringData.length - 1, 1);

    let fixedString = '';

    // Put the location together for the query
    for (const letter of stringData) {
      fixedString += letter + '_';
    }

    // Trim off the last _
    fixedString = fixedString.slice(0, fixedString.lastIndexOf('_'));

    const query = `${country}/${fixedString}`;
    const options = {
      host: 'api.wunderground.com',
      path: `/api/${apiKey}/conditions/forecast/q/${query}.json`,
      timeout: 20,
    };

    const {data: resp} = await urlRetrieve(http, options);
    return resp;
  } catch (e) {
    errlog.log(e);
  }
}

// Attempts to get the socketurl from a cytube server
export async function socketLookup(serverData, apiKeys, callback) {
  const excellentServerRegex =
      /^http(s)?:\/\/([\da-z\.-]+\.[a-z\.]{2,6})([\/\w \.-]*)*\:?(\d*)?\/?$/;
  const matches = serverData.server.match(excellentServerRegex);
  if (matches == null) {
    errlog.log(`!~~~! Error looking up Cytube server info ${
        JSON.stringify(serverData)}`);
    process.exit(1);
  }

  const secure = matches[1] !== undefined;
  const defaultPort = secure ? 443 : 80;

  const options = {
    host: matches[2],
    port: matches[5] !== undefined ? matches[6] : defaultPort,
    path: `/socketconfig/${serverData.room}.json`,
    timeout: 20,
  };

  const {statusCode, data} =
      await urlRetrieve((secure ? https : http), options);

  // If we can't find the URL there's something wrong and we should exit
  if (statusCode !== 200) {
    errlog.log(`!~~~! Error looking up Cytube server info ${statusCode}`);
    process.exit(1);
  }

  const json = JSON.parse(data);
  let serverUrl;

  for (const server of json.servers) {
    if (server.secure === true) {
      serverUrl = server.url;
      break;
    } else {
      serverUrl = server.url;
    }
  }

  if (serverUrl) {
    console.log(`got url ${serverUrl}`);
    callback(serverUrl);
  } else {
    console.log(`got thing ${statusCode}`);
    callback(null);
  }
}

// API call to Google Translate
export function callGoogleTranslate(query, callback) {
  translate(query.text, query.trans)
      .then((res) => callback(false, res))
      .catch((err) => {
        errlog.log(err);
        callback(err, null);
      });
}

// API call for YouTube videos
// Used to validate videos
export async function youtubelookup(id, apiKey, callback) {
  const params = [
    'part=id,contentDetails,status',
    `id=${id}`,
    `key=${apiKey}`,
  ].join('&');

  const options = {
    host: 'www.googleapis.com',
    port: 443,
    path: `/youtube/v3/videos?${params}`,
    method: 'GET',
    dataType: 'jsonp',
    timeout: 1000,
  };

  const {statusCode: status, data} = await urlRetrieve(https, options);

  if (status !== 200) {
    callback(status, null);
    return;
  }

  data = JSON.parse(data);
  if (data.pageInfo.totalResults !== 1) {
    callback('Video not found', null);
    return;
  }

  const vidInfo = {
    id: data.items[0].id,
    contentDetails: data.items[0].contentDetails,
    status: data.items[0].status,
  };

  callback(true, vidInfo);
}

/** @typedef {{statusCode: number, data: string}} URLResponseData */

/**
 * Retrieve a URL.
 *
 * @param {http|https} transport Transport to use.
 * @param {?} options Options to send in request.
 * @return {Promise<URLResponseData>} Response from the call.
 */
function urlRetrieve(transport, options) {
  return new Promise((resolve, reject) => {
    const req = transport.request(options, (res) => {
      let buffer = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => buffer += chunk);
      res.on('end', () => resolve({
                      statusCode: res.statusCode,
                      data: buffer,
                    }));
    });

    req.on('error', (err) => {
      console.error(`Something fucked up, ${err}`);
      reject(err);
    });

    req.end();
  });
};
