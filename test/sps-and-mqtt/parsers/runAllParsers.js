const path = require('path');

async function run() {
    // Import your modules (edit these lines as needed)
    const MQTTEventParser = require('./MQTTEventParser');
    const ClientEventParserV2 = require('./ClientEventParserV2');
    const SPMQTTEventParser = require('./SPMQTTEventParser');

    // Define your log files here (edit paths if needed)
    const mqttLogFile = path.join(__dirname, '../logs/mqtt_events/mqtt_client_events_no_broker.txt');
    const clientEventLogFile = path.join(__dirname, '../SPS/logs_and_events/Client_events.txt');
    const spmqttLogFile = path.join(__dirname, '../logs/spmqtt_events/spmqtt_client_events_no_broker.txt');

    // Run each parser; externalize log file path if you want arithmetic/command line usage
    console.log('=== Running MQTTEventParser ===');
    await new MQTTEventParser().processFile(mqttLogFile);

    console.log('\n=== Running ClientEventParserV2 ===');
    await new ClientEventParserV2().processFile(clientEventLogFile);

    console.log('\n=== Running SPMQTTEventParser ===');
    await new SPMQTTEventParser().processFile(spmqttLogFile);

    console.log('\nAll parsers finished.');
}

run().catch(e => {
    console.error('Error running parsers:', e);
    process.exit(1);
}); 