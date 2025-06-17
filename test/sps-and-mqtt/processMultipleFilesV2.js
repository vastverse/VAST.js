// const EventProcessor = require('./ClientEventParserV2');
// const path = require('path');

// // Get the base directory for the project
// const BASE_DIR = path.join(__dirname, '..', '..');

// // Array of event files to process in order
// const eventFiles = [
//     // MQTT events
//     path.join(BASE_DIR, 'test', 'sps-and-mqtt', 'logs', 'mqtt_events', 'mqtt_client_events_no_broker.txt'),
    
//     // SPS events
//     path.join(BASE_DIR, 'test', 'sps-and-mqtt', 'SPS', 'logs_and_events', 'Client_events.txt'),
    
//     // SPS with MQTT events
//     path.join(BASE_DIR, 'test', 'sps-and-mqtt', 'logs', 'spmqtt_events', 'spmqtt_client_events_no_broker.txt')
// ];

// async function processAllFiles() {
//     const processor = new EventProcessor();
    
//     for (const file of eventFiles) {
//         try {
//             console.log(`\nProcessing file: ${file}`);
//             console.log('----------------------------------------');
//             await processor.processFile(file);
//         } catch (error) {
//             console.error(`Failed to process ${file}:`, error);
//         }
//     }
// }

// // Run the script
// processAllFiles().then(() => {
//     console.log('\nAll files processed successfully!');
// }).catch(error => {
//     console.error('Error processing files:', error);
// }); 


const EventProcessor = require('./ClientEventParserV2');

// Array of event files to process
const eventFiles = [
    '/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/SPS/logs_and_events/Client_events.txt',
    '/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/logs/spmqtt_events/spmqtt_client_events_no_broker.txt',
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