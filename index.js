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
const CARDS_DEALT = [7,3,4,5]; //7 initally, 3 after breakfast, 4 after lunch, 5 after dinner
const CARD_LIMITS = [3,4,5]; //brekkie/lunch/dinner play limits
const VOTE_VALUE = 2;

var fs = require("fs");
const CARD_DECK = fs.readFileSync("cards/data/cards.json","utf8",'r');
console.log("ready");
//
var ids = {}; //Keeping track of all user ids and socket objects {socketid:socket}
var names = {}; //Keeping track of all player names: {socketid:name}
var games = {}; //Games that exist (aka total games hosted) {host_socketid:game}
var ingame = {}; //Dictionary keeping track of what games each user is in {player_socketid:host_socketid}
var cardoffers = {}; //Dictionary keeping track of all outstanding card offers, yet to be accepted. {offerer:{recipient:recipient_socketid, cards:[card]}}
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
			leave_game(socketid);
		}
		else if (message == 'change_settings') {
			change_game_settings(socketid, {playernumber:42, daynumber:69});
		}
		else if (message == 'start') {
			start_game(socketid);
		}
		else if (message.startsWith("join")) {
			var room = message.split(" ")[1];
			if (typeof room == 'string') {
				room = room.trim();
				join_game(socketid, room);
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
	socket.on('leave game', function(){
		leave_game(socketid);
	});
	socket.on('start game', function(){
		start_game(socketid);
	});
	socket.on('set game settings', function(settings){
		change_game_settings(socketid, settings);
	});
	
	socket.on('set done bartering', function(done){
		mark_ready(socketid, done);
	});
	socket.on('give cards', function(cards, recip_name){
		give_cards(socketid, cards, recip_name);
	});
	socket.on('accept cards', function(giver_name){
		give_cards(socketid, giver_name);
	});
	socket.on('set play hand', function(cards, description){
		set_play_hand(socketid, cards, description);
	});
	socket.on('vote hand', function(username){
	socket.on('vote hand', function(username){
		vote_hand(socketid, username);
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
	if (socket_id in ingame) {
		ids[socket_id].emit('error message',205, "You're already in a game!");
	}
	else {
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
				if (Object.keys(games[host].players).length < games[host].max_players){
					io.emit('chat message',"'" + names[socket_id] + "' joined game " + games[host].name);
					games[host].players[socket_id] = new_player_object();
					ingame[socket_id] = host;
					ids[socket_id].join(host+"_game");
					send_game_info(host+"_game", host);
				}
				else {
					ids[socket_id].emit('error message',207, "This game is full");
				}
			}
		}
		else {
			ids[socket_id].emit('error message',206, "There aren't any games by the name of " + game_name);
		}
	}
}

function leave_game(socket_id) {
	if (socket_id in ingame) {
		var host = ingame[socket_id];
		if (socket_id != host) {
			io.emit('chat message',"'" + names[socket_id] + "' left game " + games[host].name);
			delete games[host].players[socket_id];
			send_game_info(host+"_game",host);
		}
		else {
			io.emit('chat message','Game ' + games[host].name + ' disbanded');
			remove_all_from_game(host);
			delete games[host];
		}
		if (socket_id in ids) {
			ids[socket_id].leave(host+"_game");
		}
		delete ingame[socket_id];
	}
	else {
		if (socket_id in ids) {
			ids[socket_id].emit('error message',204, "You aren't in any games right now!");
		}
	}
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
			io.to(socket_id+"_game").emit('start game');
			io.to(socket_id+"_game").emit('chat message',"Game started!");
			games[socket_id].started = true;
			
			//Deal with dealing!
			Object.keys(games[socket_id].players).forEach((p)=>{
				deal_cards(p, CARDS_DEALT[0]);
			});
			
			io.to(socket_id+"_game").emit('start day', 1);
			io.to(socket_id+"_game").emit('start meal', 0);
			io.to(socket_id+"_game").emit('start round', 1);
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
			if (games[host].stage == 1) { //In bartering stage
				games[host].players[socket_id].ready = ready;
				io.to(ingame[socket_id]+"_game").emit('chat message', names[socket_id] + " marked ready as" + ready)
				check_all_ready(host);
			}
			else {
				ids[socket_id].emit('error message', 301, "You can't mark finished bartering when it's not the barter stage");
			}
		}
		else {
			ids[socket_id].emit('error message', 203, "The game hasn't started yet!");
		}
	}
	else {
		ids[socket_id].emit('error message', 204, "You're not in a game right now!");
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

function give_cards(socket_id, cards, recipient_name) {
	if (socket_id in ingame) {
		var host = ingame[socket_id];
		if (games[host].started) {
			if (games[host].stage == 1) {//bartering
				var recip_socket_id = name_lookup(recipient_name);
				if (recip_socket_id) {
					if (recip_socket_id in ingame && ingame[recip_socket_id] == host) {
						if (hand_subset(cards, games[host].players[socket_id].hand)) {
							if (cards.length > 0) {
								cardoffers[socket_id] = new_offer_object(cards, recip_socket_id);
								ids[recip_socket_id].emit('cards offered',cards, names[socket_id]);
							}
							else {
								delete cardoffers[socket_id];
							}
						}
						else {
							ids[socket_id].emit('error message',300, "Some of those cards you're offering aren't even in your hand... what are you trying to pull?");
						}
						
					}
					else {
						ids[socket_id].emit('error message',300, "That player is not in the same game as you");
					}
				}
				else {
					ids[socket_id].emit('error message',103, "Cannot find a player by that name");
				}
			} 
			else {
				ids[socket_id].emit('error message', 301, "You can't give cards when it's not the barter stage");
			}
		}
		else {
			ids[socket_id].emit('error message', 203, "The game hasn't started yet!");
		}
	} else {
		ids[socket_id].emit('error message', 204, "You're not in a game right now!");
	}
}

function accept_cards(socket_id, giver_name) {
	if (socket_id in ingame) {
		var host = ingame[socket_id];
		if (games[host].started) {
			if (games[host].stage == 1) {//bartering
				var giver_socket_id = name_lookup(giver_name);
				if (giver_socket_id) {
					if (giver_socket_id in ingame && ingame[giver_socket_id] == host) {
							if (giver_socket_id in cardoffers && cardoffers[giver_socket_id].recipient == socket_id) {
								var cards = cardoffers[giver_socket_id].cards;
								delete cardoffers[giver_socket_id];
								remove_cards_from_hand(giver_socket_id, cards);
								add_cards_to_hand(socket_id, cards);
								ids[recip_socket_id].emit('cards accepted', names[socket_id]);
							}
							else {
								ids[socket_id].emit('error message',300, "That player never offered you anything!");
							}
						}
						else {
							ids[socket_id].emit('error message',300, "That player is not in the same game as you");
						}
				}
				else {
					ids[socket_id].emit('error message',103, "Cannot find a player by that name");
				}
			} 
			else {
				ids[socket_id].emit('error message', 301, "You can't give cards when it's not the barter stage");
			}
		}
		else {
			ids[socket_id].emit('error message', 203, "The game hasn't started yet!");
		}
	} else {
		ids[socket_id].emit('error message', 204, "You're not in a game right now!");
	}
}

function set_play_hand(socket_id, cards, description) {
	if (socket_id in ingame) {
		var host = ingame[socket_id];
		if (games[host].started) {
			if (games[host].stage == 2) { //pick
				if (hand_subset(cards, games[host].players[socket_id].hand)) {
					if (cards.length <= CARD_LIMITS[games[host].round]) {
						games[host].players[socket_id].play_hand = cards;
						games[host].players[socket_id].play_description = description;
						check_all_played(host);
					}
					else {
						ids[socket_id].emit('error message', 300, "That is above the number of cards allowed for this meal");
					}
				}
				else {
					ids[socket_id].emit('error message', 300, "Some of those cards you're playing aren't even in your hand. What are you trying to pull...?");
				}
			}
			else {
				ids[socket_id].emit('error message', 301, "You can't set your play hand when it's not the pick stage");
			}
		}
		else {
			ids[socket_id].emit('error message', 203, "The game hasn't started yet!");
		}
	}
	else {
		ids[socket_id].emit('error message', 204, "You're not in a game right now!");
	}
}

function vote_hand(socket_id, username) {
	if (socket_id in ingame) {
		var host = ingame[socket_id];
		if (games[host].started) {
			if (games[host].stage == 3) {//voting
				var to_vote_socket = name_lookup(username);
				if (to_vote_socket) {
					if (to_vote_socket in ingame && ingame[to_vote_socket] == host) {
						if (to_vote_socket != socket_id) {
							games[host].players[socket_id].voting_for = to_vote_socket;
							check_all_voted(host);
						}
						else {
							ids[socket_id].emit('error message',300, "You can't vote for yourself, dummy!");
						}
					}
					else {
						ids[socket_id].emit('error message',300, "That player is not in the same game as you");
					}
				}
				else {
					ids[socket_id].emit('error message',103, "Cannot find a player by that name");
				}
			} 
			else {
				ids[socket_id].emit('error message', 301, "You can't vote when not in the voting stage");
			}
		}
		else {
			ids[socket_id].emit('error message', 203, "The game hasn't started yet!");
		}
	} else {
		ids[socket_id].emit('error message', 204, "You're not in a game right now!");
	}
}

function change_game_settings(host,settings) {
	if (host in games) {
		var playernumber = settings.playernumber;
		var daynumber = settings.daynumber;
		games[host].game_days = daynumber;
		games[host].max_players = playernumber;
	}
	else {
		ids[host].emit('error message',201, "Cannot edit game settings if you're not the host!");
	}
}

// ------------------- //

function name_lookup(username) { //Returns socket
	var ret = null;
	Object.keys(names).forEach((socket_id)=>{
		if (username == names[socket_id]) {
			ret = socket_id;
			return;
		}
	});
	return ret;
}

function hand_subset(sub, main) {
	return sub.every((card)=>{
		main.includes(card)
	});
}

function shuffle(array) { //From https://medium.com/@nitinpatel_20236/how-to-shuffle-correctly-shuffle-an-array-in-javascript-15ea3f84bfb
	for (let i = array.length - 1; i > 0; i--) {
	  const j = Math.floor(Math.random() * i);
	  const temp = array[i];
	  array[i] = array[j];
	  array[j] = temp;
	}
}

// ------------------- //

function remove_cards_from_hand(socket_id, cards) {
	var host = ingame[socket_id];
	games[host].players[socket_id].hand = games[host].players[socket_id].hand.filter((card)=>{
		var to_keep = true;
		for (var i = 0; i < cards.length; ++i) {
			if (card.id == cards[i].id) {
				return false;
			}
		}
		return true;
	});
}

function add_cards_to_hand(socket_id, cards) {
	var host = ingame[socket_id];
	games[host].players[socket_id].hand = games[host].players[socket_id].hand.concat(cards);
}

function deck_deal(host, cardnumber) {
	var dealt = [];
	for (var i = 0; i < cardnumber; ++i) {
		if (games[host].deck.length == 0) { //Reshuffle if needed
			var temp = games[host].deck.concat(games[host].discard);
			shuffle(temp);
			games[host].deck = temp;
			games[host].discard = [];
		}
		dealt.push(games[host].deck.pop());
	}
	return dealt;
}

function send_game_info(game_room,host) {
	io.to(game_room).emit('game info',{players:Object.keys(games[host].players).map((p)=>{return {username:names[p], socket_id:p}}), settings:{playernumber:games[host].max_players, daynumber:games[host].game_days}});
}

function deal_cards(player, number) {
	var host = ingame[player];
	var p_socket = ids[player];
	var new_hand = deck_deal(host, number);
	games[host].players[player].hand.concat(new_hand);
	p_socket.emit('deal cards', new_hand);
}

function check_all_ready(host) { //Triggered when someone marks ready -- is everybody marked ready
	var check_ok = true;
	Object.keys(games[host].players).forEach((p)=>{
		if (!games[host].players[p].ready) {
			check_ok = false;
			return;
		}
	});
	if (check_ok) { //Everyone is ready
		io.to(host+"_game").emit('start round', 2);
	}
}

function check_all_played(host) {
	var check_ok = true;
	Object.keys(games[host].players).forEach((p)=>{
		if (games[host].players[p].play_hand == []) {
			check_ok = false;
			return;
		}
	});
	if (check_ok) {
		if (check_ok) { //Everyone has set their play hand
			Object.keys(games[host].players).forEach((p)=>{
				remove_cards_from_hand(p, games[host].players[p].play_hand);
			});
			io.to(host+"_game").emit('start round', 3);
		}
	}
}

function check_all_voted(host) {
	var check_ok = true;
	Object.keys(games[host].players).forEach((p)=>{
		if (games[host].players[p].voted == null) {
			check_ok = false;
			return;
		}
	});
	if (check_ok) {
		end_meal(host);
	}
}

function end_meal(host) {
	var votes = {};
	Object.keys(games[host].players).forEach((p)=>{
		votes[p] = 0;
	});
	var play_hands = {};
	var scores = {};
	
	Object.keys(games[host].players).forEach((p)=>{
		//Tally points
		votes[games[host].players[p].voting_for]++;
		play_hands[p] = games[host].players[p].play_hand;
		
		//Reset
		games[host].players[p].ready = false;
		games[host].discard.concat(games[host].players[p].play_hand);
		games[host].players[p].play_hand = [];
		games[host].players[p].voting_for = null;
		
		//Deal new cards
		deal_cards(p, CARDS_DEALT[games[host].round+1]);
	});
	
	var stats = {};
	
	Object.keys(games[host].players).forEach((p)=>{
		scores[p] = tally_score(play_hands[p], votes[p], games[host].round);
		games[host].players[p].score += scores[p];
		stats[p] = {score:scores[p], votes:votes[p]};
	});
	
	io.to(host+"_game").emit('end meal', stats);
	games[host].round++;
	if (games[host].round >= 3) { //Done with the day!
		end_day(host);
	}
	else {
		io.to(host+"_game").emit('start meal', games[host].round);
		io.to(host+"_game").emit('start round', 1); //Back to bartering!
		games[host].stage = 1;
	}
	
}

function end_day(host) {
	games[host].day++;
	if (games[host].day>games[host].game_days) {
		end_game(host);
	}
	else {
		io.to(host+"_game").emit('start day', games[host].day);
		io.to(host+"_game").emit('start meal', 0);
		io.to(host+"_game").emit('start round', 1); //Back to bartering!
		games[host].round = 0; //Reset to breakfast!
		games[host].stage = 1; //Reset to bartering
	}
}

function end_game(host) {
	var scores = {};
	Object.keys(games[host].players).forEach((p)=>{
		scores[p] = games[host].players[p].score;
	});
	io.to(host+"_game").emit('end game', scores);
	leave_game(host);
}

function tally_score(hand, votes, meal) {
	score = 0;
	hand.forEach((card)=>{
		score += card.value[meal];
	});
	return score + (VOTE_VALUE*votes);
}

// --------------------//

function new_deck() {
	var deck = JSON.parse(CARD_DECK);
	shuffle(deck);
	return deck;
}



function new_game_object(game_name) {
	return {players:{}, max_players:4, name:game_name, started:false, round:0, day:0, game_days:1, stage:0, deck:[], discard:[]};
		//Round = 0,1,2 = breakfast, lunch, dinner -- aka meal
		//day = what day (collection of 3 rounds) it is
		//game_days = how many total days in this game
		//stage = 0,1,2,3 = pregame,barter, pick, vote -- aka round (i know it's confusing sry)
}

function new_player_object() {
	return {hand:[],play_hand:[],play_description:'',voting_for:null,ready:false,score:0};
	//hand = all cards in hand
	//play_hand = cards in current play hand (play round only)
	//play_description = description of play_hand
	//voting_for = in voting stage, who is the player voting for (null = nobody yet)
	//ready = bartering round marked done
	//score = score
}

function new_offer_object(cards, recipient) {
	return {cards:cards, recipient:recipient};
}
//
http.listen(3000, function() {
	console.log("Listening on *:3000");
});