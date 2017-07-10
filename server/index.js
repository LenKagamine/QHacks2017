var express = require("express");
var app     = express();
var comp    = require("compression");
var http    = require("http").createServer(app);
var io      = require("socket.io").listen(http);
var roomManager = require("./room.js");
var appManager = require("./app.js");

var sockets = {};

io.on("connection", function(socket) {
    var newPlayer = {
        id: socket.id,
        room: -1,
        host: false
    };

    socket.on("startCreate", function() {
        if(newPlayer.room !== -1){ //switching rooms
            var newHostId = roomManager.leaveRoom(newPlayer);
            if(newHostId) {
                sockets[newHostId].emit("host-changed");
            }
        }

        roomManager.createRoom(newPlayer);
        sockets[newPlayer.id] = socket;
        socket.emit("room-created", newPlayer.room, appManager.appNames());
    });

    socket.on("startJoin", function(roomId) {
        if(!roomManager.roomExists(roomId)) { //room doesn't exist
            socket.emit("error-msg", "Room does not exist");
            return;
        }

        if(newPlayer.room !== -1){ //switching rooms
            var newHostId = roomManager.leaveRoom(newPlayer);
            if(newHostId) {
                sockets[newHostId].emit("host-changed");
            }
        }

        roomManager.joinRoom(roomId, newPlayer);
        sockets[newPlayer.id] = socket;

        var appId = roomManager.getAppId(newPlayer.room);
        if(appId !== -1) {
            socket.emit("app-changed", appId);
            appManager.joinApp(newPlayer.room, appId, socket, function(appData) {
                socket.emit("app-selected", appData);
            });
        }
        else {
            socket.emit("room-joined", newPlayer.room, appManager.appNames());
        }
    });

    socket.on("selectApp", function(appId) {
        if(!newPlayer.host) {
            socket.emit("error-msg", "Only host can change app");
        }
        else if(appId < 0 || appId >= appManager.appsNum()) {
            socket.emit("error-msg", "Invalid app ID");
        }
        else {
            console.log("room " + newPlayer.room + " selected app " + appId);
            roomManager.setAppId(newPlayer.room, appId);

            //send to everyone in room about app selection
            var roomSockets = roomManager.rooms[newPlayer.room].players.map(function(p){ return sockets[p.id]; });
            for(var i = 0; i < roomSockets.length; ++i){
                roomSockets[i].emit("app-changed", appId);
            }


            appManager.selectApp(newPlayer.room, appId, roomSockets, function(appData) {
                //send to all players in the room
                for(var i = 0; i < roomSockets.length; ++i) {
                    roomSockets[i].emit("app-selected", appData);
                }
            });
        }
    });

    socket.on("dataApp", function() { //retrieve data sent by app
        var args = Array.prototype.slice.call(arguments);
        appManager.dataRetrieved(newPlayer.room, socket, args[0], args.slice(1));
    });

    socket.on("leave", function() {
        if(newPlayer.host) {
            if(roomManager.rooms[newPlayer.room].app === -1) {
                // host leaves room
                // leave room
                console.log("Player exit: " + newPlayer.id);
                socket.emit("leave-room");
                socket.disconnect(0);
            }
            else {
                roomManager.rooms[newPlayer.room].app = -1;

                appManager.quitApp(newPlayer.room);

                var roomPlayers = roomManager.rooms[newPlayer.room].players;
                for(var i = 0; i < roomPlayers.length; ++i){
                    sockets[roomPlayers[i].id].emit("leave-app", appManager.appNames());
                }
            }
        }
        else {
            // leave room
            console.log("Player exit: " + newPlayer.id);
            socket.emit("leave-room");
            socket.disconnect(0);
        }
    });

    socket.on('end', function() {
        console.log("Player exit: " + newPlayer.id);
        socket.disconnect(0);
    });

    socket.on('disconnect', function(){
        var newHostId = roomManager.leaveRoom(newPlayer);
        if(newHostId) {
            sockets[newHostId].emit("host-changed"); //new host
        }
        console.log("Player dc: " + newPlayer.id);
    });
});

app.use(comp());
app.use(express.static(__dirname + '/../client'));
var port = process.env.PORT  || 5000;
http.listen(port, function() {
    console.log("listening on:" + port);
});
