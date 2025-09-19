const fs = require('fs');
const path = require('path');
const aedes = require('aedes');
const net = require('net');
const mqtt = require('mqtt');
require('../../../lib/common');

// Create logs directory structure
const LOGS_DIR = path.join(__dirname, '../logs');
const MQTT_LOGS_DIR = path.join(LOGS_DIR, 'mqtt_events');
const CLIENT_LOGS_DIR = path.join(MQTT_LOGS_DIR, 'clients');
const BROKER_LOG_PATH = path.join(MQTT_LOGS_DIR, 'broker.txt');
const EVENTS_LOG_PATH = path.join(MQTT_LOGS_DIR, 'mqtt_client_events.txt');
const CLIENT_EVENTS_LOG_PATH = path.join(MQTT_LOGS_DIR, 'mqtt_client_events_no_broker.txt');

// Configuration flags
const ENABLE_CLIENT_LOGS = false;

fs.mkdirSync(LOGS_DIR, { recursive: true });
fs.mkdirSync(MQTT_LOGS_DIR, { recursive: true });
fs.mkdirSync(CLIENT_LOGS_DIR, { recursive: true });

// Create write streams for the log files
const logStreams = {
    events: fs.createWriteStream(EVENTS_LOG_PATH, { flags: 'a' }),
    clientEvents: fs.createWriteStream(CLIENT_EVENTS_LOG_PATH, { flags: 'a' }),
    broker: fs.createWriteStream(BROKER_LOG_PATH, { flags: 'a' })
};

// Store client log streams if enabled
const clientLogStreams = {};

const SCRIPT_FILE = '/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/simScripts/simulationScript.txt';

const clients = {};
let brokerPort = 1883;

function generateId(prefix) {
    return prefix + '-' + Math.random().toString(36).substring(2, 7);
}

// Store pub-ids for each publish (clientId+topic+payload -> pubId)
const pubIdMap = new Map();
const pubInfoByPubId = new Map();
const subIdMap = new Map();
const pingTimestamps = new Map();

// Updated logging functions to use write streams
function logVastEvent(eventObj) {
    const line = JSON.stringify(eventObj) + '\n';
    logStreams.events.write(line, (err) => {
        if (err) console.error('Error writing to events log:', err);
    });
}

function logClientEvent(eventObj) {
    const line = JSON.stringify(eventObj) + '\n';
    logStreams.clientEvents.write(line, (err) => {
        if (err) console.error('Error writing to client events log:', err);
    });
}

function logBroker(message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    console.log(`[BROKER] ${line.trim()}`);
    
    logStreams.broker.write(line, (err) => {
        if (err) console.error('Error writing to broker log:', err);
    });
    
    logStreams.events.write(line, (err) => {
        if (err) console.error('Error writing to events log:', err);
    });
}

function logClient(clientId, message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    console.log(`[CLIENT ${clientId}] ${line.trim()}`);
    
    if (ENABLE_CLIENT_LOGS) {
        // Create client log stream if it doesn't exist
        if (!clientLogStreams[clientId]) {
            const clientLogPath = path.join(CLIENT_LOGS_DIR, `client_${clientId}.txt`);
            clientLogStreams[clientId] = fs.createWriteStream(clientLogPath, { flags: 'a' });
        }
        
        clientLogStreams[clientId].write(line, (err) => {
            if (err) console.error(`Error writing to client ${clientId} log:`, err);
        });
    }
    
    logStreams.events.write(line, (err) => {
        if (err) console.error('Error writing to events log:', err);
    });
}

// Clean up function to close all streams
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
    
    // Close all log streams
    logBroker("Closing log streams...");
    
    // Close main log streams
    Object.entries(logStreams).forEach(([name, stream]) => {
        stream.end((err) => {
            if (err) console.error(`Error closing ${name} stream:`, err);
        });
    });
    
    // Close client log streams if enabled
    if (ENABLE_CLIENT_LOGS) {
        Object.entries(clientLogStreams).forEach(([clientId, stream]) => {
            stream.end((err) => {
                if (err) console.error(`Error closing client ${clientId} stream:`, err);
            });
        });
    }
    
    logBroker("Cleanup completed");
}

