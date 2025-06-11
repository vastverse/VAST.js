const fs = require('fs');
const path = require('path');
const aedes = require('aedes');
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

// Ensure logs directory exists
const LOGS_DIR = path.join(__dirname, '../logs');
const CENTRAL_CLIENT_LOG_PATH = path.join(LOGS_DIR, 'mqtt_client_events.txt');
const CLIENT_MESSAGES_LOG_PATH = path.join(LOGS_DIR, 'mqtt_client_messages.txt');
fs.mkdirSync(LOGS_DIR, { recursive: true });

const SCRIPT_FILE = '/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/simulationScript.txt';

// Function to get client-specific log path
function getClientLogPath(clientId) {
    return path.join(LOGS_DIR, `client_${clientId}.log`);
}

// Add matcher ID tracking
const matcherIDs = new Map(); // Map of host -> numeric ID
let nextMatcherID = 0;

function getMatcherID(host) {
    if (!matcherIDs.has(host)) {
        matcherIDs.set(host, nextMatcherID++);
    }
    return matcherIDs.get(host);
}

// Function to log client-specific events
function logClientSpecificEvent(clientId, eventType, data = {}) {
    const matcherID = getMatcherID(data.matcher || 'localhost');
    const logEntry = JSON.stringify({
        time: Date.now(),
        event: eventType,
        id: clientId,
        alias: "unnamed_client",
        matcher: matcherID,
        pos: data.pos || { x: simulatedClients[clientId]?.x || 0, y: simulatedClients[clientId]?.y || 0 },
        ...data
    }) + '\n';

    const clientLogPath = getClientLogPath(clientId);
    fs.appendFile(clientLogPath, logEntry, (err) => {
        if (err) {
            console.error(`Error writing to client ${clientId} log:`, err);
        }
    });
}

// Centralized logging functions
function logToFile(message) {
    const timestamp = Date.now();
    const line = `[${timestamp}] ${message}\n`;
    console.log(line.trim());
    
    const logPath = path.join(LOGS_DIR, 'mqtt_broker.txt');
    fs.appendFile(logPath, line, (err) => {
        if (err) console.error('Error writing to broker log:', err);
    });
}

function logClientEvent(clientId, eventType, data = {}) {
    const matcherID = getMatcherID(data.matcher || 'localhost');
    const logEntry = JSON.stringify({
        time: Date.now(),
        event: eventType,
        id: clientId,
        alias: "unnamed_client",
        matcher: matcherID,
        pos: data.pos || { x: simulatedClients[clientId]?.x || 0, y: simulatedClients[clientId]?.y || 0 },
        ...data
    }) + '\n';

    // Write to central log
    fs.appendFile(CENTRAL_CLIENT_LOG_PATH, logEntry, (err) => {
        if (err) {
            console.error('Error writing to central client log:', err);
        }
    });

    // Write to client-specific log
    logClientSpecificEvent(clientId, eventType, data);
}

function logClientMessage(clientId, topic, message) {
    const timestamp = Date.now();
    const logEntry = JSON.stringify({
        time: timestamp,
        clientId,
        topic,
        message: message.toString()
    }) + '\n';

    // Write to central messages log
    fs.appendFile(CLIENT_MESSAGES_LOG_PATH, logEntry, (err) => {
        if (err) {
            console.error('Error writing to client messages log:', err);
        }
    });

    // Write to client-specific log
    const clientLogPath = getClientLogPath(clientId);
    fs.appendFile(clientLogPath, logEntry, (err) => {
        if (err) {
            console.error(`Error writing to client ${clientId} log:`, err);
        }
    });
}

// Store clients for later use
const simulatedClients = {};

// Track received messages to prevent duplicates
const receivedMessages = new Map(); // Map of clientId -> Set of received pubIDs

// Track client connection states
const clientConnectionStates = new Map();

// Add subscription tracking
const subscriptions = new Map(); // Map of clientId -> Set of {topic, aoi, heartbeat}

// Add heartbeat interval
const HEARTBEAT_INTERVAL = 5000; // 5 seconds
let heartbeatTimer = null;

// Function to start heartbeat
function startHeartbeat() {
    if (heartbeatTimer) return;
    
    heartbeatTimer = setInterval(() => {
        const now = Date.now();
        for (const [clientId, subs] of subscriptions.entries()) {
            for (const sub of subs) {
                // Update heartbeat
                sub.heartbeat = now;
                
                // Log heartbeat update
                logClientEvent(clientId, Client_Event.SUB_UPDATE, {
                    sub: {
                        subID: sub.subID,
                        clientID: clientId,
                        channel: sub.topic,
                        aoi: sub.aoi,
                        heartbeat: now
                    },
                    matcher: simulatedClients[clientId].host
                });
            }
        }
    }, HEARTBEAT_INTERVAL);
}

// Function to stop heartbeat
function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}

