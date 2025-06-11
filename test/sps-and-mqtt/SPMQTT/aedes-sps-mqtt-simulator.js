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

// Event type definitions to match ClientEventParser
const Client_Event = {
    CLIENT_JOIN: 0,
    CLIENT_LEAVE: 1,
    CLIENT_CONNECT: 2,
    CLIENT_DISCONNECT: 3,
    CLIENT_MIGRATE: 4,
    CLIENT_MOVE: 5,
    SUB_NEW: 6,
    SUB_UPDATE: 7,
    SUB_DELETE: 8,
    PUB: 9,
    RECEIVE_PUB: 10
};

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

    server.listen(port, () => {
        logToFile(`Aedes broker started on port ${port}`);
        // Log broker configuration for debugging
        logToFile(`Broker configuration: ${JSON.stringify(brokerOptions, null, 2)}`);
    });

    return { broker, server };
}


// Ensure logs directory exists
const LOGS_DIR = path.join(__dirname, '../logs');
const CENTRAL_CLIENT_LOG_PATH = path.join(LOGS_DIR, 'spmqtt_client_events.txt');
const CLIENT_MESSAGES_LOG_PATH = path.join(LOGS_DIR, 'spmqtt_client_messages.txt');
fs.mkdirSync(LOGS_DIR, { recursive: true });

const SCRIPT_FILE = '/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/simulationScript.txt';

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

