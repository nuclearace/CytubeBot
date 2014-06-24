function readSyslog() {
    $.ajax(location.protocol + "//" + location.host + "/logs/syslog").done(function(data) {
        $("#logviewer").text(data)
        $("#logviewer").scrollTop($("#logviewer").prop("scrollHeight"))
    })
}

function readErrlog() {
    $.ajax(location.protocol + "//" + location.host + "/logs/errlog").done(function(data) {
        $("#logviewer").text(data)
        $("#logviewer").scrollTop($("#logviewer").prop("scrollHeight"))
    })
}

function readCytubeLog(name) {
    $.ajax(location.protocol + "//" + location.host + "/logs/cytubelog").done(function(data) {
        $("#logviewer").text(data)
        $("#logviewer").scrollTop($("#logviewer").prop("scrollHeight"))
    })
}

$(document).ready(function() {
    $("#syslog").click(readSyslog)
    $("#errlog").click(readErrlog)
    $("#cytubelog").click(readCytubeLog)
})