socket = io(IO_URL)
setTimeout(function() {
    socket.emit("getStats")
}, 1000)

google.load('visualization', '1', {
    'packages': ['corechart', 'annotatedtimeline']
})

google.setOnLoadCallback(function() {
    pieStyle = {
        backgroundColor: "#404040",
        legend: {
            textStyle: {
                color: 'white',
                fontName: "<global-font-name>",
                fontSize: "<global-font-size>"
            }
        },
        chartArea: {
            left: 0,
            top: 0,
            width: "100%",
            height: "100%"
        },
        pieSliceBorderColor: "#404040"
    }

    socket.on("roomStats", function(data) {
        console.log(data)
        $("h1").text(data["room"] + " Statistics")
        var popularVideos = data["popularVideos"]
        popularVideoTable = $('#popular_video_table > tbody')
        for (i = 0; i < popularVideos.length; i++) {
            row = $('<tr><td class="video"></td><td class="freq"></td></tr>')
            switch (popularVideos[i][0]) {
                case "yt":
                    link = "http://youtube.com/watch?v=" + popularVideos[i][1]
                    break
                case "vm":
                    link = "http://vimeo.com/" + popularVideos[i][1]
                    break
                case "sc":
                    link = "#"
                    break
                case "bt":
                    link = "http://blip.tv/posts/" + popularVideos[i][1]
                    break
                case "dm":
                    link = "http://www.dailymotion.com/video/" + popularVideos[i][1]
                    break
                default:
                    link = "#"
            }
            var title = ""
            if (popularVideos[i][2].length > 50) {
                title = popularVideos[i][2].substring(0, 50)
            } else {
                title = popularVideos[i][2]
            }
            row.children('.video').append($("<a></a>", {
                text: title,
                href: link,
                class: (popularVideos[i][3] ? "invalid" : ""),
            }))
            row.children('.freq').text(popularVideos[i][4])
            popularVideoTable.append(row)
        }

        var userVideoData = new google.visualization.DataTable()
        userVideoData.addColumn('string', 'Topping')
        userVideoData.addColumn('number', 'Slices')
        userVideoData.addRows(data["userVideoStats"])
        var userVideoChart = new google.visualization.PieChart(document.getElementById('user_video_div'))
        userVideoChart.draw(userVideoData, pieStyle)

        var userChatData = new google.visualization.DataTable()
        userChatData.addColumn('string', 'Topping')
        userChatData.addColumn('number', 'Slices')
        userChatData.addRows(data["userChatStats"])
        var userChatChart = new google.visualization.PieChart(document.getElementById('user_chat_div'))
        userChatChart.draw(userChatData, pieStyle)

        var averageUserData = new google.visualization.DataTable()
        var averageUsers = data["averageUsers"]
        averageUserData.addColumn('datetime', 'Time')
        averageUserData.addColumn('number', 'Short Moving average')
        averageUserData.addColumn('number', 'Long Moving average')
        averageUserData.addColumn('number', 'Number of Users')
        var smaspan = 24 * 7
        var lmaspan = 24 * 7 * 5
        var sum1 = 0,
            sum2 = 0
        for (i = 0; i < averageUsers.length; i++) {
            var row
            averageUsers[i][0] = new Date(averageUsers[i][0])
            row = [averageUsers[i][0], 0, 0, averageUsers[i][1]]
            sum1 += averageUsers[i][1]
            sum2 += averageUsers[i][1]
            if (i >= (smaspan - 1)) {
                row[1] = sum1 / smaspan
                sum1 -= averageUsers[i - smaspan + 1][1]
            }
            if (i >= (lmaspan - 1)) {
                row[2] = sum2 / lmaspan
                sum2 -= averageUsers[i - lmaspan + 1][1]
            }
            averageUserData.addRow(row)
        }
        var averageUserTimeline = new google.visualization.AnnotatedTimeLine(document.getElementById('average_user_div'))
        averageUserTimeline.draw(averageUserData, {
            'displayAnnotations': true,
            colors: ['black', 'green', 'orange'],
            max: 50
        })
        socket.disconnect()
    })
})
