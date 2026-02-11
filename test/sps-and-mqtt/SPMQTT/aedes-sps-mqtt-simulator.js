const aedesOpts = {
  VAST: true,
  VASTGateway: true,
  VASTx: 250,
  VASTy: 500,
  VASTport: 8000,
  VASTradius: 50,
  connectTimeout: 30000,  // Add explicit timeout value
  keepalive: 60          // Add keepalive value
};

const fs = require('fs');
const path = require('path');
// const aedes = require('../aedes');
const aedes = require('../../../../aedes');
const net = require('net');
const mqtt = require('mqtt');
require('../../../lib/common');  // This will make Client_Event available globally

// Add random string generation function
function _randomString(length) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

// Add subID generation function
function _generate_subID(clientID) {
    return clientID + '-' + _randomString(5);
}

// Store clients for later use
const simulatedClients = {};
let brokerPort = 1884;  // Default port, will be updated when broker starts
let brokerPosition = { x: 0, y: 0 };

// Add at the top with other global variables
const subscriptions = new Map();  // Store subscriptions: topic -> Set of clientIds
const pubInfoByPubId = new Map(); // Track pubID -> { clientID, aoi, channel, payload }

// Create logs directory structure
const LOGS_DIR = path.join(__dirname, '../logs');
const SPMQTT_LOGS_DIR = path.join(LOGS_DIR, 'spmqtt_events');
const CLIENT_LOGS_DIR = path.join(SPMQTT_LOGS_DIR, 'clients');
const BROKER_LOG_PATH = path.join(SPMQTT_LOGS_DIR, 'broker.txt');
const EVENTS_LOG_PATH = path.join(SPMQTT_LOGS_DIR, 'spmqtt_client_events.txt');
const CLIENT_EVENTS_LOG_PATH = path.join(SPMQTT_LOGS_DIR, 'spmqtt_client_events_no_broker.txt');
const CLIENT_MESSAGES_LOG_PATH = path.join(SPMQTT_LOGS_DIR, 'spmqtt_client_messages.txt');

// Configuration flags
const ENABLE_CLIENT_LOGS = true;  // Enable individual client log files

// Script file path
const SCRIPT_FILE = path.join(__dirname, '../simScripts/01_Generate_Node/Scripts_2025-11-07_07-50-43/sps/simulation_test_uniform.txt');
// /Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/simScripts/01_Generate_Node/Scripts_2025-11-07_07-50-43/sps/simulation_test_uniform.txt

// Ensure directories exist
fs.mkdirSync(LOGS_DIR, { recursive: true });
fs.mkdirSync(SPMQTT_LOGS_DIR, { recursive: true });
fs.mkdirSync(CLIENT_LOGS_DIR, { recursive: true });

function startBroker(port = 1884) {
    const brokerOptions = {
        ...aedesOpts,
        authenticate: (client, username, password, cb) => cb(null, true) // accept everyone
    };

    // Validate timeout values
    if (isNaN(brokerOptions.connectTimeout)) {
        brokerOptions.connectTimeout = 30000; // Default to 30 seconds if invalid
    }

    const broker = aedes(brokerOptions);

    // Attach the matcher manually if needed
    if (!broker.matcher && typeof broker.createMatcher === 'function') {
        broker.matcher = broker.createMatcher();
    }

    // Add client connection logging
    broker.on('client', (client) => {
        logToFile(`Client ${client.id} connected to broker`);
    });

    broker.on('clientDisconnect', (client) => {
        logToFile(`Client ${client.id} disconnected from broker`);
    });

    broker.on('subscribe', (subscriptions, client) => {
        subscriptions.forEach(sub => {
            logToFile(`Client ${client ? client.id : 'unknown'} subscribed to ${sub.topic}`);
        });
    });

    broker.on('publish', (packet, client) => {
        if (!packet.topic.startsWith('$SYS')) {
            logToFile(`${client ? client.id : 'BROKER'} published to ${packet.topic}: ${packet.payload.toString()}`);
        }
    });

    const server = net.createServer(broker.handle);

    // Try to start the server with error handling
    const startServer = (port) => {
        return new Promise((resolve, reject) => {
            server.once('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    logToFile(`Port ${port} is in use, trying port ${port + 1}`);
                    server.close();
                    resolve(startServer(port + 1));
                } else {
                    reject(err);
                }
            });

            server.listen(port, () => {
                logToFile(`Aedes broker started on port ${port}`);
                // Log broker configuration for debugging
                logToFile(`Broker configuration: ${JSON.stringify(brokerOptions, null, 2)}`);
                resolve(port);
            });
        });
    };

    return startServer(port).then(actualPort => {
        return { broker, server, port: actualPort };
    });
}

