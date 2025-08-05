const fs = require('fs');
const path = require('path');
const aedes = require('aedes');
const net = require('net');
const mqtt = require('mqtt');
require('../../../../lib/common');  // This will make Client_Event available globally

// Create logs directory structure
const LOGS_DIR = path.join(__dirname, '../logs');
const MQTT_LOGS_DIR = path.join(LOGS_DIR, 'mqtt_events');
const CLIENT_LOGS_DIR = path.join(MQTT_LOGS_DIR, 'clients');
const BROKER_LOG_PATH = path.join(MQTT_LOGS_DIR, 'broker.txt');
const EVENTS_LOG_PATH = path.join(MQTT_LOGS_DIR, 'mqtt_client_events.txt');
const CLIENT_EVENTS_LOG_PATH = path.join(MQTT_LOGS_DIR, 'mqtt_client_events_no_broker.txt');

// Configuration flags
const ENABLE_CLIENT_LOGS = false;
let ENABLE_PING_PONG = true;
const PING_PONG_DELAY = 100; // ms delay before responding
const MAX_PING_PONG_ROUNDS = 10; // prevent infinite loops

fs.mkdirSync(LOGS_DIR, { recursive: true });
fs.mkdirSync(MQTT_LOGS_DIR, { recursive: true });
fs.mkdirSync(CLIENT_LOGS_DIR, { recursive: true });

const SCRIPT_FILE = path.join(__dirname, '..', './simScripts/simulationScript.txt');

const clients = {};
const clientPositions = new Map();
const clientAliases = new Map(); // clientId -> alias for proper naming
const matchers = {};
let defaultMatcherPort = 20000;

// Track ping-pong sessions and RTT
const pingPongSessions = new Map(); // sessionId -> { count, originClient, topic }
const rttMeasurements = new Map(); // sessionId -> [{ round, rtt, timestamp }]

function generateId(prefix) {
    return prefix + '-' + Math.random().toString(36).substring(2, 7);
}

// Store pub-ids for each publish (clientId+topic+payload -> pubId)
const pubIdMap = new Map();
const pubInfoByPubId = new Map(); // pubId -> { clientID, topic, message, aoi }
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

function getClientAlias(clientId) {
    return clientAliases.get(clientId) || clientId;
}

function handlePingPongMessage(clientId, topic, message, pubId) {
    if (!ENABLE_PING_PONG) return;
    
    const pingPongPattern = /$$(ping|pong):(\d+):([^$$]+)\]/;
    const timestampPattern = /$$ts:(\d+)$$/;
    const match = message.match(pingPongPattern);
    const tsMatch = message.match(timestampPattern);
    
    if (match) {
        const [, type, round, sessionId] = match;
        const currentRound = parseInt(round);
        const receivedTime = Date.now();
        
        // Calculate RTT if this is a response back to original sender
        if (tsMatch && type === 'pong') {
            const sentTime = parseInt(tsMatch[1]);
            const rtt = receivedTime - sentTime;
            
            // Store RTT measurement
            if (!rttMeasurements.has(sessionId)) {
                rttMeasurements.set(sessionId, []);
            }
            rttMeasurements.get(sessionId).push({
                round: currentRound,
                rtt: rtt,
                timestamp: receivedTime
            });
            
            logClient(clientId, `RTT measurement: ${rtt}ms (round ${currentRound})`);
        }
        
        // Check if we should continue the session
        if (currentRound >= MAX_PING_PONG_ROUNDS) {
            // Calculate average RTT for session
            const measurements = rttMeasurements.get(sessionId);
            if (measurements && measurements.length > 0) {
                const avgRtt = measurements.reduce((sum, m) => sum + m.rtt, 0) / measurements.length;
                const minRtt = Math.min(...measurements.map(m => m.rtt));
                const maxRtt = Math.max(...measurements.map(m => m.rtt));
                
                logClient(clientId, `Ping-pong session ${sessionId} statistics:`);
                logClient(clientId, `  Average RTT: ${avgRtt.toFixed(2)}ms`);
                logClient(clientId, `  Min RTT: ${minRtt}ms`);
                logClient(clientId, `  Max RTT: ${maxRtt}ms`);
                logClient(clientId, `  Total rounds: ${measurements.length}`);
            }
            
            logClient(clientId, `Ping-pong session ${sessionId} ended after ${currentRound} rounds`);
            pingPongSessions.delete(sessionId);
            rttMeasurements.delete(sessionId);
            return;
        }
        
        // Prepare response with timestamp
        const responseType = type === 'ping' ? 'pong' : 'ping';
        const nextRound = currentRound + 1;
        const baseMessage = message.replace(pingPongPattern, '').replace(timestampPattern, '').trim();
        const responseMessage = `${baseMessage} [${responseType}:${nextRound}:${sessionId}] [ts:${Date.now()}]`;
        
        // Schedule response
        setTimeout(() => {
            publishPingPongResponse(clientId, topic, responseMessage, sessionId);
        }, PING_PONG_DELAY);
    }
}

