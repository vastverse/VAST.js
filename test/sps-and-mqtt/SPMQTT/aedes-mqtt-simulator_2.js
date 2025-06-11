const fs = require('fs');
const aedes = require('aedes');
const net = require('net');
const logStream = fs.createWriteStream('logs/broker.log', { flags: 'a' }); 

const SCRIPT_FILE = 'simulationScript.txt';

function logToFile(message) {
    const timestamp = Date.now();
    const line = `[${timestamp}] ${message}\n`;
    console.log(line.trim());
    logStream.write(line);
}


function startBroker(port = 1884) {
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

const mqtt = require('mqtt');

// Store clients for optional later use
const simulatedClients = {};

function createClient(clientId, host, port, x, y, r) {
    const url = `mqtt://${host}:${port}`;
    const options = { clientId };
    const client = mqtt.connect(url, options);

    // ✨ Create a log file specifically for this client
    const clientLogPath = `client_logs/client_${clientId}.log`;
    const clientLogStream = fs.createWriteStream(clientLogPath, { flags: 'a' });

    function logClient(message) {
        const timestamp = Date.now();
        const line = `[${timestamp}] ${clientId} | ${message}\n`;
        process.stdout.write(line);
        clientLogStream.write(line);
    }

    client.on('connect', () => {
        logClient(`Connected to ${url} (x=${x}, y=${y}, r=${r})`);
        simulatedClients[clientId] = { client, x, y, r, logClient };
    });

    client.on('error', (err) => {
        logClient(`Connection error: ${err.message}`);
    });

    client.on('close', () => {
        logClient(`Disconnected`);
    });

    client.on('message', (topic, message) => {
        logClient(`Received message on ${topic}: ${message.toString()}`);
    });

    return client;
}

async function processScript(scriptPath) {
    try {
        const data = fs.readFileSync(scriptPath, 'utf-8');
        const lines = data.trim().split('\n');

        for (let index = 0; index < lines.length; index++) {
            const line = lines[index].trim();
            if (line === '' || line.startsWith('#')) continue; // ignore empty or comment lines
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
            const isLocal = parts[2] === 'true';
            const host = parts[3];
            const pubPort = 1884;
            logToFile(`Starting broker (${label}) at ${host}:${pubPort}`);
            startBroker(pubPort);
            break;

        case 'newClient':
            const clientId = parts[1];
            const clientHost = parts[2];
            const clientPort = 1884;
            const x = parseFloat(parts[4]);
            const y = parseFloat(parts[5]);
            const r = parseFloat(parts[6]);
            logToFile(`Creating client ${clientId} connecting to ${clientHost}:${clientPort}`);
            createClient(clientId, clientHost, clientPort, x, y, r);
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
                // Inside the 'subscribe' case:
                if (simulatedClients[clientId]) {
                    const { client, logClient } = simulatedClients[clientId];
                    client.subscribe(topic, (err) => {
                        if (err) {
                            logClient(`Failed to subscribe to ${topic}: ${err.message}`);
                        } else {
                            logClient(`Subscribed to ${topic}`);
                        }
                    });
                }
                 else {
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
                    const { client, logClient } = simulatedClients[clientId];
                    client.publish(topic, message, (err) => {
                        if (err) {
                            logClient(`Failed to publish to ${topic}: ${err.message}`);
                        } else {
                            logClient(`Published to ${topic}: ${message}`);
                        }
                    });
                }
                else {
                    logToFile(`Client ${clientId} not found for publish`);
                }
            }
            break;

        case 'end':
            // End the simulation by terminating the process
            logToFile("Simulation ended.");
            process.exit(0);
        break;    

        default:
            logToFile(`Unknown command at line ${lineNumber}: ${command}`);
    }
}

processScript(SCRIPT_FILE);