// Centralized logging functions
function logToFile(message) {
    const timestamp = Date.now();
    const line = `[${timestamp}] ${message}\n`;
    console.log(line.trim());
    
    const logPath = path.join(LOGS_DIR, 'spmqtt_broker.txt');
    fs.appendFile(logPath, line, (err) => {
        if (err) console.error('Error writing to broker log:', err);
    });
}

// VAST-style logger for client events only
function logClientEvent(clientId, eventType, data) {
    const eventObj = {
        time: Date.now(),
        event: eventType,
        id: clientId,
        alias: "unnamed_client",
        matcher: 1,
        ...data
    };
    const line = JSON.stringify(eventObj) + '\n';
    fs.appendFileSync(CLIENT_EVENTS_LOG_PATH, line);
}

function logClientMessage(clientId, topic, message) {
    const timestamp = Date.now();
    const logEntry = JSON.stringify({
        time: timestamp,
        clientId,
        topic,
        message: message.toString()
    }) + '\n';

    fs.appendFile(CLIENT_MESSAGES_LOG_PATH, logEntry, (err) => {
        if (err) {
            console.error('Error writing to client messages log:', err);
        }
    });
}

function logClient(clientId, message) {
    const timestamp = Date.now();
    const line = `[${timestamp}] ${message}\n`;
    console.log(`[CLIENT ${clientId}] ${line.trim()}`);
    
    // Write to individual client log files if enabled
    if (ENABLE_CLIENT_LOGS) {
        const clientLogPath = path.join(CLIENT_LOGS_DIR, `client_${clientId}.txt`);
        fs.appendFile(clientLogPath, line, (err) => {
            if (err) console.error(`Error writing to client ${clientId} log:`, err);
        });
    }
    
    // Always write to events log
    fs.appendFile(EVENTS_LOG_PATH, line, (err) => {
        if (err) console.error('Error writing to events log:', err);
    });
}

