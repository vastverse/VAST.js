var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var client_socket = {};
var client_instance = {};

const client = require('../lib/client');
require('../lib/common.js');
require('dotenv').config();
const SIZE = 1000; // world size
var C;

io.on('connection', function(socket){
    console.log('a user connected');

    socket.on('handshake', function(uuid, msg){
        console.log('Received handshake: "' + msg + '" from client with UUID: ' + uuid);
        // var uuid = msg.split("UUID: ")[1];
        client_socket[uuid] = socket;
        socket.emit('handshake', 'Hello, client with UUID: ' + uuid + '. This is Node.js Server.');
    });

    socket.on('disconnect', function() {
        console.log('user disconnected');
        const uuid = Object.keys(client_socket).find(key => client_socket[key] === socket);
        console.log(`Looking up client instance for UUID: ${uuid}`);

        if (client_instance[uuid]) {
            console.log(`Disconnecting client instance for UUID: ${uuid}`);

            // console.log('Client ID: '+client_instance[uuid].getAlias())
            // client_instance[uuid].setAlias("alias")
            // console.log('Client ID: '+client_instance[uuid].getAlias())
            client_instance[uuid].disconnect();
            delete client_instance[uuid];
        } else {
            console.log(`No client instance found for UUID: ${uuid}`);
        }
        delete client_socket[uuid];
    });

    socket.on('spawn_VASTclient', async function(alias, gwHost, gwPort) {
        console.log('VAST client spawn');
        var x = Math.random() * SIZE;
        var y = Math.random() * SIZE;
        var r = 10; // radius
        id = generateId();

        const C = await createClientAsync(socket, gwHost, gwPort, id, x, y, r);
        
        console.log('Finished creating client');
        C.setAlias(alias)
        console.log('Finished setting alias');

        const uuid = Object.keys(client_socket).find(key => client_socket[key] === socket);
        console.log(`Adding client instance for UUID: ${uuid}`);
        client_instance[uuid] = C;

        socket.emit('log', 'Client that represents server on VAST has spawned.');
    });

    

    socket.on('subscribe', function(x, y, radius, channel) {
        const uuid = Object.keys(client_socket).find(key => client_socket[key] === socket);
        client_instance[uuid].subscribe(x, y, radius, channel);
        console.log(`Subscribed to channel '${channel}' at AoI [${x}; ${y}; ${radius}]`);
    });

    socket.on('publish', function(connectionID, username, x, y, radius, actualPacket, channel) {

        // console.log('x value: ' + x);
        // console.log('y value: ' + y);
        // console.log('r value: ' + radius);
        // console.log('payload value: ' + payload);
        // console.log('channel: ' + channel);

        // console.log('This is the actaul packet: ' + actualPacket)

        data = {} // should be 
        data["connectionID"] = connectionID;
		data["username"] = username;
		data["x"] = x;
		data["y"] = y;
		data["radius"] = radius;
		data["actualPacket"] = actualPacket;
		data["channel"] = channel;


        const uuid = Object.keys(client_socket).find(key => client_socket[key] === socket);
        client_instance[uuid].publish(x, y, radius, data, channel);
        
        console.log(`Published to channel '${channel}' with payload '${data}' at AoI [${x}; ${y}; ${radius}]`);
    });

    socket.on('unsubscribe', function(subID) {
        const uuid = Object.keys(client_socket).find(key => client_socket[key] === socket);
        client_instance[uuid].unsubscribe(subID);
        console.log(`Unsubscribed from subscription with ID '${subID}'`);
    });

    socket.on('move', function(x, y) {
        const uuid = Object.keys(client_socket).find(key => client_socket[key] === socket);
        client_instance[uuid].move(x, y);
        console.log(`Moved client to position [${x}; ${y}]`);
    });

    socket.on('disconnect_client', function() {
        const uuid = Object.keys(client_socket).find(key => client_socket[key] === socket);
        client_instance[uuid].disconnect();
        delete client_instance[uuid];
        console.log('Disconnected client from matcher');
    });

    socket.on('clearsubscriptions', function() {
        const uuid = Object.keys(client_socket).find(key => client_socket[key] === socket);
        client_instance[uuid].clearSubscriptions();
        console.log('Cleared all subscriptions');
    });

});

http.listen(3456, function(){
  console.log('listening on *:3456');
});

function generateId() {
    let id = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < 5; i++) {
        id += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    return id;
}

function createClientAsync(socket, gwHost, gwPort, id, x, y, r) {
    // Return a new promise.
    return new Promise((resolve, reject) => {
        // Do something to create a client instance asynchronously.
        // In this example, we're just simulating an async operation using setTimeout.
        setTimeout(() => {
            const C = new client(socket, gwHost, gwPort, id, x, y, r, function (id) {
                    _id = id;
                    console.log(`Client ${x}, ${y} successfully created with id: ${id}`);
                    let m = C.getMatcherID();
                    console.log(`Assigned to matcher with id ${m}`);
                });
            console.log('Done?');
            resolve(C);
        }, 0);  // 0 millisecond delay, change to simulate async operation
    });
}