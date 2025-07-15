const MQTTEventParser = require('./MQTTEventParser');
const EventProcessor = require('./ClientEventParserV2');
const SPMQTTEventParser = require('./SPMQTTEventParser');

// List of files and their relevant parser
const eventFiles = [
    {
        file: '/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/SPS/logs_and_events/Client_events.txt',
        parser: EventProcessor,
        label: 'ClientEventParserV2'
    },
    {
        file: '/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/logs/spmqtt_events/spmqtt_client_events_no_broker.txt',
        parser: SPMQTTEventParser,
        label: 'SPMQTTEventParser'
    },
    {
        file: '/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/logs/mqtt_events/mqtt_client_events_no_broker.txt',
        parser: MQTTEventParser,
        label: 'MQTTEventParser'
    }
];

async function processAllFiles() {
    for (const { file, parser, label } of eventFiles) {
        console.log(`\nProcessing ${file} with ${label}`);
        try {
            const processor = new parser();
            await processor.processFile(file);
        } catch (error) {
            console.error(`Failed to process ${file}:`, error);
        }
    }
}

processAllFiles().then(() => {
    console.log('\nAll files processed successfully!');
}).catch(error => {
    console.error('Error processing files:', error);
});