function createClient(clientId, host, port, x, y, r) {
    const url = `mqtt://${host}:${port}`;
    const authPayload = JSON.stringify({ x, y, r });

    const options = {
        clientId,
        username: clientId,
        password: authPayload,
        clean: true,
        reconnectPeriod: 1000,
        connectTimeout: 30_000
    };

    const client = mqtt.connect(url, options);

    logClient(clientId, `Connecting to ${host}:${port} with position (${x}, ${y}) and radius ${r}`);

    // Log CLIENT_JOIN event
    logClientEvent(clientId, Client_Event.CLIENT_JOIN, {
        pos: { x, y },
        radius: r,
        matcher: 1
    });

    client.on('connect', () => {
        logClient(clientId, 'Connected to broker');
        // Log CLIENT_CONNECT event
        logClientEvent(clientId, Client_Event.CLIENT_CONNECT, {
            pos: { x, y },
            radius: r,
            matcher: 1
        });
        // Log CLIENT_MIGRATE event
        logClientEvent(clientId, Client_Event.CLIENT_MIGRATE, {
            pos: { x, y },
            radius: r,
            matcher: 1
        });
        simulatedClients[clientId] = { client, x, y, r };
    });

    client.on('reconnect', () => {
        logClient(clientId, 'Reconnecting to broker');
        logClientEvent(clientId, Client_Event.CLIENT_MIGRATE, {
            pos: { x, y },
            radius: r,
            matcher: 1
        });
    });

    client.on('error', (err) => {
        logClient(clientId, `Error: ${err.message}`);
        logClientEvent(clientId, Client_Event.CLIENT_DISCONNECT, {
            error: err.message,
            pos: { x, y },
            radius: r,
            matcher: 1
        });
    });

    client.on('close', () => {
        logClient(clientId, 'Disconnected from broker');
        logClientEvent(clientId, Client_Event.CLIENT_LEAVE, {
            pos: { x, y },
            radius: r,
            matcher: 1
        });
    });

    client.on('message', (topic, message) => {
        const [pubId, payload] = message.toString().split(':');
        logClient(clientId, `Received message on topic ${topic}: ${payload}`);
        logClientMessage(clientId, topic, message);
        // Look up publisher info for this pubId
        let pubInfo = pubInfoByPubId.get(pubId);
        if (!pubInfo) {
            // fallback: use receiver's info if not found
            pubInfo = {
                clientID: clientId,
                aoi: { center: { x, y }, radius: r },
                channel: topic,
                payload: payload
            };
        }
        logClientEvent(clientId, Client_Event.RECEIVE_PUB, {
            pub: {
                matcherID: 1,
                clientID: pubInfo.clientID, // publisher's clientID
                pubID: pubId,
                aoi: pubInfo.aoi, // publisher's AOI
                payload: pubInfo.payload, // publisher's payload
                channel: pubInfo.channel, // publisher's channel
                recipients: [1],
                chain: [1]
            }
        });
    });

    return client;
}

async function processScript(scriptPath) {
    const script = fs.readFileSync(scriptPath, 'utf8');
    const lines = script.split('\n');
    
    // Read broker position from first line
    const firstLine = lines[0].trim();
    if (firstLine.startsWith('newMatcher')) {
        const parts = firstLine.split(' ');
        if (parts.length >= 9) {
            brokerPosition = {
                x: parseFloat(parts[7]),
                y: parseFloat(parts[8])
            };
            console.log(`Broker position set to: (${brokerPosition.x}, ${brokerPosition.y})`);
        }
    }

    try {
        for (let index = 0; index < lines.length; index++) {
            const line = lines[index].trim();
            // Skip empty lines and comment lines
            if (line === '' || line.startsWith('//')) continue;
            await processLine(line, index + 1);
        }
    } catch (err) {
        logToFile(`Error reading script: ${err.message}`);
    }
}

