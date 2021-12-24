function readSyslog() {
  $.ajax(`${location.protocol}//${location.host}/logs/syslog`).done((data) => {
    $('#logviewer').text(data);
    $('#logviewer').scrollTop($('#logviewer').prop('scrollHeight'));
  });
}

function readErrlog() {
  $.ajax(`${location.protocol}//${location.host}/logs/errlog`).done((data) => {
    $('#logviewer').text(data);
    $('#logviewer').scrollTop($('#logviewer').prop('scrollHeight'));
  });
}

function readCytubeLog() {
  $.ajax(`${location.protocol}//${location.host}/logs/cytubelog`)
      .done((data) => {
        $('#logviewer').text(data);
        $('#logviewer').scrollTop($('#logviewer').prop('scrollHeight'));
      });
}

$(document).ready(() => {
  $('#syslog').click(readSyslog);
  $('#errlog').click(readErrlog);
  $('#cytubelog').click(readCytubeLog);
});
