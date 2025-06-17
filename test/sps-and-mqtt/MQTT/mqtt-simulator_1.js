const fs = require('fs');
const path = require('path');
const aedes = require('aedes');
const net = require('net');
const mqtt = require('mqtt');
require('../../../lib/common');  // This will make Client_Event available globally

// Create logs directory structure
const LOGS_DIR = path.join(__dirname, '../logs');
const MQTT_LOGS_DIR = path.join(LOGS_DIR, 'mqtt_events');
const CLIENT_LOGS_DIR = path.join(MQTT_LOGS_DIR, 'clients');
const BROKER_LOG_PATH = path.join(MQTT_LOGS_DIR, 'broker.txt');
const EVENTS_LOG_PATH = path.join(MQTT_LOGS_DIR, 'mqtt_client_events.txt');
const CLIENT_EVENTS_LOG_PATH = path.join(MQTT_LOGS_DIR, 'mqtt_client_events_no_broker.txt');  // New file for client-only events

// Configuration flags
const ENABLE_CLIENT_LOGS = false;  // Set to true to enable individual client log files

// Ensure directories exist
fs.mkdirSync(LOGS_DIR, { recursive: true });
fs.mkdirSync(MQTT_LOGS_DIR, { recursive: true });
fs.mkdirSync(CLIENT_LOGS_DIR, { recursive: true });

// Dynamic script file path
const SCRIPT_FILE = path.join(__dirname, '..', 'simulationScript.txt');

// Store clients
const clients = {};
let brokerPort = 1883;  // Default port, will be updated when broker starts

// Helper to generate unique IDs
function generateId(prefix) {
    return prefix + '-' + Math.random().toString(36).substr(2, 5);
}

// Store pub-ids for each publish (clientId+topic+payload -> pubId)
const pubIdMap = new Map();
// Store sub-ids for each subscription (clientId+topic -> subId)
const subIdMap = new Map();

// VAST-style logger
function logVastEvent(eventObj) {
    const line = JSON.stringify(eventObj) + '\n';
    fs.appendFileSync(EVENTS_LOG_PATH, line);
}

// VAST-style logger for client events only
function logClientEvent(eventObj) {
    const line = JSON.stringify(eventObj) + '\n';
    fs.appendFileSync(CLIENT_EVENTS_LOG_PATH, line);
}

function logBroker(message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    console.log(`[BROKER] ${line.trim()}`);
    fs.appendFile(BROKER_LOG_PATH, line, (err) => {
        if (err) console.error('Error writing to broker log:', err);
    });
    fs.appendFile(EVENTS_LOG_PATH, line, (err) => {
        if (err) console.error('Error writing to events log:', err);
    });
}

function logClient(clientId, message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    console.log(`[CLIENT ${clientId}] ${line.trim()}`);
    
    // Only write to individual client log files if enabled
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

function startBroker(port = 1883) {
    const broker = aedes();
    const BROKER_POS = { x: 500, y: 500 };  // Fixed broker position

    broker.on('subscribe', (subscriptions, client) => {
        if (client) {
            subscriptions.forEach(sub => {
                const subKey = client.id + ':' + sub.topic;
                let subId = subIdMap.get(subKey);
                if (!subId) {
                    subId = `${client.id}-${generateId('')}`;  // Format: C1-8nhMU
                    subIdMap.set(subKey, subId);
                }
                // Log SUB_NEW event to client events only
                logClientEvent({
                    time: Date.now(),
                    event: Client_Event.SUB_NEW,
                    id: client.id,
                    alias: "unnamed_client",
                    matcher: 1,
                    sub: {
                        hostID: 1,
                        hostPos: BROKER_POS,
                        clientID: client.id,
                        subID: subId,
                        channel: sub.topic,
                        aoi: { center: BROKER_POS, radius: 100 },  // Default radius
                        recipients: [],
                        heartbeat: Date.now()
                    }
                });
            });
        }
    });

    // Add unsubscribe handler
    broker.on('unsubscribe', (subscriptions, client) => {
        if (client) {
            subscriptions.forEach(topic => {
                const subKey = client.id + ':' + topic;
                const subId = subIdMap.get(subKey);
                if (subId) {
                    // Log SUB_DELETE event to client events only
                    logClientEvent({
                        time: Date.now(),
                        event: Client_Event.SUB_DELETE,
                        id: client.id,
                        alias: "unnamed_client",
                        matcher: 1,
                        subID: subId
                    });
                    // Remove the subscription from the map
                    subIdMap.delete(subKey);
                }
            });
        }
    });

    broker.on('publish', (packet, client) => {
        if (!packet.topic.startsWith('$SYS') && client) {
            // Try to extract pub-id from payload
            let payloadStr = packet.payload.toString();
            let pubIdMatch = payloadStr.match(/\[pub-id: ([^\]]+)\]$/);
            let pubId = pubIdMatch ? pubIdMatch[1] : `${client.id}-${Object.keys(pubIdMap).length + 1}`;
            
            // Log PUB event to client events only
            logClientEvent({
                time: Date.now(),
                event: Client_Event.PUB,
                id: client.id,
                alias: "unnamed_client",
                matcher: 1,
                pub: {
                    pubID: pubId,
                    aoi: { center: BROKER_POS, radius: 10 },  // Default radius
                    channel: packet.topic,
                    payload: payloadStr
                }
            });
        }
    });

    const server = net.createServer(broker.handle);
    
    // Try to start the server with error handling
    const startServer = (port) => {
        return new Promise((resolve, reject) => {
            server.once('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    logBroker(`Port ${port} is in use, trying port ${port + 1}`);
                    server.close();
                    resolve(startServer(port + 1));
                } else {
                    reject(err);
                }
            });

    server.listen(port, () => {
                logBroker(`Broker started on port ${port}`);
                resolve(port);
            });
        });
    };

    return startServer(port).then(actualPort => {
        return { broker, server, port: actualPort };
    });
}

