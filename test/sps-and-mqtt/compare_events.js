const fs = require('fs');
const path = require('path');

// Event type mapping
const EVENT_TYPES = {
    0: 'CLIENT_JOIN',
    1: 'CLIENT_LEAVE',
    2: 'CLIENT_CONNECT',
    3: 'CLIENT_DISCONNECT',
    4: 'CLIENT_MIGRATE',
    5: 'CLIENT_MOVE',
    6: 'SUB_NEW',
    7: 'SUB_UPDATE',
    8: 'SUB_DELETE',
    9: 'PUB',
    10: 'RECEIVE_PUB'
};

// Read and parse log files
const mqttLogPath = path.join(__dirname, 'logs', 'mqtt_events', 'mqtt_client_events_no_broker.txt');
const spsLogPath = path.join(__dirname, 'SPS', 'logs_and_events', 'Client_events.txt');

const mqttEvents = fs.readFileSync(mqttLogPath, 'utf8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));

const spsEvents = fs.readFileSync(spsLogPath, 'utf8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));

// Create CSV header
const csvHeader = 'Time,Event Type,Client ID,Details\n';

// Function to format event details
function formatEventDetails(event) {
    const details = [];
    if (event.pos) details.push(`pos:(${event.pos.x},${event.pos.y})`);
    if (event.sub) details.push(`sub:${event.sub.subID}`);
    if (event.pub) details.push(`pub:${event.pub.pubID}`);
    if (event.subID) details.push(`subID:${event.subID}`);
    return details.join('; ');
}

// Create CSV content
let csvContent = csvHeader;

// Process MQTT events
mqttEvents.forEach(event => {
    const eventType = EVENT_TYPES[event.event] || `UNKNOWN(${event.event})`;
    const details = formatEventDetails(event);
    csvContent += `${event.time},${eventType},${event.id},${details}\n`;
});

// Add a separator
csvContent += '\n--- SPS Events ---\n' + csvHeader;

// Process SPS events
spsEvents.forEach(event => {
    const eventType = EVENT_TYPES[event.event] || `UNKNOWN(${event.event})`;
    const details = formatEventDetails(event);
    csvContent += `${event.time},${eventType},${event.id},${details}\n`;
});

// Write to file
const outputPath = path.join(__dirname, 'event_comparison.csv');
fs.writeFileSync(outputPath, csvContent);

console.log(`Comparison file created at: ${outputPath}`); 