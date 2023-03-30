/**
 * start_matcher.js
 *
 * This script initializes a matcher using the matcher.js library.
 * The matcher is configured based on command-line arguments or
 * default values if arguments are not provided.
 *
 * Usage:
 * node start_matcher.js [alias] [x] [y] [isGateway] [GW_host] [GW_port] [VON_port] [client_port] [radius]
 *
 * Arguments:
 * - alias: The matcher alias (default: 1)
 * - x: The x-coordinate of the matcher (default: random value between 0 and 1000) (Currently only 0 <= x <= 1000 is supported.)
 * - y: The y-coordinate of the matcher (default: random value between 0 and 1000) (Currently only 0 <= x <= 1000 is supported.)
 * - isGateway: The boolean flag indicating if the matcher is a gateway (default: true) (only single gateway is currently supported)
 * - GW_host: The gateway host address (default: "localhost") - The address of the GW peer to connect to
 * - GW_port: The gateway port (default: 8000) - The port the GW is listening on for other Matcher connections
 * - VON_port: The VON port (default: 8001) - The port we are listening on for other matchers. Will automatically increment if in use.
 * - client_port: The client port (default: 20000) - The port the matcher listens on for client connections.
 * - radius: The search radius of the matcher (default: 100) (The VON peer will always be aware of enclosing neighbours, but will connect to any additional neighbours that fall in this circle.)
 * 
 * Example:
 * node start_matcher.js 1 500 600 true 192.168.1.10 8000 8001 20000 150
 * 
 */


const matcher = require('../lib/matcher.js');
// const UTIL = require('../lib/util.js');
require('dotenv').config()

const alias = parseInt(process.argv[2], 10) || 1;
const x = parseFloat(process.argv[3]) || Math.random() * 1000;
const y = parseFloat(process.argv[4]) || Math.random() * 1000;

const isGateway = process.argv[5] ? process.argv[5].toLowerCase() === 'true' : true;
const gwHost = process.argv[6] || "localhost";
const gwPort = parseInt(process.argv[7], 10) || 8000;

const vonPort = parseInt(process.argv[8], 10) || 8001;
const clientPort = parseInt(process.argv[9], 10) || 20000;

const radius = parseFloat(process.argv[10]) || 100;

UTIL.lookupIP(gwHost, function (addr) {
  const M = new matcher(
    x,
    y,
    radius,
    {
      isGateway: isGateway,
      GW_host: addr,
      GW_port: gwPort,
      VON_port: vonPort,
      client_port: clientPort,
      alias: alias,
      logDisplayLevel: 5,
      logRecordLevel: 5,
      eventDisplayLevel: 5,
      eventRecordLevel: 5,
    },
    function (id) {
      console.log('Matcher: ' + alias + ' created with ID: ' + id);
    }
  );
});
