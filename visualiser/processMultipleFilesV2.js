const EventProcessor = require('./ClientEventParserV2');

// Array of event files to process
const eventFiles = [
    '/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/visualiser/logs_and_events/Client_events.txt',
    '/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/logs/spmqtt_client_events.txt',
    // '/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/logs/mqtt_client_events.txt'
    '/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/logs/mqtt_events/mqtt_client_events_no_broker.txt'
];

async function processAllFiles() {
    const processor = new EventProcessor();
    
    for (const file of eventFiles) {
        try {
            await processor.processFile(file);
        } catch (error) {
            console.error(`Failed to process ${file}:`, error);
        }
    }
}

// Run the script
processAllFiles().then(() => {
    console.log('\nAll files processed successfully!');
}).catch(error => {
    console.error('Error processing files:', error);
}); 