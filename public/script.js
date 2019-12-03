$(function () {
	var username = "";
	var user_id = -1;
	var socket = io();
	$('form').submit(function(e){ //Send Chat
		e.preventDefault(); // prevents page reloading
		socket.emit('chat message',$('#m').val());
		$('#m').val('');
		return false;
	});
	socket.on('connect', function(){
		user_id = socket.sessionid;
	})
	$('#name').change(function(){ //Change username
		if (username != '') {
			socket.emit('name change',$('#name').val());
		}
		else {
			socket.emit('lobby join',$('#name').val());
		}
			
		username = $('#name').val();
	});
	socket.on('chat message', function(msg){
		$('#messages').append($('<li>').text(msg));
    });
	
	//FOR TESTING ONLY
	socket.on('error message', function(code, msg){
		$('#messages').append($('<li>').text("ERROR "+code+": "+msg));
    });
	
	socket.on('response players', function(players){
		$('#messages').append($('<li>').text(JSON.stringify(players)));
    });
	
	socket.on('response games', function(games){
		$('#messages').append($('<li>').text(JSON.stringify(games)));
    });
});