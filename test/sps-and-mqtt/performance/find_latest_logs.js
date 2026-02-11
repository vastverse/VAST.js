const fs = require('fs');
const path = require('path');

function findLatestFile(dirPattern, fileName) {
    const parentDir = path.dirname(dirPattern);
    const dirName = path.basename(dirPattern);
    
    if (!fs.existsSync(parentDir)) {
        return null;
    }
    
    const dirs = fs.readdirSync(parentDir).filter(f => {
        return fs.statSync(path.join(parentDir, f)).isDirectory() &&
               f.startsWith(dirName);
    });
    
    if (dirs.length === 0) return null;
    
    // Sort by creation time, newest first
    dirs.sort((a, b) => {
        const statA = fs.statSync(path.join(parentDir, a));
        const statB = fs.statSync(path.join(parentDir, b));
        return statB.birthtimeMs - statA.birthtimeMs;
    });
    
    const latestDir = dirs[0];
    const filePath = path.join(parentDir, latestDir, fileName);
    
    return fs.existsSync(filePath) ? filePath : null;
}

function generateConfig() {
    const config = [];
    
    // SPS - always in same location
    const spsPath = '../SPS/logs_and_events/Client_events.txt';
    if (fs.existsSync(spsPath)) {
        config.push(`SPS|${spsPath}`);
    }
    
    // MQTT - find latest sim_small_uniform_* directory
    const mqttPath = findLatestFile(
        '../logs/mqtt_events/sim_small_uniform_',
        'mqtt_client_events_no_broker.txt'
    );
    if (mqttPath) {
        config.push(`MQTT|${mqttPath}`);
    }
    
    // SP-MQTT - find latest sim_small_uniform_* directory
    const spmqttPath = findLatestFile(
        '../logs/spmqtt_events/sim_small_uniform_',
        'spmqtt_client_events_no_broker.txt'
    );
    if (spmqttPath) {
        config.push(`SP-MQTT|${spmqttPath}`);
    }
    
    return config.join('\n');
}

module.exports = { generateConfig, findLatestFile };