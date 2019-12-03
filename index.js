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
var ids = {}; //Keeping track of all user ids and socket objects {socketid:socket}
var names = {}; //Keeping track of all player names: {socketid:name}
var games = {}; //Games that exist (aka total games hosted) {host_socketid:game}
var ingame = {}; //Dictionary keeping track of what games each user is in {player_socketid:host_socketid}
//
io.on('connection', function(socket){
	let socketid = socket.id;
	ids[socketid] = socket;
	
	socket.on('chat message', function(message){ //MESSAGE FROM CLIENT
	if (socketid in names){
		if (message == 'ls') {
			list_players(socketid);
		}
		else if (message == 'gs') {
			list_games(socketid);
		}
		else if (message.startsWith('host')) {
			var room = message.split(" ")[1];
			if (typeof room == 'string') {
				room = room.trim();
				create_game(socketid, room);
			}
		}
		else if (message == 'leave') {
			if (socketid in ingame) {
				ids[socketid].emit('chat message',"Leaving game: " + games[ingame[socketid]].name);
				leave_game(socketid,ingame[socketid]);
			}
			else {
				ids[socketid].emit('error message',204, "You aren't in any games right now!");
			}
		}
		else if (message == 'start') {
			start_game(socketid);
		}
		else if (message.startsWith("join")) {
			if (socketid in ingame) {
				ids[socketid].emit('error message',205, "You're already in a game!");
			}
			else {
				var room = message.split(" ")[1];
				if (typeof room == 'string') {
					room = room.trim();
					join_game(socketid, room);
				}
			}
		}
		else if (message == 'ready') {
			mark_ready(socketid, true);
		}
		else if (message == 'unready') {
			mark_ready(socketid, false);
		}
		else {
			if (socketid in ingame) { //If in a game
				io.to(ingame[socketid]+"_game").emit('chat message',games[ingame[socketid]].name+"-"+names[socketid] + ": " + message);
			}
			else { //If in general lobby
				io.emit('chat message',names[socketid] + ": " + message);
			}
		}
	}
	else {//IF no username
		ids[socketid].emit('error message', 101, "You haven't officially joined the lobby yet");
	}
	});
	
	socket.on('lobby join', function(name){
		lobby_join(socketid, name);
	});
	socket.on('request players', function(){
		list_players(socketid);
	});
	socket.on('request games', function(){
		list_games(socketid);
	});
	socket.on('host game', function(game_name){
		create_game(socketid, game_name);
	});
	socket.on('join game', function(game_name){
		join_game(socketid, game_name);
	});
	socket.on('name change', function(new_name){
		change_name(socketid, new_name);
	});
	socket.on('disconnect', function(socket){
		lobby_disconnect(socketid);
	});
});
//
function lobby_join(socket_id, name) {
	var check_ok = true;
	Object.keys(names).forEach((sid)=>{
		var value = names[sid];
		if (name == value) {
			check_ok = false;
			ids[socket_id].emit('error message', 102, "Tried to join with a name of an existing player");
			return;
		}
	});
	if (check_ok) {
		names[socket_id] = name;
		io.emit('chat message', "Welcome, '" + name + "'!");
	}
}

function lobby_disconnect(socket_id) {
	if (socket_id in ids) {
		if (socket_id in names) { //Only announce named players d/c
			io.emit('chat message',"'"+names[socket_id] + "' has disconnected");
		}
		
		if (socket_id in games) { //Remove all players from games hosted by d/cing player
			remove_all_from_game(socket_id);
		}
		delete names[socket_id];
		delete games[socket_id];
		delete ids[socket_id];
	}
}

function change_name(socket_id, new_name) {
	var check_ok = true;
	Object.keys(names).forEach((sid)=>{
		var value = names[sid];
		if (new_name == value) {
			check_ok = false;
			ids[socket_id].emit('error message', 102, "Tried to change your name to that of an existing player");
			return;
		}
	});
	if (check_ok) {
		var old_name = names[socket_id];
		names[socket_id] = new_name;
		io.emit('chat message', "'" + old_name + "' has changed their name to '" + new_name + "'");
	}
}

