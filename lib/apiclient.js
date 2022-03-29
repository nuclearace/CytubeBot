import {AsyncWeather} from '@cicciosgamino/openweather-apis';
import axios from 'axios';
import http from 'http';
import https from 'https';
// eslint-disable-next-line no-unused-vars
import {Document as XmlDocument, parseXml} from 'libxmljs2';

import {errorLog} from './logger.js';

// 'imperial' or 'metric'
const WEATHER_UNITS = 'imperial';
export const WEATHER_ABBREVIATION = {
  'imperial': 'F',
  'metric': 'C',
}[WEATHER_UNITS];

/**
 * Makes an API call to anagramgenius.com.
 *
 * @param {string} msg Message to get an anagram for.
 * @return {!Promise<string>} Anagram of the provided message.
 */
export async function callAnagram(msg) {
  const {data} = await urlRetrieve(https, {
    host: 'anagramgenius.com',
    path: `/server.php?source_text=${encodeURI(msg)}&vulgar=1`,
    timeout: 20,
  });

  return data.match(/.*<span class=\"black-18\">'(.*)'<\/span>/)[1];
}

/**
 * Makes an API call to WolframAlpha.
 *
 * @param {string} query Query to send.
 * @param {string} apiKey API key to use.
 * @return {!Promise<string>} Promise containing the response from Wolfram.
 */
export async function callWolfram(query, apiKey) {
  const {data} = await urlRetrieve(https, {
    host: 'api.wolframalpha.com',
    path: `/v2/query?input=${encodeURIComponent(query)}&appid=${apiKey}`,
    timeout: 20,
  });

  let /** @type {?XmlDocument} */ xmlDoc;
  try {
    xmlDoc = parseXml(data);
  } catch (e) {
    // Sometimes WolframAlpha sends malformed XML
    errorLog.log(`Error parsing Wolfram XML: ${e}`);
    throw new Error('Received bad response from Wolfram');
  }

  const root = xmlDoc.root();
  if (root.attr('error').value() !== 'false') {
    throw new Error(root.get('//error/msg').text());
  }

  const pods = root.find('pod').map((pod) => {
    return {
      title: pod.attr('title').value(),
      subpods: pod.find('subpod').map((node) => {
        return {
          title: node.attr('title').value(),
          value: node.get('plaintext').text(),
        };
      }),
      primary: pod.attr('primary') && pod.attr('primary').value() === 'true',
    };
  });

  for (const pod of pods) {
    if (pod.primary) {
      return pod.subpods[0].value;
    }
  }

  // We couldn't find a primary pod, pick the next thing after the input pod with data.
  for (const [i, pod] of pods.entries()) {
    if (i === 0) {
      continue;
    }

    if (pod.subpods[0].value) {
      return pod.subpods[0].value;
    } else if (pod.subpods[0].text) {
      return pod.subpods[0].text;
    }
  }

  // We couldn't find anything.
  throw new Error('WolframAlpha query failed');
}

export async function weatherFromZipCode(zipCode, apiKey) {
  const weather = await new AsyncWeather();
  weather.setApiKey(apiKey);
  weather.setUnits(WEATHER_UNITS);
  weather.setZipCodeAndCountryCode(zipCode, 'US');
  return weather;
}

export async function weatherFromLocation(location, apiKey) {
  const weather = await new AsyncWeather();
  weather.setApiKey(apiKey);
  weather.setUnits(WEATHER_UNITS);

  const geocodeResponse = await axios.get('https://api.openweathermap.org/geo/1.0/direct', {
    params: {
      'q': location,
      'limit': 1,
      'appid': apiKey,
    },
  });
  if (geocodeResponse.status !== 200) {
    throw new Error(`OpenWeather API call failed: ${JSON.stringify(geocodeResponse.data)}`);
  }

  weather.setCoordinates(geocodeResponse.data[0].lat, geocodeResponse.data[0].lon);

  return weather;
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
    errorLog.log(e);
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
    errorLog.log(`!~~~! Error looking up Cytube server ${server}`);
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

  const {statusCode, data} = await urlRetrieve((secure ? https : http), options);

  // If we can't find the URL there's something wrong and we should exit
  if (statusCode !== 200) {
    errorLog.log(`!~~~! Error looking up Cytube server info ${statusCode}`);
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
    errorLog.log(`JSON data from CyTube socket URL lookup:\n${data}`);
    throw new Error(
        `Failed to get server URL for room ${serverData.room}, ` +
        `check error log`);
  }
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
    errorLog.log(`YouTube lookup statusCode !== 200: ${dataStr}`);
    return null;
  }

  const data = JSON.parse(dataStr);
  if (data.pageInfo.totalResults !== 1) {
    errorLog.log(`YouTube lookup results length !== 1: ${dataStr}`);
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
      errorLog.log(`Something fucked up, ${err}`);
      reject(err);
    });

    req.end();
  });
};
