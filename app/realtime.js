module.exports = {
    http:undefined,
    io:undefined,
    app:undefined,
    socketMap:{},
    init:function(app) {
        this.app = app;
        this.http = require('http').Server(this.app);
        this.io = require('socket.io')(this.http);
        var self = this;

        this.io.on('connection', function(socket){
            console.log('a user connected');

            socket.on('disconnect', function(){
                console.log('user disconnected');
                if (socket.propertyId != undefined) {
                    var room = socket.propertyId;
                    if (self.socketMap[room] != undefined) {
                        var activeSockets = [];
                        for (var x=0; x<self.socketMap[room].length; x++) {
                            if (self.socketMap[room][x] != socket) {
                                activeSockets.push(self.socketMap[room][x]);
                            }
                        }
                        self.socketMap[room] = activeSockets;
                    } 
                }
            });

            socket.on('upgrade', function(room){
                console.log('upgrade event received for room/id: ' + room);
                socket.join(room);

                if (self.socketMap[room]== undefined) {
                    self.socketMap[room] = [];
                }
                self.socketMap[room].push(socket);
                self.io.sockets.in(room).emit('upgrade', "Messaging Client Attached");
            });

            socket.on('data', function(room, data){
                socket.broadcast.to(room).emit('data', data);
            });

            socket.on('analyticsComplete', function(room, data){
                socket.broadcast.to(room).emit('analyticsComplete', data);
            });
        });

        return this.http;
    },
    emit:function(propertyId, data) {
        var sockets = this.socketMap[propertyId];
        if (sockets) {
            for (var x=0; x<sockets.length; x++) {
                sockets[x].emit("data", data);
            }
        }
    }
}