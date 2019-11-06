const express_lib = require('express');
const http_lib = require('http');
const path_lib = require('path');
const socket_lib = require('socket.io');
//
var app = express_lib();
app.use(express_lib.static(path_lib.join(__dirname, 'public')));
var http = http_lib.createServer(app);
var io = socket_lib(http);
//
app.get('/', function (request, response) {
	response.sendFile(__dirname + 'index.html');
});
//
var ids = []
var names = {}
//
io.on('connection', function(socket){
	let socketid = socket.id;
	
	socket.on('chat message', function(message){ //MESSAGE FROM CLIENT
	if (message == 'ls') {
		socket.emit('chat message','List of all active chat members:');
		ids.forEach(function(id){
			socket.emit('chat message',id + "(" + names[id] + ")");
		});
	}
	else {
		io.emit('chat message',names[socketid] + ": " + message);
	}
	});
	
	socket.on('join', function(name){
	ids.push(socketid)
	names[socketid] = name
	io.emit('chat message', "Welcome, '" + name + "'!");
	});
	socket.on('name change', function(args){
	names[socketid] = args['new_name']
	io.emit('chat message', "'" + args['old_name'] + "' has changed their name to '" + args['new_name'] + "'");
	});
	socket.on('disconnect', function(socket){
		if (ids.includes(socketid)) {
			io.emit('chat message',"'"+names[socketid] + "' has disconnected");
			ids = ids.filter(function(i){
			  return i != socketid;
			});
			delete names[socketid];
		}
	});
});
//
http.listen(3000, function() {
	console.log("Listening on *:3000");
});