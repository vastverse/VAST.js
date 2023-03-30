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
 * node new_client.js 1 192.168.1.10 8000 500 600 10
 * 
 */

const client = require('../lib/client');
require('../lib/common.js');
require('dotenv').config();

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

C = new client(gwHost, gwPort, alias, x, y, r, function (id) {
    _id = id;
    console.log("Client " + alias + " successfully created");
    let m = C.getMatcherID();
    console.log("Assigned to matcher with id " + m);
});
// });