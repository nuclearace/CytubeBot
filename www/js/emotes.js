socket = io(IO_URL);
setTimeout(() => {
  socket.emit('getRoom');
  socket.emit('getEmotes');
}, 1000);

function addEmote(emote) {
  const name = emote['name'];
  const image = emote['image'];
  const tbl = $('#emotediv table');
  const tr = $('<tr/>').appendTo(tbl);

  const emoteDiv = $('<span>').text(name).appendTo($('<td/>').appendTo(tr));

  const popoverData = {
    html: true,
    trigger: 'hover',
    content: '<img src="' + image + '" class="channel-emote">'
  };
  emoteDiv.popover(popoverData);
}

function handleEmotes(emotes) {
  emotes.sort((a, b) => {
    if (a['name'] > b['name']) {
      return 1;
    }
    if (a['name'] < b['name']) {
      return -1;
    }
    if (a['name'] = b['name']) {
      return 0;
    }
  })
  emotes.forEach((emote) => addEmote(emote));
  socket.disconnect();
}

function handleRoom(room) {
  $('h1').text(room + ' Emotes');
}

socket.on('emotes', handleEmotes);
socket.on('room', handleRoom);