function publishPingPongResponse(clientId, topic, message, sessionId) {
    const client = clients[clientId];
    if (!client) return;
    
    // Get actual client position
    const pos = clientPositions.get(clientId) || { x: 0, y: 0, r: 100 };
    const aoi = { center: { x: pos.x, y: pos.y }, radius: pos.r };
    
    // Generate pubId for response
    const pubKey = clientId + ':' + topic + ':' + message;
    let pubId = pubIdMap.get(pubKey);
    if (!pubId) {
        pubId = generateId('PUB');
        pubIdMap.set(pubKey, pubId);
    }
    
    // Store pub info
    pubInfoByPubId.set(pubId, {
        clientID: clientId,
        topic: topic,
        message: message,
        aoi: aoi
    });
    
    const payloadWithId = `${message} [pub-id: ${pubId}]`;
    
    client.publish(topic, payloadWithId, { qos: 0 }, (err) => {
        if (err) {
            logClient(clientId, `Failed to publish ping-pong response: ${err.message}`);
        } else {
            logClient(clientId, `Published ping-pong response: ${message}`);
            
            // Log the PUB event
            logClientEvent({
                time: Date.now(),
                event: Client_Event.PUB,
                id: clientId,
                alias: getClientAlias(clientId),
                matcher: 1,
                pub: {
                    pubID: pubId,
                    aoi: aoi,
                    channel: topic,
                    payload: message
                }
            });
        }
    });
}

function startBroker(matcherId, host, mqttPort, x, y) {
    const broker = aedes();
    const BROKER_POS = { x: x || 500, y: y || 500 };

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
                    alias: getClientAlias(client.id),
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
                        alias: getClientAlias(client.id),
                        matcher: 1,
                        subID: subId
                    });
                    subIdMap.delete(subKey);
                }
            });
        }
    });

    broker.on('publish', (packet, client) => {
        if (!packet.topic.startsWith('$SYS') && client) {
            let payloadStr = packet.payload.toString();
            let pubIdMatch = payloadStr.match(/$$pub-id: ([^$$]+)\]$/);
            let pubId = pubIdMatch ? pubIdMatch[1].trim() : null;
            if (pubId) {
                let cleanMsg = payloadStr.replace(/\s*$$pub-id: [^$$]+\]$/, '');
                logClientEvent({
                    time: Date.now(),
                    event: Client_Event.PUB,
                    id: client.id,
                    alias: getClientAlias(client.id),
                    matcher: 1,
                    pub: {
                        pubID: pubId,
                        aoi: { center: BROKER_POS, radius: 10 },
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
                logBroker(`Matcher ${matcherId} broker started on port ${port}`);
                resolve(port);
            });
        });
    };

    return startServer(mqttPort).then(actualPort => {
        return { broker, server, port: actualPort, id: matcherId, pos: BROKER_POS };
    });
}

