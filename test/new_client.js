/**
 * new_client.js
 *
 * This script initializes a new client using the client.js library.
 * The client is configured based on command-line arguments or
 * default values if arguments are not provided.
 *
 * Usage:
 * node new_client.js [alias] [GW_host] [GW_port] [x_ord] [y_ord] [radius]
 *
 * Arguments:
 * - alias: The client alias (default: 1)
 * - GW_host: The gateway host address (default: "127.0.0.1") - The address of the GW matcher to connect to
 * - GW_port: The gateway port (default: 8000) - The port the GW is listening on for client connections
 * - x_ord: The x-coordinate of the client (default: random value between 0 and 1000) (Currently only 0 <= x <= 1000 is supported.)
 * - y_ord: The y-coordinate of the client (default: random value between 0 and 1000) (Currently only 0 <= y <= 1000 is supported.)
 * - radius: The search radius of the client (default: 10) (Currently unused.)
 * 
 * Example:
 * node new_client.js 1 192.168.1.10 20000 500 600 10
 * 
 */

const client = require('../lib/client');
require('../lib/common.js');
require('dotenv').config();

const readline = require('readline'); // allows the client server to read user input in the terminal
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'Enter command: '
});

const SIZE = 1000; // world size

const alias = parseInt(process.argv[2], 10) || 1;
const gwHost = process.argv[3] || "127.0.0.1";
const gwPort = parseInt(process.argv[4], 10) || 8000;

// my position and AoI to subscribe for PONG messages
var x = parseFloat(process.argv[5]) || Math.random() * SIZE;
var y = parseFloat(process.argv[6]) || Math.random() * SIZE;
var r = parseFloat(process.argv[7]) || 10; // radius

var wait_to_ping = parseInt(process.argv[8]) || 1000; // wait 1 min for all clients to finish joining
var ping_refresh_time = parseInt(process.argv[9]) || 1000; // time between pings

var _id;
var C;

// UTIL.lookupIP("127.0.0.1", function (addr) {
    // GW_addr = addr;

function processInput(input) {
    const [command, ...args] = input.split(' ');
    if (command === 'help') {
            console.log(`
    Available commands:
    - subscribe <x> <y> <radius> <channel>: Subscribe to a channel at a specific AoI.
    - publish <x> <y> <radius> <payload> <channel>: Publish a message with a payload to a channel within a specific AoI.
    - unsubscribe <subID>: Unsubscribe from a subscription with the given ID.
    - move <x> <y>: Move the client to the specified x and y coordinates.
    - disconnect: Disconnect the client from the matcher.
    - clearsubscriptions: Clear all client subscriptions.
    - help: Display this help message.
            `);
    }
    if (command === 'subscribe') {
        if (args.length === 4) {
            const x = parseFloat(args[0]);
            const y = parseFloat(args[1]);
            const radius = parseFloat(args[2]);
            const channel = args[3];

            C.subscribe({x: x, y: y, radius: radius}, channel);
            console.log(`Subscribed to channel '${channel}' at AoI [${x}; ${y}; ${radius}]`);
        } else {
            console.log('Invalid arguments. Usage: subscribe <x> <y> <radius> <channel>');
        }
    } else if (command === 'square_sub') {
        const test_points = [
            { x: 50, y: 50 },
            { x: 300, y: 50 },
            { x: 50, y: 300 },
            { x: 300, y: 300 }
        ];

        C.subscribe(test_points, "clientBound");

    } else if (command === 'publish') {
        if (args.length === 5) {
            const x = parseFloat(args[0]);
            const y = parseFloat(args[1]);
            const radius = parseFloat(args[2]);
            const payload = args[3];
            const channel = args[4];

            C.publish(x, y, radius, payload, channel);
            console.log(`Published to channel '${channel}' with payload '${payload}' at AoI [${x}; ${y}; ${radius}]`);
        } else {
            console.log('Invalid arguments. Usage: publish <x> <y> <radius> <payload> <channel>');
        }
    } else if (command === 'unsubscribe') {
        if (args.length === 1) {
            const subID = args[0];

            C.unsubscribe(subID);
            console.log(`Unsubscribed from subscription with ID '${subID}'`);
        } else {
            console.log('Invalid arguments. Usage: unsubscribe <subID>');
        }
    } else if (command === 'move') {
        if (args.length === 2) {
            const x = parseFloat(args[0]);
            const y = parseFloat(args[1]);

            C.move(x, y);
            console.log(`Moved client to position [${x}; ${y}]`);
        } else {
            console.log('Invalid arguments. Usage: move <x> <y>');
        }
    } else if (command === 'disconnect') {
        C.disconnect();
        console.log('Disconnected client from matcher');
    } else if (command === 'clearsubscriptions') {
        C.clearSubscriptions();
        console.log('Cleared all subscriptions');
    } else {
        console.log('Invalid command. Available commands: subscribe, publish, unsubscribe, move, disconnect, clearsubscriptions');
    }

    rl.prompt();
}
    

rl.on('line', processInput);



C = new client(null, gwHost, gwPort, alias, x, y, r, function (id) {
    _id = id;
    console.log("Client " + alias + " successfully created");
    let m = C.getMatcherID();
    console.log("Assigned to matcher with id " + m);

    rl.prompt();
});
// });