async function processLine(line, lineNumber) {
    const parts = line.trim().split(' ');
    const command = parts[0].toLowerCase();

    switch (command) {
        case 'wait':
            const waitTime = parseInt(parts[1]);
            logToFile(`Waiting for ${waitTime}ms`);
            return new Promise(resolve => setTimeout(resolve, waitTime));

        case 'newmatcher':
            const [_, matcherId, isGateway, host, port, x, y, radius] = parts;
            logToFile(`Creating new matcher ${matcherId} at ${host}:1884 position (${x}, ${y}) radius ${radius}`);
            return startBroker(1884);  // Use default port 1884 for SPS-MQTT broker

        case 'newclient':
            const [__, clientId, clientHost, clientPort, clientX, clientY, clientR] = parts;
            logToFile(`Creating new client ${clientId} at ${clientHost}:1884 position (${clientX}, ${clientY}) radius ${clientR}`);
            const client = createClient(clientId, clientHost, 1884, parseInt(clientX), parseInt(clientY), parseInt(clientR));
            return Promise.resolve();

        case 'subscribe':
            const [___, subClientId, subX, subY, subRadius, channel] = parts;
            const topicObj = { x: parseInt(subX), y: parseInt(subY), radius: parseInt(subRadius), channel };
            const topic = `sp: <${JSON.stringify(topicObj)}>`;
            logToFile(`Client ${subClientId} subscribing to topic ${topic}`);
            const subClient = simulatedClients[subClientId];
            if (!subClient) {
                logToFile(`Error: Client ${subClientId} not found`);
                return Promise.reject(new Error(`Client ${subClientId} not found`));
            }
            return new Promise((resolve, reject) => {
                const subId = `SUB-${_randomString(5)}`;
                subClient.client.subscribe(topic, (err) => {
                    if (err) {
                        logToFile(`Error subscribing client ${subClientId} to topic ${topic}: ${err.message}`);
                        reject(err);
                    } else {
                        logToFile(`Client ${subClientId} subscribed to topic ${topic}`);
                        logClient(subClientId, `Subscribed to topic ${topic}`);
                        // Log SUB_NEW event
                        logClientEvent(subClientId, Client_Event.SUB_NEW, {
                            sub: {
                                hostID: 1,
                                hostPos: brokerPosition,
                                clientID: subClientId,
                                subID: subId,
                                channel: topic,
                                aoi: {
                                    center: { x: parseInt(subX), y: parseInt(subY) },
                                    radius: parseInt(subRadius)
                                },
                                recipients: [],
                                heartbeat: Date.now()
                            }
                        });
                        resolve();
                    }
                });
            });

        case 'publish':
            const [____, pubClientId, pubX, pubY, pubRadius, pubTopic, ...pubPayloadParts] = parts;
            const pubPayload = pubPayloadParts.join(' ');
            // Use the same topic format as subscribe
            const pubTopicObj = { x: parseInt(pubX), y: parseInt(pubY), radius: parseInt(pubRadius), channel: pubTopic };
            const pubTopicStr = `sp: <${JSON.stringify(pubTopicObj)}>`;
            logToFile(`Client ${pubClientId} publishing to topic ${pubTopicStr}: ${pubPayload}`);
            const pubClient = simulatedClients[pubClientId];
            if (!pubClient) {
                logToFile(`Error: Client ${pubClientId} not found`);
                return Promise.reject(new Error(`Client ${pubClientId} not found`));
            }
            return new Promise((resolve, reject) => {
                const pubId = `PUB-${_randomString(5)}`;
                const pubAoi = {
                    center: { x: parseInt(pubX), y: parseInt(pubY) },
                    radius: parseInt(pubRadius)
                };
                const message = `${pubId}:${pubPayload}`;
                // Track publisher info for this pubId
                pubInfoByPubId.set(pubId, {
                    clientID: pubClientId,
                    aoi: pubAoi,
                    channel: pubTopicStr,
                    payload: pubPayload
                });
                // Log PUB event first
                pubClient.client.publish(pubTopicStr, message, (err) => {
                    if (err) {
                        logToFile(`Error publishing from client ${pubClientId} to topic ${pubTopicStr}: ${err.message}`);
                        reject(err);
                    } else {
                        logToFile(`Client ${pubClientId} published to topic ${pubTopicStr}: ${pubPayload}`);
                        logClient(pubClientId, `Published to topic ${pubTopicStr}: ${pubPayload}`);
                        //insert log code
                        logClientEvent(pubClientId, Client_Event.PUB, {
                            pub: {
                                pubID: pubId,
                                aoi: pubAoi,
                                channel: pubTopicStr,
                                payload: pubPayload
                            }
                        });
                        resolve();
                    }
                });
            });

        case 'end':
            logToFile('Simulation ended, waiting for message delivery...');
            setTimeout(() => process.exit(0), 1000); // Wait 1 second before exiting
            return Promise.resolve();

        default:
            logToFile(`Unknown command: ${command}`);
            return Promise.resolve();
    }
}

// Start processing the simulation script
processScript(SCRIPT_FILE);