function createClient(clientId, host, port, x, y, r) {
    return new Promise((resolve, reject) => {
        const url = `mqtt://${host}:${port}`;
        const client = mqtt.connect(url, { clientId });
        const clientPos = { x, y };

        // Store client position with radius
        clientPositions.set(clientId, { x, y, r: r || 100 });
        // Store alias
        clientAliases.set(clientId, clientId);

        logClientEvent({
            time: Date.now(),
            event: Client_Event.CLIENT_JOIN,
            id: clientId,
            alias: getClientAlias(clientId),
            pos: clientPos,
            matcher: 0
        });

        client.on('connect', () => {
            logClientEvent({
                time: Date.now(),
                event: Client_Event.CLIENT_CONNECT,
                id: clientId,
                alias: getClientAlias(clientId),
                pos: clientPos,
                matcher: 0
            });
            logClientEvent({
                time: Date.now(),
                event: Client_Event.CLIENT_MIGRATE,
                id: clientId,
                alias: getClientAlias(clientId),
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
                alias: getClientAlias(clientId),
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
                alias: getClientAlias(clientId),
                pos: clientPos,
                matcher: 1
            });
        });

        client.on('message', (topic, message) => {
            let msgStr = message.toString();
            let pubId = null;
            let cleanMsg = msgStr;
            const pubIdPattern = / $$pub-id: ([^$$]+)\]$/;
            const match = msgStr.match(pubIdPattern);
            if (match) {
                pubId = match[1];
                cleanMsg = msgStr.replace(pubIdPattern, '');
            }
            
            // Look up publisher info
            let pubInfo = pubId ? pubInfoByPubId.get(pubId) : null;
            if (!pubInfo) {
                pubInfo = {
                    clientID: clientId,
                    pubID: pubId,
                    aoi: { center: clientPos, radius: r },
                    message: cleanMsg,
                    topic: topic
                };
            }
            
            logClient(clientId, `Received message on topic ${topic}: ${cleanMsg}`);
            
            logClientEvent({
                time: Date.now(),
                event: Client_Event.RECEIVE_PUB,
                id: clientId,
                alias: getClientAlias(clientId),
                matcher: 1,
                pub: {
                    matcherID: 1,
                    clientID: pubInfo.clientID,
                    pubID: pubId,
                    aoi: pubInfo.aoi,
                    payload: pubInfo.message,
                    channel: pubInfo.topic,
                    recipients: [1],
                    chain: [1]
                }
            });
            
            // Handle ping-pong messages
            handlePingPongMessage(clientId, topic, cleanMsg, pubId);
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
            // newMatcher GW true localhost 8000 8001 20000 500 500 1500
            const matcherId = parts[1];
            const isGateway = parts[2] === 'true';
            const host = parts[3];
            const port1 = parseInt(parts[4]); // not used in this simplified version
            const port2 = parseInt(parts[5]); // not used in this simplified version
            const mqttPort = parseInt(parts[6]);
            const x = parseFloat(parts[7]);
            const y = parseFloat(parts[8]);
            const aoiRadius = parseFloat(parts[9]);
            
            logBroker(`Starting matcher ${matcherId} at ${host}:${mqttPort}`);
            const matcher = await startBroker(matcherId, host, mqttPort, x, y);
            matchers[matcherId] = matcher;
            defaultMatcherPort = matcher.port;
            break;
        }

        case 'newClient': {
            // newClient C1 localhost 20000 300 100 100
            const clientId = parts[1];
            const clientHost = parts[2];
            const port = parseInt(parts[3]);
            const x = parseFloat(parts[4]);
            const y = parseFloat(parts[5]);
            const r = parseFloat(parts[6]) || 100;
            
            logClient(clientId, `Creating connection to ${clientHost}:${port}`);
            try {
                await createClient(clientId, clientHost, port, x, y, r);
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
            // subscribe C2 500 500 300 channel1
            const subClientId = parts[1];
            const subX = parseFloat(parts[2]);
            const subY = parseFloat(parts[3]);
            const subRadius = parseFloat(parts[4]);
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
                        logClient(subClientId, `Subscribing to ${topic} with AOI center (${subX},${subY}) radius ${subRadius} [sub-id: ${subId}]`);
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
            // unsubscribe C1 500 500 300 channel1
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
            // publish C1 1000 500 300 channel1 "hello from C1!"
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
                        logClient(pubClientId, `Published to ${pubTopic} with AOI center (${pubAoiX},${pubAoiY}) radius ${pubAoiR}: ${message} [pub-id: ${pubId}]`);
                        // PUB event (log here so it always matches pubID)
                        logClientEvent({
                            time: Date.now(),
                            event: Client_Event.PUB,
                            id: pubClientId,
                            alias: getClientAlias(pubClientId),
                            matcher: 1,
                            pub: {
                                pubID: pubId,
                                aoi: pubAoi,
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

        case 'startPingPong': {
            // startPingPong C1 channel1 "Hello ping pong"
            const initiatorId = parts[1];
            const topic = parts[2];
            const message = parts.slice(3).join(' ').replace(/^"|"$/g, '');
            
            if (clients[initiatorId]) {
                const sessionId = generateId('PP');
                const timestamp = Date.now();
                const pingMessage = `${message} [ping:1:${sessionId}] [ts:${timestamp}]`;
                
                pingPongSessions.set(sessionId, {
                    count: 1,
                    originClient: initiatorId,
                    topic: topic
                });
                
                // Get client position for AOI
                const pos = clientPositions.get(initiatorId) || { x: 0, y: 0, r: 100 };
                const aoi = { center: { x: pos.x, y: pos.y }, radius: pos.r };
                
                // Publish initial ping
                const pubKey = initiatorId + ':' + topic + ':' + pingMessage;
                let pubId = pubIdMap.get(pubKey);
                if (!pubId) {
                    pubId = generateId('PUB');
                    pubIdMap.set(pubKey, pubId);
                }
                
                // Store pub info
                pubInfoByPubId.set(pubId, {
                    clientID: initiatorId,
                    topic: topic,
                    message: pingMessage,
                    aoi: aoi
                });
                
                const payloadWithId = `${pingMessage} [pub-id: ${pubId}]`;
                clients[initiatorId].publish(topic, payloadWithId, { qos: 0 }, (err) => {
                    if (!err) {
                        logClient(initiatorId, `Started ping-pong session ${sessionId} on topic ${topic}`);
                        // Log the PUB event
                        logClientEvent({
                            time: Date.now(),
                            event: Client_Event.PUB,
                            id: initiatorId,
                            alias: getClientAlias(initiatorId),
                            matcher: 1,
                            pub: {
                                pubID: pubId,
                                aoi: aoi,
                                channel: topic,
                                payload: pingMessage
                            }
                        });
                    } else {
                        logClient(initiatorId, `Failed to start ping-pong session: ${err.message}`);
                    }
                });
            } else {
                logBroker(`Client ${initiatorId} not found for startPingPong`);
            }
            break;
        }

        case 'enablePingPong': {
            ENABLE_PING_PONG = true;
            logBroker('Ping-pong mode enabled');
            break;
        }

        case 'disablePingPong': {
            ENABLE_PING_PONG = false;
            logBroker('Ping-pong mode disabled');
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
    
    // Log final RTT statistics for any active sessions
    for (const [sessionId, measurements] of rttMeasurements.entries()) {
        if (measurements.length > 0) {
            const avgRtt = measurements.reduce((sum, m) => sum + m.rtt, 0) / measurements.length;
            const minRtt = Math.min(...measurements.map(m => m.rtt));
            const maxRtt = Math.max(...measurements.map(m => m.rtt));
            
            logBroker(`Final statistics for session ${sessionId}:`);
            logBroker(`  Average RTT: ${avgRtt.toFixed(2)}ms`);
            logBroker(`  Min RTT: ${minRtt}ms`);
            logBroker(`  Max RTT: ${maxRtt}ms`);
            logBroker(`  Total measurements: ${measurements.length}`);
        }
    }
    
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

process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    await cleanup();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    await cleanup();
    await cleanup();
    process.exit(0);
});

// Start processing the script
processScript(SCRIPT_FILE);