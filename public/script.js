$(function () {
	var username = "";
	var user_id = -1;
	var socket = io();
	$('form').submit(function(e){ //Send Chat
		e.preventDefault(); // prevents page reloading
		if (username != '') {
			socket.emit('chat message',$('#m').val());
			$('#m').val('');
			return false;
		}
		else {
			$('#messages').append("Please choose a username!\n");
		}
	});
	socket.on('connect', function(){
		user_id = socket.sessionid;
	})
	$('#name').change(function(){ //Change username
		if (username != '') {
			socket.emit('name change', {old_name:username, new_name:$('#name').val()})
		}
		else {
			user_id = Math.floor(Math.random()*10000);
			socket.emit('join',$('#name').val());
		}
			
		username = $('#name').val();
	});
	socket.on('chat message', function(msg){
		$('#messages').append($('<li>').text(msg));
    });
});