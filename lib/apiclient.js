import {AsyncWeather} from '@cicciosgamino/openweather-apis';
import axios from 'axios';
import {parseXml} from 'libxmljs2';

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
  const resp = await axios.get('https://anagramgenius.com/server.php', {
    params: {
      'source_text': msg,
      'vulgar': '1',
    },
    timeout: 10 * 1_000,
  });
  if (resp.status !== 200) {
    throw new Error(`Anagram API call failed: ${JSON.stringify(resp.data)}`);
  }

  const matches = resp.data.match(/.*<span class=\"black-18\">'(.*)'<\/span>/);
  if (!matches) {
    return '<no anagram found>';
  }

  return matches[1];
}

/**
 * Makes an API call to WolframAlpha.
 *
 * @param {string} query Query to send.
 * @param {string} apiKey API key to use.
 * @return {!Promise<string>} Promise containing the response from Wolfram.
 */
export async function callWolfram(query, apiKey) {
  const resp = await axios.get('https://api.wolframalpha.com/v2/query', {
    params: {
      'input': query,
      'appid': apiKey,
    },
    timeout: 10 * 1_000,
  });
  if (resp.status !== 200) {
    throw new Error(`Wolfram API call failed: ${JSON.stringify(resp.data)}`);
  }

  let /** @type {?import('libxmljs2').Document} */ xmlDoc;
  try {
    xmlDoc = parseXml(resp.data);
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
  if (!matches) {
    errorLog.log(`!~~~! Error looking up Cytube server ${server}`);
    process.exit(1);
  }

  const secure = matches[1] !== undefined;
  const defaultPort = secure ? 443 : 80;

  const host = matches[2];
  const port = matches[5] !== undefined ? matches[6] : defaultPort;
  const url = `${secure ? 'https' : 'http'}://${host}:${port}/socketconfig/${room}.json`;

  const resp = await axios.get(url, {timeout: 10 * 1_000});

  if (resp.status !== 200) {
    errorLog.log(
        `!~~~! Error looking up Cytube server info ${resp.status}: ${JSON.stringify(data)}`);
    process.exit(1);
  }

  /** @type {string} */
  let serverUrl;
  for (const server of resp.data.servers) {
    serverUrl = server.url;
    if (server.secure) {
      break;
    }
  }

  if (serverUrl) {
    console.log(`Connecting to socket URL ${serverUrl}`);
    return serverUrl;
  } else {
    errorLog.log(`JSON data from CyTube socket URL lookup:\n${resp.data}`);
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
 * @property {!Object} status Video status. See
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
  const resp = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
    params: {
      'part': ['id', 'contentDetails', 'status'].join(','),
      'id': id,
      'key': apiKey,
    },
    timeout: 2 * 1_000,
  });
  if (resp.status !== 200) {
    errorLog.log(`YouTube lookup statusCode !== 200: ${JSON.stringify(resp.data)}`);
    return null;
  }

  if (resp.data.pageInfo.totalResults !== 1) {
    errorLog.log(`YouTube lookup results length !== 1: ${JSON.stringify(resp.data)}`);
    return null;
  }

  return {
    id: resp.data.items[0].id,
    contentDetails: resp.data.items[0].contentDetails,
    status: resp.data.items[0].status,
  };
}
