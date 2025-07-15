const fs = require('fs');
const path = require('path');

// Array of event files to process
const eventFiles = [
    // MQTT events
    path.join(__dirname, 'logs', 'mqtt_events', 'mqtt_client_events_no_broker.txt'),
    // SPS events
    path.join(__dirname, 'logs', 'sps_events', 'Simulator_logs.txt'),
    // SPS with MQTT events
    path.join(__dirname, 'logs', 'spmqtt_events', 'spmqtt_client_events_no_broker.txt')
];

function analyzeLatency(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        return [];
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    const publishes = {};
    const latencies = [];

    for (const line of lines) {
        let event;
        try {
            event = JSON.parse(line);
        } catch (e) {
            continue;
        }
        if (event.event === 9 && event.pub && event.pub.pubID) {
            // Publish event
            publishes[event.pub.pubID] = {
                time: event.time,
                client: event.id,
                channel: event.pub.channel
            };
        } else if (event.event === 10 && event.pub && event.pub.pubID) {
            // Receive event
            const pubID = event.pub.pubID;
            if (publishes[pubID]) {
                latencies.push({
                    publishClient: publishes[pubID].client,
                    receiveClient: event.id,
                    channel: event.pub.channel,
                    latency: event.time - publishes[pubID].time,
                    publishTime: publishes[pubID].time,
                    receiveTime: event.time
                });
            }
        }
    }
    return latencies;
}

function printLatencyStats(events, systemName) {
    if (events.length === 0) {
        console.log(`\nNo latency data for ${systemName}`);
        return;
    }
    const latencies = events.map(e => e.latency);
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const min = Math.min(...latencies);
    const max = Math.max(...latencies);
    console.log(`\n${systemName} Latency Statistics:`);
    console.log(`Total messages: ${events.length}`);
    console.log(`Average latency: ${avg.toFixed(2)}ms`);
    console.log(`Min latency: ${min}ms`);
    console.log(`Max latency: ${max}ms`);
    // Print individual message latencies
    console.log('\nDetailed Latencies:');
    events.forEach(e => {
        console.log(`${e.publishClient} -> ${e.receiveClient} on ${e.channel}: ${e.latency}ms`);
    });
}

// Process each file
for (const file of eventFiles) {
    try {
        const systemName = path.basename(path.dirname(file));
        const events = analyzeLatency(file);
        printLatencyStats(events, systemName);
    } catch (error) {
        console.error(`Error processing ${file}:`, error);
    }
} 