// Make sure to clean up on exit
process.on('exit', cleanup);
process.on('SIGINT', async () => {
    await cleanup();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    await cleanup();
    process.exit(0);
});
process.on('unhandledRejection', async (reason, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', reason);
    await cleanup();
    process.exit(1);
});

// Keep the rest of your code as is (startBroker, createClient, processScript, etc.)
// Just make sure the 'end' command in processLine calls cleanup:

function startBroker(port = 1883) {
    const broker = aedes();
    const BROKER_POS = { x: 500, y: 500 };

    broker.on('subscribe', (subscriptions, client) => {
        if (client) {
            subscriptions.forEach(sub => {
                const subKey = client.id + ':' + sub.topic;
                let subId = subIdMap.get(subKey);
                if (!subId) {
                    subId = generateId('SUB');
                    subIdMap.set(subKey, subId);
                }
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
                        aoi: { center: BROKER_POS, radius: 100 },
                        recipients: [],
                        heartbeat: Date.now()
                    }
                });
            });
        }
    });

    broker.on('unsubscribe', (subscriptions, client) => {
        if (client) {
            subscriptions.forEach(topic => {
                const subKey = client.id + ':' + topic;
                const subId = subIdMap.get(subKey);
                if (subId) {
                    logClientEvent({
                        time: Date.now(),
                        event: Client_Event.SUB_DELETE,
                        id: client.id,
                        alias: "unnamed_client",
                        matcher: 1,
                        subID: subId
                    });
                    subIdMap.delete(subKey);
                }
            });
        }
    });


    const server = net.createServer(broker.handle);

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

        logClientEvent({
            time: Date.now(),
            event: Client_Event.CLIENT_JOIN,
            id: clientId,
            alias: "unnamed_client",
            pos: clientPos,
            matcher: 0
        });

        client.on('connect', () => {
            logClientEvent({
                time: Date.now(),
                event: Client_Event.CLIENT_CONNECT,
                id: clientId,
                alias: "unnamed_client",
                pos: clientPos,
                matcher: 0
            });
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
            logClientEvent({
                time: Date.now(),
                event: Client_Event.CLIENT_LEAVE,
                id: clientId,
                alias: "unnamed_client",
                pos: clientPos,
                matcher: 1
            });
        });

        // Updated message handler with JSON parsing and ping-pong functionality
        client.on('message', (topic, message) => {
            let pubId = null;
            let cleanMsg = '';
            
            try {
                // Try JSON parsing first
                const obj = JSON.parse(message.toString());
                pubId = obj.pubId;
                cleanMsg = obj.message;
                
            } catch (parseError) {
                // Fallback to regex for backwards compatibility
                let msgStr = message.toString();
                const pubIdPattern = / $$pub-id: ([^$$]+)\]$/;
                const match = msgStr.match(pubIdPattern);
                if (match) {
                    pubId = match[1];
                    cleanMsg = msgStr.replace(pubIdPattern, '');
                } else {
                    // If no pubId found, use the raw message
                    cleanMsg = msgStr;
                }
            }
            
            // Calculate RTT
            const pongTimestamp = Date.now();
            const pingTimestamp = pingTimestamps.get(pubId);
            const rtt = pingTimestamp ? pongTimestamp - pingTimestamp : null;
            
            // Look up publisher info
            let pubInfo = pubId ? pubInfoByPubId.get(pubId) : null;
            if (!pubInfo) {
                // If not found, fallback to receiver's info
                pubInfo = {
                    clientID: clientId,
                    pubID: pubId,
                    aoi: { center: clientPos, radius: r },
                    message: cleanMsg,
                    topic: topic
                };
            }
            
            logClientEvent({
                time: pongTimestamp,
                event: Client_Event.RECEIVE_PUB, // always 10 for receive events
                id: clientId,
                alias: "unnamed_client",
                matcher: 1,
                pub: {
                    matcherID: 1,
                    clientID: pubInfo.clientID, // publisher's clientID
                    pubID: pubId, // publisher's pubID
                    aoi: pubInfo.aoi, // publisher's AOI
                    payload: pubInfo.message, // clean message
                    channel: pubInfo.topic, // publisher's topic
                    recipients: [1],
                    chain: [1]
                },
                pingpong: {
                    ping: {
                        timestamp: pingTimestamp,
                        pubid: pubId
                    },
                    pong: {
                        timestamp: pongTimestamp,
                        pubid: pubId,
                        rtt: rtt
                    }
                }
            });
            
            // Clean up ping timestamp after calculating RTT
            if (pubId && pingTimestamps.has(pubId)) {
                setTimeout(() => {
                    pingTimestamps.delete(pubId);
                }, 100); // Small delay to allow all subscribers
            }
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
        case 'newMatcher': {
            const host = parts[3];
            const port = 1883;
            logBroker(`Starting at ${host}:${port}`);
            const { port: actualPort } = await startBroker(port);
            brokerPort = actualPort;
            break;
        }

        case 'newClient': {
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
        }

        case 'wait': {
            const waitTime = parseInt(parts[1]);
            logBroker(`Waiting for ${waitTime} ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            break;
        }

        case 'subscribe': {
            const subClientId = parts[1];
            const topic = parts.slice(5).join(' ');
            if (clients[subClientId]) {
                const subKey = subClientId + ':' + topic;
                let subId = subIdMap.get(subKey);
                if (!subId) {
                    subId = generateId('SUB');
                    subIdMap.set(subKey, subId);
                }
                clients[subClientId].subscribe(topic, (err, granted) => {
                    if (err) {
                        logClient(subClientId, `Failed to subscribe to ${topic}: ${err.message}`);
                    } else {
                        logClient(subClientId, `Subscribing to ${topic} [sub-id: ${subId}]`);
                        if (granted && granted.length > 0) {
                            logClient(subClientId, `Subscription to '${topic}' granted with QoS ${granted[0].qos}`);
                        }
                    }
                });
            } else {
                logBroker(`Client ${subClientId} not found for subscribe`);
            }
            break;
        }

        case 'unsubscribe': {
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
        }

        case 'publish': {
            const pubClientId = parts[1];
            const pubAoiX = parseFloat(parts[2]);
            const pubAoiY = parseFloat(parts[3]);
            const pubAoiR = parseFloat(parts[4]);
            const pubTopic = parts[5];
            const message = parts.slice(6).join(' ').replace(/^"|"$/g, '');
            const pubAoi = { center: { x: pubAoiX, y: pubAoiY }, radius: pubAoiR };

            if (clients[pubClientId]) {
                // Generate a single pubID and always use it for PUB event and payload
                const pubKey = pubClientId + ':' + pubTopic + ':' + message;
                let pubId = pubIdMap.get(pubKey);
                if (!pubId) {
                    pubId = generateId('PUB');
                    pubIdMap.set(pubKey, pubId);
                }
                
                // Store ping timestamp for RTT calculation
                const pingTimestamp = Date.now();
                pingTimestamps.set(pubId, pingTimestamp);
                
                // Store reverse mapping for receive log
                pubInfoByPubId.set(pubId, {
                    clientID: pubClientId,
                    topic: pubTopic,
                    message,
                    aoi: pubAoi
                });
                
                // Create JSON payload instead of string concatenation
                const payloadObj = {
                    message: message,
                    pubId: pubId
                };
                const payloadWithId = JSON.stringify(payloadObj);
                
                clients[pubClientId].publish(pubTopic, payloadWithId, { qos: 0 }, (err) => {
                    if (err) {
                        logClient(pubClientId, `Failed to publish to ${pubTopic}: ${err.message}`);
                    } else {
                        logClient(pubClientId, `Published to ${pubTopic}: ${message} [pub-id: ${pubId}]`);
                        // PUB event with PING (log here so it always matches pubID)
                        logClientEvent({
                            time: Date.now(),
                            event: Client_Event.PUB,
                            id: pubClientId,
                            alias: "unnamed_client",
                            matcher: 1,
                            pub: {
                                pubID: pubId,
                                aoi: pubAoi,
                                channel: pubTopic,
                                payload: message
                            },
                            pingpong: {
                                ping: {
                                    timestamp: pingTimestamp,
                                    pubid: pubId
                                }
                            }
                        });
                    }
                });
            } else {
                logBroker(`Client ${pubClientId} not found for publish`);
            }
            break;
        }

        case 'end':
            logBroker("Simulation ended.");
            await cleanup();
            process.exit(0);
            break;

        default:
            logBroker(`Unknown command at line ${lineNumber}: ${command}`);
    }
}

async function cleanup() {
    logBroker("Starting cleanup...");
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

process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', reason);
});

processScript(SCRIPT_FILE);