function startBroker(port = 1883) {
    const broker = aedes();

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
    });

    return { broker, server };
}

function createClient(clientId, host, port, x, y, r) {
    return new Promise((resolve, reject) => {
        const url = `mqtt://${host}:${port}`;
        const options = { 
            clientId,
            qos: 1  // Set default QoS level for this client
        };
        const client = mqtt.connect(url, options);

        // Initialize connection state as false
        clientConnectionStates.set(clientId, false);
        
        // Initialize subscriptions for this client
        subscriptions.set(clientId, new Set());

        logClientEvent(clientId, Client_Event.CLIENT_JOIN, {
            pos: { x, y },
            radius: r,
            matcher: host
        });

        // Set a connection timeout
        const connectionTimeout = setTimeout(() => {
            reject(new Error(`Connection timeout for client ${clientId}`));
        }, 10000); // 10 second timeout

        client.on('connect', () => {
            clearTimeout(connectionTimeout);
            clientConnectionStates.set(clientId, true);
            
            // Log JOIN event
            logClientEvent(clientId, Client_Event.CLIENT_JOIN, {
                pos: { x, y },
                matcher: host
            });
            
            // Log CONNECT event
            logClientEvent(clientId, Client_Event.CLIENT_CONNECT, {
                pos: { x, y },
                matcher: host
            });
            
            // Log MIGRATE event
            logClientEvent(clientId, Client_Event.CLIENT_MIGRATE, {
                pos: { x, y },
                matcher: host
            });
            
            simulatedClients[clientId] = { client, x, y, r, host };
            logToFile(`Client ${clientId} successfully connected to broker`);
            resolve(client);
        });

        client.on('error', (err) => {
            clearTimeout(connectionTimeout);
            // Set connection state to false on error
            clientConnectionStates.set(clientId, false);
            logClientEvent(clientId, Client_Event.CLIENT_DISCONNECT, {
                error: err.message,
                pos: { x, y },
                radius: r,
                matcher: host
            });
            reject(err);
        });

        client.on('close', () => {
            // Set connection state to false on close
            clientConnectionStates.set(clientId, false);
            logClientEvent(clientId, Client_Event.CLIENT_LEAVE, {
                pos: { x, y },
                radius: r,
                matcher: host
            });
            // Clear subscriptions on close
            subscriptions.delete(clientId);
        });

        client.on('message', (topic, message) => {
            try {
                const messageStr = message.toString();
                console.log(`Client ${clientId} received message on topic ${topic}: ${messageStr}`);
                
                let pubId, payload;
                if (messageStr.includes(':')) {
                    [pubId, payload] = messageStr.split(':');
                } else {
                    pubId = 'unknown';
                    payload = messageStr;
                }

                logClientMessage(clientId, topic, message);
                
                logClientEvent(clientId, Client_Event.RECEIVE_PUB, {
                    pub: {
                        matcherID: getMatcherID(simulatedClients[clientId].host),
                        clientID: clientId,
                        pubID: pubId,
                        channel: topic,
                        aoi: {
                            center: { x: simulatedClients[clientId].x, y: simulatedClients[clientId].y },
                            radius: 10  // Match VAST system's radius
                        },
                        payload: payload,
                        recipients: [getMatcherID(simulatedClients[clientId].host)],
                        chain: [getMatcherID(simulatedClients[clientId].host)]
                    },
                    matcher: simulatedClients[clientId].host
                });
            } catch (err) {
                console.error(`Error handling message for client ${clientId}:`, err);
                logToFile(`Error handling message for client ${clientId}: ${err.message}`);
            }
        });
    });
}

// Helper function to check if client is connected
function isClientConnected(clientId) {
    return clientConnectionStates.get(clientId) === true;
}

