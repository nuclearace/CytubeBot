socket = io(IO_URL);
socket.on('connect', () => socket.emit('getInternals'));

// Handle the bot's status info
socket.on('botStatus', status => {
  const managing = status['managing'];
  const muted = status['muted'];
  const hybridMods = status['hybridMods'];
  const userLimit = status['userLimit'];
  const userLimitNum = status['userLimitNum'];
  const disallowed = status['disallow'];

  const statusString = ('Managing: ' + managing + '<br>') +
      ('Muted: ' + muted + '<br>') +
      ('Hybrid Mods: ' + JSON.stringify(hybridMods) + '<br>') +
      ('Userlimit: ' + userLimit + '<br>') +
      ('User Limit Number: ' + userLimitNum + '<br>') +
      ('Disallowed: ' + JSON.stringify(disallowed));
  $('#statusspan').html(statusString);
});

// Handle bot info
socket.on('botInfo', botInfo => {
  const server = botInfo['server'];
  const room = botInfo['room'];
  const username = botInfo['username'];
  const useLogger = botInfo['useLogger'];
  const deleteIfBlockedIn = botInfo['deleteIfBlockedIn'];
  const socketPort = botInfo['socketPort'];
  const webURL = botInfo['webURL'];
  const webPort = botInfo['webPort'];
  const previousUID = botInfo['previousUID'];
  const currentUID = botInfo['currentUID'];
  const currentMedia = JSON.stringify(botInfo['currentMedia']);
  const isLeader = botInfo['isLeader'];
  const startTime = botInfo['startTime'];
  const heapTotal = botInfo['heapTotal'];
  const heapUsed = botInfo['heapUsed'];

  const botInfoString = ('Cytube Server: ' + server + '<br>') +
      ('Cytube Room: ' + room + '<br>') +
      ('Cytube Username: ' + username + '<br>') +
      ('Logging: ' + useLogger + '<br>') +
      ('Delete videos blocked in: ' + deleteIfBlockedIn + '<br>') +
      ('Socket.io port: ' + socketPort + '<br>') +
      ('Web URL: ' + webURL + '<br>') + ('Web Port: ' + webPort + '<br>') +
      ('Previous UID: ' + previousUID + '<br>') +
      ('current UID: ' + currentUID + '<br>') +
      ('Current Media: ' + currentMedia + '<br>') +
      ('isLeader: ' + isLeader + '<br>') +
      ('startTime: ' + startTime + '<br>') +
      ('Memory heap total: ' + heapTotal + '<br>') +
      ('Memory heap used: ' + heapUsed + '<br>') +
      (calculateUptime(startTime) + '<br>');

  $('#botinfospan').html(botInfoString);
});

// Handle the userlist info
socket.on('userlist', userlist => {
  const stringyUserlist =
      userlist.map(element => JSON.stringify(element) + '<br>').join('');
  $('#userlistspan').text('Number of users: ' + userlist.length);
  $('#userlistdetail').html(stringyUserlist);
});

// Handle the playlist info
socket.on('playlist', playlist => {
  const stringyPlaylist =
      playlist.map(element => JSON.stringify(element) + '<br>').join('');
  $('#playlistspan').text('Number of items on playlist: ' + playlist.length);
  $('#playlistdetail').html(stringyPlaylist);
});

$('#playlistdetailsbutton').click(() => {
  if (!$('#playlistdetail').is(':visible')) {
    $('#playlistdetail').show();
  } else {
    $('#playlistdetail').hide();
  }
});

$('#userlistdetailsbutton').click(() => {
  if (!$('#userlistdetail').is(':visible')) {
    $('#userlistdetail').show();
  } else {
    $('#userlistdetail').hide();
  }
});

function calculateUptime(startTime) {
  const timeNow = new Date().getTime();
  let time = (timeNow - startTime) / 1000;
  let h = '0';
  let m = '';
  let s = '';
  let returnString = 'Uptime: hours: %h, minutes: %m, seconds: %s';

  if (time >= 3600) {
    h = '' + Math.floor(time / 3600);
    if (h.length < 2) {
      h = '0' + h;
    }
    time %= 3600;
  }

  m = '' + Math.floor(time / 60);
  if (m.length < 2) {
    m = '0' + m;
  }

  s = '' + (time % 60);
  if (s.length < 2) {
    s = '0' + s;
  }

  return returnString.replace('%h', h).replace('%m', m).replace('%s', s);
}

setInterval(() => socket.emit('getInternals'), 5000);