function create_game(socket_id, game_name) {
	var check_ok = true;
	Object.keys(games).forEach((g)=>{
		if (game_name == games[g].name) {
			check_ok = false;
			return;
		}
	});
	if (check_ok) {
		if (socket_id in ingame) {
			ids[socket_id].emit('error message', 205, "You cannot host a new game while in a game");
		}
		else {
			var sockt = ids[socket_id];
			io.emit('chat message','Created host game (' + game_name + ')');
			games[socket_id] = new_game_object(game_name);
			games[socket_id].players[socket_id] = new_player_object();
			ingame[socket_id] = socket_id;
			sockt.join(socket_id+"_game");	
		}
	}
	else {
		ids[socket_id].emit('error message', 200, "You cannot host a new game of the same name as another game");
	}
}

function join_game(socket_id, game_name) {
	var host = null;
	Object.keys(games).forEach((g)=>{
		if (game_name == games[g].name) {
			host = g;
			return;
		}
	});
	if (host) {
		if (games[host].started) {
			ids[socket_id].emit('error message',202 ,"Cannot join a game that's already started");
		}
		else {
			io.emit('chat message',"'" + names[socket_id] + "' joined game " + games[host].name);
			games[host].players[socket_id] = new_player_object();
			ingame[socket_id] = host;
			ids[socket_id].join(host+"_game");
		}
	}
	else {
		ids[socket_id].emit('error message',206, "There aren't any games by the name of " + game_name);
	}
}

function leave_game(socket_id, host) {
	if (socket_id != host) {
		io.emit('chat message',"'" + names[socket_id] + "' left game " + games[host].name);
		games[host].players = Object.keys(games[host].players).filter(function(p){
			return p != socket_id;
		});
	}
	else {
		io.emit('chat message','Game ' + games[host].name + ' disbanded');
		remove_all_from_game(host);
		delete games[host];
	}
	ids[socket_id].leave(host+"_game");
	delete ingame[socket_id];
}

function remove_all_from_game(host) {
	Object.keys(games[host].players).forEach(function(pl){
		if (pl != host) {
			leave_game(pl, host);
		}
	});
}

function start_game(socket_id) {
	if (socket_id in games) {
		if (!games[socket_id].started) {
			io.to(socket_id+"_game").emit('chat message',"Game started!");
			games[socket_id].started = true;
		}
		else {
			ids[socket_id].emit('error message',202, "Cannot start a game that is already started!");
		}
	}
	else {
		ids[socket_id].emit('error message',201, "Cannot start game if you're not the host!");
	}
}

function mark_ready(socket_id, ready) {
	if (socket_id in ingame) {
		var host = ingame[socket_id];
		if (games[host].started) {
			games[host].players[socket_id].ready = ready;
		io.to(ingame[socket_id]+"_game").emit('chat message', names[socket_id] + " marked ready as" + ready)
		}
		else {
			ids[socket_id].emit('error message', 203, "The game hasn't started yet!")
		}
	}
	else {
		ids[socket_id].emit('error message', 204, "You're not in a game right now!")
	}
}

function list_players(socket_id) {
	var sockt = ids[socket_id];
	var result = Object.keys(ids).filter((id)=>{
		if (socket_id in ingame) {
			return id in games[ingame[socket_id]].players;
		}
		else {
			return true;
		}
	}).map((id)=>{
		return {"username":names[id],"socket_id":id};
	});
	sockt.emit("response players",result);
}

function list_games(socket_id) {
	var sockt = ids[socket_id];
	var result = Object.keys(games).map((id)=>{
		return {"host_socket_id":id,"host_name":names[id],"game_name":games[id].name};
	});
	sockt.emit("response games",result);
}

function new_game_object(game_name) {
	return {players:{}, name:game_name, started:false, round:0, day:0, game_days:1, stage:0};
		//Round = 0,1,2 = breakfast, lunch, dinner
		//day = what day (collection of 3 rounds) it is
		//game_days = how many total days in this game
		//stage = 0,1,2 = barter, pick, vote
}

function new_player_object() {
	return {hand:[],ready:false,score:0};
}
//
http.listen(3000, function() {
	console.log("Listening on *:3000");
});