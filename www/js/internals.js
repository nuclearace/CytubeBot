socket = io(IO_URL);

socket.on('connect', () => socket.emit('getInternals'));

// Handle the bot's status info
socket.on('botStatus', (status) => {
  const statusString = [
    `Managing: ${status.managing}`,
    `Muted: ${status.muted}`,
    `Hybrid Mods: ${JSON.stringify(status.hybridMods)}`,
    `Userlimit: ${status.userLimit}`,
    `User Limit Number: ${status.userLimitNum}`,
    `Disallowed: ${JSON.stringify(status.disallow)}`,
  ];

  $('#statusspan').html(statusString.join('<br>'));
});

// Handle bot info
socket.on('botInfo', (botInfo) => {
  const botInfoLines = [
    `Cytube Server: ${botInfo.server}`,
    `Cytube Room: ${botInfo.room}`,
    `Cytube Username: ${botInfo.username}`,
    `Logging: ${botInfo.useLogger}`,
    `Delete videos blocked in: ${botInfo.deleteIfBlockedIn}`,
    `Socket.io port: ${botInfo.socketPort}`,
    `Web URL: ${botInfo.webURL}`,
    `Web Port: ${botInfo.webPort}`,
    `Previous UID: ${botInfo.previousUID}`,
    `current UID: ${botInfo.currentUID}`,
    `Current Media: ${JSON.stringify(botInfo.currentMedia)}`,
    `isLeader: ${botInfo.isLeader}`,
    `startTime: ${botInfo.startTime}`,
    `Memory heap total: ${botInfo.heapTotal}`,
    `Memory heap used: ${botInfo.heapUsed}`,
    `${calculateUptime(botInfo.startTime)}`,
  ];

  $('#botinfospan').html(botInfoLines.join('<br />') + '<br />');
});

// Handle the userlist info
socket.on('userlist', (userlist) => {
  const stringyUserlist = userlist.map((element) => `${JSON.stringify(element)}<br>`).join('');
  $('#userlistspan').text(`Number of users: ${userlist.length}`);
  $('#userlistdetail').html(stringyUserlist);
});

// Handle the playlist info
socket.on('playlist', (playlist) => {
  const stringyPlaylist = playlist.map((element) => `${JSON.stringify(element)}<br>`).join('');
  $('#playlistspan').text(`Number of items on playlist: ${playlist.length}`);
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
  const returnString = 'Uptime: hours: %h, minutes: %m, seconds: %s';

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
