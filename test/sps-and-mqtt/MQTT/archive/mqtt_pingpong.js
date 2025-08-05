const fs = require('fs');
const path = require('path');
const aedes = require('aedes');
const net = require('net');
const mqtt = require('mqtt');

// Logging setup (reuse structure from mqtt-simulator_1.js)
const LOGS_DIR = path.join(__dirname, '../logs');
const MQTT_LOGS_DIR = path.join(LOGS_DIR, 'mqtt_pingpong');
const BROKER_LOG_PATH = path.join(MQTT_LOGS_DIR, 'broker.txt');
const EVENTS_LOG_PATH = path.join(MQTT_LOGS_DIR, 'events.txt');
const RTT_LOG_PATH = path.join(MQTT_LOGS_DIR, 'rtt.txt');
const pingTimestamps = {}; // round -> timestamp

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

function logRTT(round, rtt) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] RTT for round ${round}: ${rtt} ms\n`;
    fs.appendFileSync(RTT_LOG_PATH, line);
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

async function runPingPong({ rounds = 10, pingTopic = 'ping', pongTopic = 'pong', host = 'localhost', port = 1883 }) {
    let pingClient, pongClient;
    let currentRound = 0;
    let finished = false;

    return new Promise((resolve, reject) => {
        // Setup pong client first (so it can subscribe before ping sends)
        pongClient = mqtt.connect(`mqtt://${host}:${port}`, { clientId: 'pong' });
        pongClient.on('connect', () => {
            logClient('pong', `Connected, subscribing to '${pingTopic}'`);
            pongClient.subscribe(pingTopic, (err) => {
                if (err) {
                    logClient('pong', `Failed to subscribe: ${err.message}`);
                    reject(err);
                } else {
                    logClient('pong', `Subscribed to '${pingTopic}'`);
                }
            });
        });
        pongClient.on('message', (topic, message) => {
            let msgObj;
            try { msgObj = JSON.parse(message.toString()); } catch { return; }
            if (msgObj.type === 'ping') {
                logClient('pong', `Received 'ping' for round ${msgObj.round}`);
                const reply = JSON.stringify({ type: 'pong', round: msgObj.round });
                pongClient.publish(pongTopic, reply, () => {
                    logClient('pong', `Sent '${reply}' to '${pongTopic}'`);
                });
            }
        });
        pongClient.on('error', (err) => {
            logClient('pong', `Error: ${err.message}`);
            reject(err);
        });

        // Setup ping client
        pingClient = mqtt.connect(`mqtt://${host}:${port}`, { clientId: 'ping' });
        pingClient.on('connect', () => {
            logClient('ping', `Connected, subscribing to '${pongTopic}'`);
            pingClient.subscribe(pongTopic, (err) => {
                if (err) {
                    logClient('ping', `Failed to subscribe: ${err.message}`);
                    reject(err);
                } else {
                    logClient('ping', `Subscribed to '${pongTopic}'`);
                    // Start the first ping
                    sendPing();
                }
            });
        });
        pingClient.on('message', (topic, message) => {
            let msgObj;
            try { msgObj = JSON.parse(message.toString()); } catch { return; }
            if (msgObj.type === 'pong') {
                logClient('ping', `Received 'pong' for round ${msgObj.round}`);
                // Calculate RTT
                const sentTime = pingTimestamps[msgObj.round];
                if (sentTime) {
                    const rtt = Date.now() - sentTime;
                    logClient('ping', `RTT for round ${msgObj.round}: ${rtt} ms`);
                    logRTT(msgObj.round, rtt);
                }
                currentRound++;
                if (currentRound < rounds) {
                    setTimeout(sendPing, 100);
                } else {
                    logClient('ping', `Completed ${rounds} rounds. Exiting.`);
                    cleanup();
                    resolve();
                }
            }
        });
        pingClient.on('error', (err) => {
            logClient('ping', `Error: ${err.message}`);
            reject(err);
        });

        function sendPing() {
            const round = currentRound + 1;
            const msg = JSON.stringify({ type: 'ping', round });
            pingTimestamps[round] = Date.now(); // Record send time
            pingClient.publish(pingTopic, msg, () => {
                logClient('ping', `Sent '${msg}' to '${pingTopic}'`);
            });
        }

        function cleanup() {
            pingClient.end(true, () => logClient('ping', 'Disconnected'));
            pongClient.end(true, () => logClient('pong', 'Disconnected'));
        }
    });
}

(async () => {
    try {
        const { port } = await startBroker(1883);
        await runPingPong({ rounds: 10, port });
        logBroker('Ping-pong simulation finished.');
        process.exit(0);
    } catch (err) {
        logBroker(`Error: ${err.message}`);
        process.exit(1);
    }
})(); 