function logClientEvent(clientId, eventType, data = {}) {
    const logEntry = JSON.stringify({
        time: Date.now(),
        event: eventType,
        id: clientId,
        alias: clientId,
        matcher: data.matcher || 'unknown',
        ...data
    }) + '\n';

    fs.appendFile(CENTRAL_CLIENT_LOG_PATH, logEntry, (err) => {
        if (err) {
            console.error('Error writing to central client log:', err);
        }
    });
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

// Store clients for later use
const simulatedClients = {};

// function startBroker(port = 1884) {
//     const broker = aedes();

//     broker.on('subscribe', (subscriptions, client) => {
//         subscriptions.forEach(sub => {
//             logToFile(`Client ${client ? client.id : 'unknown'} subscribed to ${sub.topic}`);
//         });
//     });

//     broker.on('publish', (packet, client) => {
//         if (!packet.topic.startsWith('$SYS')) {
//             logToFile(`${client ? client.id : 'BROKER'} published to ${packet.topic}: ${packet.payload.toString()}`);
//         }
//     });

//     const server = net.createServer(broker.handle);

//     server.listen(port, () => {
//         logToFile(`Aedes broker started on port ${port}`);
//     });

//     return { broker, server };
// }

function createClient(clientId, host, port, x, y, r) {
    const url = `mqtt://${host}:${port}`;

    // The matcher's mqttAuthenticate() does:  JSON.parse(password)
    // so we must pass a JSON string in the password field.
    const authPayload = JSON.stringify({ x, y, r });

    const options = {
        clientId,                 // same as before
        username : clientId,      // optional but handy for logs
        password : authPayload,   // <─ the important part
        clean    : true,
        reconnectPeriod : 1000,   // auto-reconnect every 1 s (optional)
        connectTimeout  : 30_000  // fail if no CONNACK in 30 s (optional)
    };

    const client = mqtt.connect(url, options);

    logClientEvent(clientId, Client_Event.CLIENT_JOIN, {
        pos: { x, y },
        radius: r,
        matcher: host
    });

    client.on('connect', () => {
        logClientEvent(clientId, Client_Event.CLIENT_CONNECT, {
            pos: { x, y },
            radius: r,
            matcher: host
        });
        simulatedClients[clientId] = { client, x, y, r };
    });

    client.on('reconnect', () => {
        logClientEvent(clientId, Client_Event.CLIENT_MIGRATE, {
            pos: { x, y },
            radius: r,
            matcher: host
        });
    });

    client.on('error', (err) => {
        logClientEvent(clientId, Client_Event.CLIENT_DISCONNECT, {
            error: err.message,
            pos: { x, y },
            radius: r,
            matcher: host
        });
    });

    client.on('close', () => {
        logClientEvent(clientId, Client_Event.CLIENT_LEAVE, {
            pos: { x, y },
            radius: r,
            matcher: host
        });
    });

    client.on('message', (topic, message) => {
        const [pubId, payload] = message.toString().split(':');
        logClientMessage(clientId, topic, message);
        logClientEvent(clientId, Client_Event.RECEIVE_PUB, {
            pub: {
                pubID: pubId,
                channel: topic,
                aoi: {
                    center: { x, y },
                    radius: r
                },
                payload: payload
            },
            matcher: host
        });
    });

    return client;
}

async function processScript(scriptPath) {
    try {
        const data = fs.readFileSync(scriptPath, 'utf-8');
        const lines = data.trim().split('\n');

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
    const parts = line.trim().split(/\s+/);
    const command = parts[0];

    switch (command) {
        case 'newMatcher':
            const label = parts[1];
            const host = parts[3];
            const pubPort = 1884;
            logToFile(`Starting broker (${label}) at ${host}:${pubPort}`);
            startBroker(pubPort);
            break;

        case 'newClient':
            const clientId = parts[1];
            const clientHost = parts[2];
            const clientPort = 1884;
            const x = parseFloat(parts[3]);
            const y = parseFloat(parts[4]);
            const r = parseFloat(parts[5]);
            logToFile(`Creating client ${clientId} connecting to ${clientHost}:${clientPort}`);
            createClient(clientId, clientHost, clientPort, x, y, r);
            break;

        case 'subscribe':
            {
                const clientId = parts[1];
                const x = parseFloat(parts[2]);
                const y = parseFloat(parts[3]);
                const r = parseFloat(parts[4]);
                const channel = parseInt(parts[5]) || 1;

                const topic = `sp: <${JSON.stringify({ x, y, radius: r, channel })}>`;

                if (simulatedClients[clientId]) {
                    const { client } = simulatedClients[clientId];
                    const subID = _generate_subID(clientId);
                    client.subscribe(topic, { qos: 1 }, (err) => {
                        if (err) {
                            logClientEvent(clientId, Client_Event.SUB_DELETE, {
                                error: err.message,
                                sub: {
                                    subID: subID,
                                    clientID: clientId,
                                    channel: topic,
                                    aoi: {
                                        center: { x, y },
                                        radius: r
                                    }
                                },
                                matcher: simulatedClients[clientId].host
                            });
                        } else {
                            logClientEvent(clientId, Client_Event.SUB_NEW, {
                                sub: {
                                    subID: subID,
                                    clientID: clientId,
                                    channel: topic,
                                    aoi: {
                                        center: { x, y },
                                        radius: r
                                    }
                                },
                                matcher: simulatedClients[clientId].host
                            });
                        }
                    });
                } else {
                    logToFile(`Client ${clientId} not found for subscribe`);
                }
            }
            break;

        case 'publish':
            {
                const clientId = parts[1];
                const x = parseFloat(parts[2]);
                const y = parseFloat(parts[3]);
                const r = parseFloat(parts[4]);
                const channel = parseInt(parts[5]) || 1;
                const message = parts.slice(6).join(' ').replace(/^"|"$/g, '');

                const topic = `sp: <${JSON.stringify({ x, y, radius: r, channel })}>`;

                if (simulatedClients[clientId]) {
                    const { client } = simulatedClients[clientId];
                    const pubID = clientId + '-' + _randomString(5);
                    const fullMessage = `${pubID}:${message}`;
                    client.publish(topic, fullMessage, { qos: 1 }, (err) => {
                        if (err) {
                            logClientEvent(clientId, Client_Event.PUB, {
                                error: err.message,
                                pub: {
                                    pubID: pubID,
                                    channel: topic,
                                    aoi: {
                                        center: { x, y },
                                        radius: r
                                    },
                                    payload: message
                                },
                                matcher: simulatedClients[clientId].host
                            });
                        } else {
                            logClientEvent(clientId, Client_Event.PUB, {
                                pub: {
                                    pubID: pubID,
                                    channel: topic,
                                    aoi: {
                                        center: { x, y },
                                        radius: r
                                    },
                                    payload: message
                                },
                                matcher: simulatedClients[clientId].host
                            });
                        }
                    });
                } else {
                    logToFile(`Client ${clientId} not found for publish`);
                }
            }
            break;

        case 'wait':
            const waitTime = parseInt(parts[1]);
            logToFile(`Waiting for ${waitTime} ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            break;

        case 'end':
            logToFile("Simulation ended.");
            process.exit(0);
            break;

        default:
            logToFile(`Unknown command at line ${lineNumber}: ${command}`);
    }
}

// Start processing the simulation script
processScript(SCRIPT_FILE);
