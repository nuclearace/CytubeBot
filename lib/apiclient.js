const http = require('http');
const https = require('https');
const translate = require('google-translate-api');
const libxmljs = require('libxmljs2');
const logger = require('./logger');

const APIs = {
  // API call to anagramgenius.com
  'anagram': (msg, apikey, callback) => {
    const options = {
      host: 'anagramgenius.com',
      path: '/server.php?' +
          'source_text=' + encodeURI(msg) + '&vulgar=1',
      timeout: 20,
    };

    urlRetrieve(http, options, (status, data) => {
      data = data.match(/.*<span class=\"black-18\">'(.*)'<\/span>/);
      callback(data);
    });
  },

  // API call to wolframalpha.com
  'wolfram': (query, apikey, callback) => {
    const options = {
      host: 'api.wolframalpha.com',
      path: '/v2/query?input=' + encodeURIComponent(query) + '&appid=' + apikey,
      timeout: 20,
    };

    const findAnswer = pods => {
      for (var i = 0; i < pods.length; i++) {
        if (pods[i]['primary']) {
          return callback(pods[i]['subpods'][0]['value']);
        };
      }

      // We couldn't find one, pick the next thing after
      // the input pod with data
      for (var i = 1; i < pods.length; i++) {
        if (pods[i]['subpods'][0]['value']) {
          return callback(pods[i]['subpods'][0]['value']);
        } else if (pods[i]['subpods'][0]['text']) {
          return callback(pods[i]['subpods'][0]['text']);
        }
      }

      // We couldn't find anything
      return callback('WolframAlpha query failed');
    };

    const getPods = xml => {
      const root = xml.root();
      if (root.attr('error').value() !== 'false') {
        return callback(root.get('//error/msg').text());
      }

      const pods = root.find('pod').map(pod => {
        // The name of the pod
        const title = pod.attr('title').value();

        // Retrive the subpods
        const subpods = pod.find('subpod').map(node => {
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

    urlRetrieve(http, options, (status, data) => {
      let xmlDoc = {};

      // Sometimes WolframAlpha sends you malformed XML
      try {
        xmlDoc = libxmljs.parseXml(data);
      } catch (e) {
        return callback('Error parsing XML');
      }

      return findAnswer(getPods(xmlDoc));
    });
  },

  // API call to weatherunderground.com for weather
  'weather': (data, apikey, callback) => {
    if (data.split(' ').length === 1) {
      const options = {
        host: 'api.wunderground.com',
        path: '/api/' + apikey + '/conditions/q/' + data + '.json',
        timeout: 20,
      };

      urlRetrieve(http, options, (status, data) => callback(data));
      return;
    }

    try {
      const stringData = data.split(' ');

      // Strip off the country
      const country = stringData[stringData.length - 1];
      stringData.splice(stringData.length - 1, 1)

      let fixedString = ''

      // Put the location together for the query
      for (let k in stringData) {
        fixedString += stringData[k] + '_';
      }

      // Trim off the last _
      fixedString = fixedString.slice(0, fixedString.lastIndexOf('_'));

      const query = country + '/' + fixedString;
      const options = {
        host: 'api.wunderground.com',
        path: '/api/' + apikey + '/conditions/q/' + query + '.json',
        timeout: 20,
      };

      urlRetrieve(http, options, (status, data) => callback(data));
    } catch (e) {
      logger.errlog.log(e);
    }
  },  // end weather

  // API call to weatherunderground.com for forecasts
  'forecast': (data, apikey, callback) => {
    if (data.split(' ').length === 1) {
      const options = {
        host: 'api.wunderground.com',
        path: '/api/' + apikey + '/conditions/forecast/q/' + data + '.json',
        timeout: 20,
      }

      urlRetrieve(http, options, (status, data) => callback(data));
      return;
    }

    try {
      const stringData = data.split(' ');

      // Strip off the country
      const country = stringData[stringData.length - 1];
      stringData.splice(stringData.length - 1, 1);

      let fixedString = '';

      // Put the location together for the query
      for (let k in stringData) {
        fixedString += stringData[k] + '_';
      }

      // Trim off the last _
      fixedString = fixedString.slice(0, fixedString.lastIndexOf('_'));

      const query = country + '/' + fixedString;
      const options = {
        host: 'api.wunderground.com',
        path: '/api/' + apikey + '/conditions/forecast/q/' + query + '.json',
        timeout: 20,
      };

      urlRetrieve(http, options, (status, data) => callback(data));
    } catch (e) {
      logger.errlog.log(e);
    }
  },  // End forecast

  // Attempts to get the socketurl from a cytube server
  'socketlookup': (serverData, apiKeys, callback) => {
    const excellentServerRegex =
        /^http(s)?:\/\/([\da-z\.-]+\.[a-z\.]{2,6})([\/\w \.-]*)*\:?(\d*)?\/?$/;
    const matches = serverData.server.match(excellentServerRegex);
    const secure = matches[1] !== undefined;
    const defaultPort = secure ? 443 : 80;

    const options = {
      host: matches[2],
      port: matches[5] !== undefined ? matches[6] : defaultPort,
      path: '/socketconfig/' + serverData.room + '.json',
      timeout: 20,
    };

    urlRetrieve((secure ? https : http), options, (res, data) => {
      // If we can't find the URL there's something wrong and
      // we should exit
      if (res !== 200) {
        logger.errlog.log(`!~~~! Error looking up Cytube server info ${res}`);
        process.exit(1);
      }

      const json = JSON.parse(data);
      let serverUrl;

      for (const server of json.servers) {
        if (server.secure === true) {
          serverUrl = server.url;
          break
        } else {
          serverUrl = server.url;
        }
      }

      if (serverUrl) {
        console.log(`got url ${serverUrl}`);
        callback(serverUrl);
      } else {
        console.log(`got thing ${res}`);
        callback(null);
      }
    });
  },

  // API call to Google Translate
  'translate': (query, callback) => {
    translate(query.text, query.trans)
        .then(res => callback(false, res))
        .catch(err => {
          logger.errlog.log(err);
          callback(err, null);
        });
  },

  // API call for YouTube videos
  // Used to validate videos
  'youtubelookup': (id, apiKey, callback) => {
    const params = [
      'part=' +
          'id,contentDetails,status',
      'id=' + id,
      'key=' + apiKey,
    ].join('&');

    const options = {
      host: 'www.googleapis.com',
      port: 443,
      path: '/youtube/v3/videos?' + params,
      method: 'GET',
      dataType: 'jsonp',
      timeout: 1000,
    };

    urlRetrieve(https, options, (status, data) => {
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
        id: data['items'][0]['id'],
        contentDetails: data['items'][0]['contentDetails'],
        status: data['items'][0]['status'],
      };

      callback(true, vidInfo);
    });
  },
};

function urlRetrieve(transport, options, callback) {
  const req = transport.request(options, res => {
    let buffer = '';
    res.setEncoding('utf-8');
    res.on('data', chunk => buffer += chunk);
    res.on('end', () => callback(res.statusCode, buffer));
  });

  req.on('error', err => {
    console.error(`Something fucked up, ${err}`);
    callback(null);
  });

  req.end();
};

module.exports = {
  APIs: APIs,
  APICall: (msg, type, apikey, callback) => {
    if (type in this.APIs) {
      this.APIs[type](msg, apikey, callback)
    }
  },
  retrieve: urlRetrieve,
};
