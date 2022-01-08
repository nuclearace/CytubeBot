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

    // We couldn't find one, pick the next thing after the input pod with data.
    for (let i = 1; i < pods.length; i++) {
      if (pods[i].subpods[0].value) {
        return callback(pods[i].subpods[0].value);
      } else if (pods[i].subpods[0].text) {
        return callback(pods[i].subpods[0].text);
      }
    }

    // We couldn't find anything.
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

/**
 * Attempts to get the socket URL from a cytube server.
 *
 * @param {string} server The CyTube server to look up.
 * @param {string} room The room to look up.
 * @return {!Promise<string>} The CyTube socket URL.
 */
export async function lookupSocketUrl(server, room) {
  const excellentServerRegex =
      /^http(s)?:\/\/([\da-z\.-]+\.[a-z\.]{2,6})([\/\w \.-]*)*\:?(\d*)?\/?$/;
  const matches = server.match(excellentServerRegex);
  if (matches == null) {
    errlog.log(`!~~~! Error looking up Cytube server ${server}`);
    process.exit(1);
  }

  const secure = matches[1] !== undefined;
  const defaultPort = secure ? 443 : 80;

  const options = {
    host: matches[2],
    port: matches[5] !== undefined ? matches[6] : defaultPort,
    path: `/socketconfig/${room}.json`,
    timeout: 20,
  };

  const {statusCode, data} =
      await urlRetrieve((secure ? https : http), options);

  // If we can't find the URL there's something wrong and we should exit
  if (statusCode !== 200) {
    errlog.log(`!~~~! Error looking up Cytube server info ${statusCode}`);
    process.exit(1);
  }

  /** @type {string} */
  let serverUrl;
  for (const server of JSON.parse(data).servers) {
    serverUrl = server.url;
    if (server.secure) {
      break;
    }
  }

  if (serverUrl) {
    console.log(`Connecting to socket URL ${serverUrl}`);
    return serverUrl;
  } else {
    errlog.log(`JSON data from CyTube socket URL lookup:\n${data}`);
    throw new Error(
        `Failed to get server URL for room ${serverData.room}, ` +
        `check error log`);
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

/**
 * Metadata about a YouTube video.
 *
 * @typedef {Object} YouTubeVideoMeta
 * @property {string} id ID of the video.
 * @property {!Object} contentDetails Content details. See
 *    https://developers.google.com/youtube/v3/docs/videos#contentDetails
 * @property {string} status Video status. See
 *    https://developers.google.com/youtube/v3/docs/videos#status
 */

/**
 * API call for YouTube videos.
 * Used to validate videos.
 *
 * @param {string} id ID of the video.
 * @param {string} apiKey YouTube API key.
 * @return {!Promise<YouTubeVideoMeta>} Metadata about the video.
 */
export async function youTubeLookup(id, apiKey) {
  const params = [
    'part=id,contentDetails,status',
    `id=${id}`,
    `key=${apiKey}`,
  ];

  const options = {
    host: 'www.googleapis.com',
    port: 443,
    path: `/youtube/v3/videos?${params.join('&')}`,
    method: 'GET',
    dataType: 'jsonp',
    timeout: 1000,
  };

  const {statusCode, data: dataStr} = await urlRetrieve(https, options);

  if (statusCode !== 200) {
    errlog.log(`YouTube lookup statusCode !== 200: ${dataStr}`);
    return null;
  }

  const data = JSON.parse(dataStr);
  if (data.pageInfo.totalResults !== 1) {
    errlog.log(`YouTube lookup results length !== 1: ${dataStr}`);
    return null;
  }

  return {
    id: data.items[0].id,
    contentDetails: data.items[0].contentDetails,
    status: data.items[0].status,
  };
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
      errlog.log(`Something fucked up, ${err}`);
      reject(err);
    });

    req.end();
  });
};