function createClient(clientId, host, port, x, y, r) {
    return new Promise((resolve, reject) => {
        const url = `mqtt://${host}:${port}`;
        const client = mqtt.connect(url, { clientId });
        const clientPos = { x, y };

        // Log CLIENT_JOIN event
        logClientEvent({
            time: Date.now(),
            event: Client_Event.CLIENT_JOIN,
            id: clientId,
            alias: "unnamed_client",
            pos: clientPos,
            matcher: 0
        });

        client.on('connect', () => {
            // Log CLIENT_CONNECT event
            logClientEvent({
                time: Date.now(),
                event: Client_Event.CLIENT_CONNECT,
                id: clientId,
                alias: "unnamed_client",
                pos: clientPos,
                matcher: 0
            });
            // Log CLIENT_MIGRATE event
            logClientEvent({
                time: Date.now(),
                event: Client_Event.CLIENT_MIGRATE,
                id: clientId,
                alias: "unnamed_client",
                pos: clientPos,
                matcher: 1
            });
            clients[clientId] = client;
            resolve(client);
        });

        client.on('error', (err) => {
            // Log CLIENT_DISCONNECT event
            logClientEvent({
                time: Date.now(),
                event: Client_Event.CLIENT_DISCONNECT,
                id: clientId,
                alias: "unnamed_client",
                pos: clientPos,
                matcher: 1,
                error: err.message
            });
            reject(err);
        });

        client.on('close', () => {
            // Log CLIENT_LEAVE event
            logClientEvent({
                time: Date.now(),
                event: Client_Event.CLIENT_LEAVE,
                id: clientId,
                alias: "unnamed_client",
                pos: clientPos,
                matcher: 1
            });
        });

        client.on('message', (topic, message) => {
            let msgStr = message.toString();
            let pubIdMatch = msgStr.match(/\[pub-id: ([^\]]+)\]$/);
            let pubId = pubIdMatch ? pubIdMatch[1] : `${clientId}-${Object.keys(pubIdMap).length + 1}`;
            
            // Log RECEIVE_PUB event
            logClientEvent({
                time: Date.now(),
                event: Client_Event.RECEIVE_PUB,
                id: clientId,
                alias: "unnamed_client",
                matcher: 1,
                pub: {
                    matcherID: 1,
                    clientID: clientId,
                    pubID: pubId,
                    aoi: { center: clientPos, radius: r },
                    payload: msgStr,
                    channel: topic,
                    recipients: [1],
                    chain: [1]
                }
            });
        });
    });
}

async function processScript(scriptPath) {
    try {
        const data = fs.readFileSync(scriptPath, 'utf-8');
        const lines = data.trim().split('\n');

        for (let index = 0; index < lines.length; index++) {
            const line = lines[index].trim();
            if (line === '' || line.startsWith('//')) continue;
            await processLine(line, index + 1);
        }
    } catch (err) {
        console.error(`Error reading script: ${err.message}`);
    }
}