// Helper function to wait for client connection
async function waitForClientConnection(clientId, timeout = 30000) {
    const startTime = Date.now();
    while (!isClientConnected(clientId)) {
        if (Date.now() - startTime > timeout) {
            throw new Error(`Timeout waiting for client ${clientId} to connect`);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
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
            const pubPort = 1883;
            logToFile(`Starting broker (${label}) at ${host}:${pubPort}`);
            startBroker(pubPort);
            break;

        case 'newClient':
            const clientId = parts[1];
            const clientHost = parts[2];
            const clientPort = 1883;
            const x = parseFloat(parts[4]);
            const y = parseFloat(parts[5]);
            const r = parseFloat(parts[6]);
            logToFile(`Creating client ${clientId} connecting to ${clientHost}:${clientPort}`);
            try {
                await createClient(clientId, clientHost, clientPort, x, y, r);
                logToFile(`Client ${clientId} connection completed successfully`);
            } catch (err) {
                logToFile(`Failed to create client ${clientId}: ${err.message}`);
                throw err; // Re-throw to stop script execution on client creation failure
            }
            break;

        case 'wait':
            const waitTime = parseInt(parts[1]);
            logToFile(`Waiting for ${waitTime} ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            break;

        case 'subscribe':
            {
                const clientId = parts[1];
                const topic = parts.slice(5).join(' ');
                if (simulatedClients[clientId]) {
                    try {
                        await waitForClientConnection(clientId);
                        
                        const { client, x, y, r, host } = simulatedClients[clientId];
                        await new Promise((resolve, reject) => {
                            client.subscribe(topic, (err) => {
                                if (err) {
                                    console.error(`Failed to subscribe to ${topic}: ${err.message}`);
                                    logToFile(`Client ${clientId} failed to subscribe to ${topic}: ${err.message}`);
                                    reject(err);
                                } else {
                                    const subID = _generate_subID(clientId);
                                    const aoi = {
                                        center: { x, y },
                                        radius: r
                                    };
                                    
                                    // Add subscription to tracking
                                    const clientSubs = subscriptions.get(clientId);
                                    clientSubs.add({
                                        subID,
                                        topic,
                                        aoi,
                                        heartbeat: Date.now()
                                    });
                                    
                                    logClientEvent(clientId, Client_Event.SUB_NEW, {
                                        sub: {
                                            hostID: getMatcherID(host),
                                            hostPos: { x: 500, y: 500 }, // Default host position
                                            clientID: clientId,
                                            subID: subID,
                                            channel: topic,
                                            aoi: aoi,
                                            recipients: [],
                                            heartbeat: Date.now()
                                        },
                                        matcher: host
                                    });
                                    logToFile(`Client ${clientId} successfully subscribed to ${topic}`);
                                    resolve();
                                }
                            });
                        });
                    } catch (error) {
                        logToFile(`Error waiting for client ${clientId} connection: ${error.message}`);
                    }
                } else {
                    logToFile(`Client ${clientId} not found for subscribe`);
                }
            }
            break;

        case 'publish':
            {
                const clientId = parts[1];
                const topic = parts[5];
                const message = parts.slice(6).join(' ').replace(/^"|"$/g, '');
                if (simulatedClients[clientId]) {
                    try {
                        await waitForClientConnection(clientId);
                        
                        const { client, x, y, r, host } = simulatedClients[clientId];
                        const pubID = clientId + '-' + _randomString(5);
                        const fullMessage = `${pubID}:${message}`;
                        client.publish(topic, fullMessage, { qos: 1 }, (err) => {
                            if (err) {
                                console.error(`Failed to publish to ${topic}: ${err.message}`);
                                logToFile(`Failed to publish to ${topic}: ${err.message}`);
                            } else {
                                console.log(`Client ${clientId} published to ${topic}: ${fullMessage}`);
                                logClientEvent(clientId, Client_Event.PUB, {
                                    pub: {
                                        pubID: pubID,
                                        channel: topic,
                                        aoi: {
                                            center: { x, y },
                                            radius: 10  // Match VAST system's radius
                                        },
                                        payload: message
                                    },
                                    matcher: host
                                });
                            }
                        });
                    } catch (error) {
                        logToFile(`Error waiting for client ${clientId} connection: ${error.message}`);
                    }
                } else {
                    logToFile(`Client ${clientId} not found for publish`);
                }
            }
            break;

        case 'end':
            logToFile("Simulation ended.");
            await cleanup();
            process.exit(0);
            break;

        default:
            logToFile(`Unknown command at line ${lineNumber}: ${command}`);
    }
}

// Add cleanup function
async function cleanup() {
    logToFile("Starting cleanup...");
    
    // Stop heartbeat
    stopHeartbeat();
    
    // Log subscription deletions
    for (const [clientId, clientData] of Object.entries(simulatedClients)) {
        const clientSubs = subscriptions.get(clientId);
        if (clientSubs) {
            for (const sub of clientSubs) {
                logClientEvent(clientId, Client_Event.SUB_DELETE, {
                    subID: sub.subID,
                    matcher: clientData.host
                });
            }
        }
    }
    
    // Disconnect all clients
    for (const [clientId, clientData] of Object.entries(simulatedClients)) {
        if (clientData.client) {
            try {
                await new Promise((resolve) => {
                    clientData.client.end(true, () => {
                        logToFile(`Client ${clientId} disconnected`);
                        resolve();
                    });
                });
            } catch (err) {
                logToFile(`Error disconnecting client ${clientId}: ${err.message}`);
            }
        }
    }
    
    // Clear all data structures
    Object.keys(simulatedClients).forEach(key => delete simulatedClients[key]);
    receivedMessages.clear();
    clientConnectionStates.clear();
    subscriptions.clear();
    
    logToFile("Cleanup completed");
}

// Start heartbeat when the script starts
startHeartbeat();

// Start processing the simulation script
processScript(SCRIPT_FILE);