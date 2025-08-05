const fs = require('fs');
const path = require('path');
const aedes = require('aedes');
const net = require('net');
const mqtt = require('mqtt');

// Logging setup
const LOGS_DIR = path.join(__dirname, '../logs');
const MQTT_LOGS_DIR = path.join(LOGS_DIR, 'mqtt_script_pingpong');
const BROKER_LOG_PATH = path.join(MQTT_LOGS_DIR, 'broker.txt');
const EVENTS_LOG_PATH = path.join(MQTT_LOGS_DIR, 'events.txt');

fs.mkdirSync(LOGS_DIR, { recursive: true });
fs.mkdirSync(MQTT_LOGS_DIR, { recursive: true });

function logBroker(message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    console.log(`[BROKER] ${line.trim()}`);
    fs.appendFileSync(BROKER_LOG_PATH, line);
    fs.appendFileSync(EVENTS_LOG_PATH, line);
}

function logClient(clientId, message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    console.log(`[CLIENT ${clientId}] ${line.trim()}`);
    fs.appendFileSync(EVENTS_LOG_PATH, line);
}

async function startBroker(port = 1883) {
    const broker = aedes();
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
                resolve({ broker, server, port });
            });
        });
    };
    return startServer(port);
}

// --- Simulator State ---
const clients = {};
const clientSubscriptions = {}; // clientId -> Set of topics
let pingPongEnabled = true;
const pingPongActive = {}; // topic -> boolean (to prevent infinite loops)

function addSubscription(clientId, topic) {
    if (!clientSubscriptions[clientId]) clientSubscriptions[clientId] = new Set();
    clientSubscriptions[clientId].add(topic);
}

function removeSubscription(clientId, topic) {
    if (clientSubscriptions[clientId]) clientSubscriptions[clientId].delete(topic);
}

function isSubscribed(clientId, topic) {
    return clientSubscriptions[clientId] && clientSubscriptions[clientId].has(topic);
}

// --- Script Processing ---
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
        logBroker(`Error reading script: ${err.message}`);
    }
}

async function processLine(line, lineNumber) {
    const parts = line.trim().split(/\s+/);
    const command = parts[0];
    switch (command) {
        case 'newMatcher': {
            // newMatcher GW true localhost 8000 8001 20000 500 500 1500
            const port = parseInt(parts[6]);
            logBroker(`Starting matcher at port ${port}`);
            const { port: actualPort } = await startBroker(port);
            global.brokerPort = actualPort;
            break;
        }
        case 'newClient': {
            // newClient C1 localhost 20000 300 100 100
            const clientId = parts[1];
            const host = parts[2];
            const port = global.brokerPort || 1883;
            logClient(clientId, `Connecting to ${host}:${port}`);
            await createClient(clientId, host, port);
            break;
        }
        case 'subscribe': {
            // subscribe C1 500 500 300 channel1
            const clientId = parts[1];
            const topic = parts.slice(5).join(' ');
            if (clients[clientId]) {
                clients[clientId].subscribe(topic, (err) => {
                    if (err) {
                        logClient(clientId, `Failed to subscribe to ${topic}: ${err.message}`);
                    } else {
                        logClient(clientId, `Subscribed to ${topic}`);
                        addSubscription(clientId, topic);
                    }
                });
            }
            break;
        }
        case 'unsubscribe': {
            // unsubscribe C1 500 500 300 channel1
            const clientId = parts[1];
            const topic = parts.slice(5).join(' ');
            if (clients[clientId]) {
                clients[clientId].unsubscribe(topic, (err) => {
                    if (err) {
                        logClient(clientId, `Failed to unsubscribe from ${topic}: ${err.message}`);
                    } else {
                        logClient(clientId, `Unsubscribed from ${topic}`);
                        removeSubscription(clientId, topic);
                    }
                });
            }
            break;
        }
        case 'publish': {
            // publish C1 1000 500 300 channel1 "message"
            const clientId = parts[1];
            const topic = parts[5];
            const message = parts.slice(6).join(' ').replace(/^"|"$/g, '');
            if (clients[clientId]) {
                clients[clientId].publish(topic, message, () => {
                    logClient(clientId, `Published to ${topic}: ${message}`);
                });
            }
            break;
        }
        case 'wait': {
            const ms = parseInt(parts[1]);
            logBroker(`Waiting for ${ms} ms`);
            await new Promise(resolve => setTimeout(resolve, ms));
            break;
        }
        case 'startPingPong': {
            // startPingPong C1 channel1 "RTT Test Message"
            const clientId = parts[1];
            const topic = parts[2];
            const message = parts.slice(3).join(' ').replace(/^"|"$/g, '');
            if (clients[clientId]) {
                logClient(clientId, `Starting ping-pong on ${topic} with message: ${message}`);
                pingPongActive[topic] = true;
                clients[clientId].publish(topic, message, () => {
                    logClient(clientId, `Ping-pong initial message sent to ${topic}: ${message}`);
                });
            }
            break;
        }
        case 'enablePingPong': {
            pingPongEnabled = true;
            logBroker('Ping-pong enabled');
            break;
        }
        case 'disablePingPong': {
            pingPongEnabled = false;
            logBroker('Ping-pong disabled');
            break;
        }
        case 'end': {
            logBroker('Simulation ended.');
            await cleanup();
            process.exit(0);
            break;
        }
        default:
            logBroker(`Unknown command at line ${lineNumber}: ${command}`);
    }
}

async function createClient(clientId, host, port) {
    return new Promise((resolve, reject) => {
        const client = mqtt.connect(`mqtt://${host}:${port}`, { clientId });
        clients[clientId] = client;
        clientSubscriptions[clientId] = new Set();
        client.on('connect', () => {
            logClient(clientId, 'Connected');
            resolve(client);
        });
        client.on('message', (topic, message) => {
            logClient(clientId, `Received on ${topic}: ${message}`);
            // Ping-pong logic
            if (pingPongEnabled && pingPongActive[topic]) {
                // Prevent infinite loops: only respond if message is not from this client
                // (Assume message format: "<msg> [from: <clientId>]")
                const msgStr = message.toString();
                const fromMatch = msgStr.match(/\[from: ([^\]]+)\]$/);
                const fromId = fromMatch ? fromMatch[1] : null;
                if (fromId !== clientId) {
                    // Respond with a new message, append [from: <clientId>]
                    const reply = `pong from ${clientId} [from: ${clientId}]`;
                    setTimeout(() => {
                        client.publish(topic, reply, () => {
                            logClient(clientId, `Ping-pong reply sent to ${topic}: ${reply}`);
                        });
                    }, 50); // Small delay to avoid message storms
                }
            }
        });
        client.on('error', (err) => {
            logClient(clientId, `Error: ${err.message}`);
            reject(err);
        });
    });
}

async function cleanup() {
    logBroker('Starting cleanup...');
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
    logBroker('Cleanup completed');
}

// --- Main ---
(async () => {
    try {
        // Default script file path
        const scriptFile = process.argv[2] || path.join(__dirname, '../simScripts/simulationScript.txt');
        await processScript(scriptFile);
    } catch (err) {
        logBroker(`Error: ${err.message}`);
        process.exit(1);
    }
})(); 