async function processLine(line, lineNumber) {
    const parts = line.trim().split(/\s+/);
    const command = parts[0];

    switch (command) {
        case 'newMatcher':
            const host = parts[3];
            const port = 1883;
            logBroker(`Starting at ${host}:${port}`);
            const { port: actualPort } = await startBroker(port);
            brokerPort = actualPort;  // Update the broker port
            break;

        case 'newClient':
            const clientId = parts[1];
            const clientHost = parts[2];
            const x = parseFloat(parts[4]);
            const y = parseFloat(parts[5]);
            const r = parseFloat(parts[6]);
            logClient(clientId, `Creating connection to ${clientHost}:${brokerPort}`);
            try {
                await createClient(clientId, clientHost, brokerPort, x, y, r);
            } catch (err) {
                logClient(clientId, `Failed to create: ${err.message}`);
                throw err;
            }
            break;

        case 'wait':
            const waitTime = parseInt(parts[1]);
            logBroker(`Waiting for ${waitTime} ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            break;

        case 'subscribe':
            const subClientId = parts[1];
            const topic = parts.slice(5).join(' ');
            if (clients[subClientId]) {
                // Generate sub-id for this client/topic
                const subKey = subClientId + ':' + topic;
                let subId = subIdMap.get(subKey);
                if (!subId) {
                    subId = generateId('SUB');
                    subIdMap.set(subKey, subId);
                }
                clients[subClientId].subscribe(topic, (err) => {
                    if (err) {
                        logClient(subClientId, `Failed to subscribe to ${topic}: ${err.message}`);
                    } else {
                        logClient(subClientId, `Subscribing to ${topic} [sub-id: ${subId}]`);
                    }
                });
            } else {
                logBroker(`Client ${subClientId} not found for subscribe`);
            }
            break;

        case 'unsubscribe':
            const unsubClientId = parts[1];
            const unsubTopic = parts.slice(5).join(' ');
            if (clients[unsubClientId]) {
                const subKey = unsubClientId + ':' + unsubTopic;
                const subId = subIdMap.get(subKey);
                if (subId) {
                    clients[unsubClientId].unsubscribe(unsubTopic, (err) => {
                        if (err) {
                            logClient(unsubClientId, `Failed to unsubscribe from ${unsubTopic}: ${err.message}`);
                        } else {
                            logClient(unsubClientId, `Unsubscribing from ${unsubTopic} [sub-id: ${subId}]`);
                        }
                    });
                } else {
                    logClient(unsubClientId, `No subscription found for topic ${unsubTopic}`);
                }
            } else {
                logBroker(`Client ${unsubClientId} not found for unsubscribe`);
            }
            break;

        case 'publish':
            const pubClientId = parts[1];
            const pubTopic = parts[5];
            const message = parts.slice(6).join(' ').replace(/^"|"$/g, '');
            if (clients[pubClientId]) {
                // Generate pub-id for this publish
                const pubKey = pubClientId + ':' + pubTopic + ':' + message;
                let pubId = pubIdMap.get(pubKey);
                if (!pubId) {
                    pubId = generateId('PUB');
                    pubIdMap.set(pubKey, pubId);
                }
                const payloadWithId = `${message} [pub-id: ${pubId}]`;
                clients[pubClientId].publish(pubTopic, payloadWithId, { qos: 0 }, (err) => {
                    if (err) {
                        logClient(pubClientId, `Failed to publish to ${pubTopic}: ${err.message}`);
                    } else {
                        logClient(pubClientId, `Publishing to ${pubTopic}: ${message} [pub-id: ${pubId}]`);
                    }
                });
            } else {
                logBroker(`Client ${pubClientId} not found for publish`);
            }
            break;

        case 'end':
            logBroker("Simulation ended.");
            process.exit(0);
            break;

        default:
            logBroker(`Unknown command at line ${lineNumber}: ${command}`);
    }
}

async function cleanup() {
    logBroker("Starting cleanup...");
    
    // Disconnect all clients
    for (const [clientId, client] of Object.entries(clients)) {
        try {
            await new Promise((resolve) => {
                client.end(true, () => {
                    logClient(clientId, 'Disconnected');
                    resolve();
                });
            });
        } catch (err) {
            logBroker(`Error disconnecting client ${clientId}: ${err.message}`);
        }
    }
    
    logBroker("Cleanup completed");
}

// Start processing the simulation script
processScript(SCRIPT_FILE);