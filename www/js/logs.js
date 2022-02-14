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
  $.ajax(`${location.protocol}//${location.host}/logs/cytubelog`).done((data) => {
    $('#logviewer').text(data);
    $('#logviewer').scrollTop($('#logviewer').prop('scrollHeight'));
  });
}

jQuery(function() {
  $('#syslog').on('click', readSyslog);
  $('#errlog').on('click', readErrlog);
  $('#cytubelog').on('click', readCytubeLog);
});
