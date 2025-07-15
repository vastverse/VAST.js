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
const CLIENT_EVENTS_LOG_PATH = path.join(MQTT_LOGS_DIR, 'mqtt_client_events_no_broker.txt');

// Configuration flags
const ENABLE_CLIENT_LOGS = false;

fs.mkdirSync(LOGS_DIR, { recursive: true });
fs.mkdirSync(MQTT_LOGS_DIR, { recursive: true });
fs.mkdirSync(CLIENT_LOGS_DIR, { recursive: true });

const SCRIPT_FILE = path.join(__dirname, '..', './simScripts/simulationScript.txt');

const clients = {};
let brokerPort = 1883;

function generateId(prefix) {
    return prefix + '-' + Math.random().toString(36).substring(2, 7);
}

// Store pub-ids for each publish (clientId+topic+payload -> pubId)
const pubIdMap = new Map();
const pubInfoByPubId = new Map(); // NEW: pubId -> { clientID, topic, message, aoi }
const subIdMap = new Map();

function logVastEvent(eventObj) {
    const line = JSON.stringify(eventObj) + '\n';
    fs.appendFile(EVENTS_LOG_PATH, line, err => {
        if (err) console.error('Error writing to events log:', err);
    });
}

function logClientEvent(eventObj) {
    const line = JSON.stringify(eventObj) + '\n';
    fs.appendFile(CLIENT_EVENTS_LOG_PATH, line, err => {
        if (err) console.error('Error writing to client events log:', err);
    });
}

function logBroker(message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    console.log(`[BROKER] ${line.trim()}`);
    fs.appendFile(BROKER_LOG_PATH, line, err => {
        if (err) console.error('Error writing to broker log:', err);
    });
    fs.appendFile(EVENTS_LOG_PATH, line, err => {
        if (err) console.error('Error writing to events log:', err);
    });
}

function logClient(clientId, message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    console.log(`[CLIENT ${clientId}] ${line.trim()}`);
    if (ENABLE_CLIENT_LOGS) {
        const clientLogPath = path.join(CLIENT_LOGS_DIR, `client_${clientId}.txt`);
        fs.appendFile(clientLogPath, line, err => {
            if (err) console.error(`Error writing to client ${clientId} log:`, err);
        });
    }
    fs.appendFile(EVENTS_LOG_PATH, line, err => {
        if (err) console.error('Error writing to events log:', err);
    });
}

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

    // PUB event on broker: only log if pubID is in payload (matches publishing client)
    broker.on('publish', (packet, client) => {
        if (!packet.topic.startsWith('$SYS') && client) {
            let payloadStr = packet.payload.toString();
            let pubIdMatch = payloadStr.match(/$$pub-id:\s*([^$$]+)\]$/);
            let pubId = pubIdMatch ? pubIdMatch[1].trim() : null;
            if (pubId) {
                let cleanMsg = payloadStr.replace(/\s*$$pub-id:\s*[^$$]+\]$/, '');
                logClientEvent({
                    time: Date.now(),
                    event: Client_Event.PUB,
                    id: client.id,
                    alias: "unnamed_client",
                    matcher: 1,
                    pub: {
                        pubID: pubId,
                        aoi: { center: BROKER_POS, radius: 10 }, // Substitute real AOI if available
                        channel: packet.topic,
                        payload: cleanMsg
                    }
                });
            }
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

            // Optional: subscribe client to their topics after connect here, if needed
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

        // On receiving a message, extract pubID from payload, log correct RECEIVE_PUB
        // client.on('message', (topic, message) => {
        //     let msgStr = message.toString();
        //     // let pubIdMatch = msgStr.match(/$$pub-id:\s*([^$$]+)\]$/);
        //     let pubIdMatch = msgStr.match(/$$pub-id:\s*([^$$]+)\]$/);
        //     let pubId = pubIdMatch ? pubIdMatch[1].trim() : null;
        //     let cleanMsg = msgStr.replace(/\s*$$pub-id:\s*[^$$]+\]$/, '');

        //     if (!pubId) return; // do not log if pubId not found

        //     logClient(clientId, `Received message on topic ${topic}: ${cleanMsg}`);

        //     logClientEvent({
        //         time: Date.now(),
        //         event: Client_Event.RECEIVE_PUB,
        //         id: clientId,
        //         alias: "unnamed_client",
        //         matcher: 1,
        //         pub: {
        //             matcherID: 1,
        //             clientID: clientId,
        //             pubID: pubId,
        //             aoi: { center: clientPos, radius: r },
        //             payload: cleanMsg,
        //             channel: topic,
        //             recipients: [1],
        //             chain: [1]
        //         }
        //     });
        // });
        client.on('message', (topic, message) => {
            let msgStr = message.toString();
            // Remove pub-id matching logic
            // let pubIdMatch = msgStr.match(/$$pub-id:\s*([^$$]+)\]$/);
            // let pubId = pubIdMatch ? pubIdMatch[1].trim() : null;
            // Instead, extract pubId from the end of the message (if present)
            let pubId = null;
            let cleanMsg = msgStr;
            const pubIdPattern = / \[pub-id: ([^\]]+)\]$/;
            const match = msgStr.match(pubIdPattern);
            if (match) {
                pubId = match[1];
                cleanMsg = msgStr.replace(pubIdPattern, '');
            }
            // Look up publisher info
            let pubInfo = pubId ? pubInfoByPubId.get(pubId) : null;
            if (!pubInfo) {
                // If not found, fallback to old behavior (receiver's info)
                pubInfo = {
                    clientID: clientId,
                    pubID: pubId,
                    aoi: { center: clientPos, radius: r },
                    message: cleanMsg,
                    topic: topic
                };
            }
            logClientEvent({
                time: Date.now(),
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
                // Store reverse mapping for receive log
                pubInfoByPubId.set(pubId, {
                    clientID: pubClientId,
                    topic: pubTopic,
                    message,
                    aoi: pubAoi
                });
                const payloadWithId = `${message} [pub-id: ${pubId}]`;
                clients[pubClientId].publish(pubTopic, payloadWithId, { qos: 0 }, (err) => {
                    if (err) {
                        logClient(pubClientId, `Failed to publish to ${pubTopic}: ${err.message}`);
                    } else {
                        logClient(pubClientId, `Published to ${pubTopic}: ${message} [pub-id: ${pubId}]`);
                        // PUB event (log here so it always matches pubID)
                        logClientEvent({
                            time: Date.now(),
                            event: Client_Event.PUB,
                            id: pubClientId,
                            alias: "unnamed_client",
                            matcher: 1,
                            pub: {
                                pubID: pubId,
                                aoi: pubAoi, // Use the correct AOI
                                channel: pubTopic,
                                payload: message
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