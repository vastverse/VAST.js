const fs = require('fs');
const path = require('path');
const aedes = require('aedes');
const net = require('net');
const mqtt = require('mqtt');
require('../../../lib/common');  // This will make Client_Event available globally

class MQTTSimulator {
    constructor() {
        this.clients = {};
        this.brokerPort = 1883;
        this.brokerServer = null;
        this.broker = null;
        this.currentSimulation = null;
        
        // Store pub-ids for each publish
        this.pubIdMap = new Map();
        this.pubInfoByPubId = new Map();
        this.subIdMap = new Map();
        this.publishTimestamps = new Map(); // Latency tracking
        
        // Configuration flags
        this.ENABLE_CLIENT_LOGS = false;
        
        this.setupLogging();
    }

    setupLogging() {
        // Create logs directory structure
        this.LOGS_DIR = path.join(__dirname, '../logs');
        this.MQTT_LOGS_DIR = path.join(this.LOGS_DIR, 'mqtt_events');
        this.CLIENT_LOGS_DIR = path.join(this.MQTT_LOGS_DIR, 'clients');
        this.BROKER_LOG_PATH = path.join(this.MQTT_LOGS_DIR, 'broker.txt');
        this.EVENTS_LOG_PATH = path.join(this.MQTT_LOGS_DIR, 'mqtt_client_events.txt');
        this.CLIENT_EVENTS_LOG_PATH = path.join(this.MQTT_LOGS_DIR, 'mqtt_client_events_no_broker.txt');

        fs.mkdirSync(this.LOGS_DIR, { recursive: true });
        fs.mkdirSync(this.MQTT_LOGS_DIR, { recursive: true });
        fs.mkdirSync(this.CLIENT_LOGS_DIR, { recursive: true });
    }

    // Find all script directories
    findScriptDirectories(baseDir) {
        const scriptDirs = [];
        
        try {
            const items = fs.readdirSync(baseDir);
            
            for (const item of items) {
                const itemPath = path.join(baseDir, item);
                const stat = fs.statSync(itemPath);
                
                if (stat.isDirectory() && item.startsWith('Scripts_')) {
                    scriptDirs.push({
                        name: item,
                        path: itemPath,
                        timestamp: this.extractTimestamp(item)
                    });
                }
            }
            
            // Sort by timestamp (newest first)
            scriptDirs.sort((a, b) => b.timestamp - a.timestamp);
            
        } catch (error) {
            console.error(`Error reading directory ${baseDir}:`, error.message);
        }
        
        return scriptDirs;
    }

    // Extract timestamp from directory name
    extractTimestamp(dirName) {
        const match = dirName.match(/Scripts_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})/);
        if (match) {
            const [, date, time] = match;
            const dateTimeStr = `${date}T${time.replace(/-/g, ':')}`;
            return new Date(dateTimeStr).getTime();
        }
        return 0;
    }

        // Run multiple scripts sequentially
    async runAllScripts(mqttScripts) {
        console.log(`\n🎮 Running ${mqttScripts.length} scripts sequentially...\n`);
        
        for (let i = 0; i < mqttScripts.length; i++) {
            const script = mqttScripts[i];
            console.log(`\n📍 [${i + 1}/${mqttScripts.length}] Starting: ${script.name}`);
            console.log(`   Scale: ${script.scale}, Pattern: ${script.pattern}`);
            
            try {
                // Reset state for each script
                await this.cleanup();
                this.resetState();
                
                // Create simulation-specific log directory
                const simLogDir = path.join(this.MQTT_LOGS_DIR, `sim_${script.scale}_${script.pattern}_${Date.now()}`);
                fs.mkdirSync(simLogDir, { recursive: true });
                this.updateLogPaths(simLogDir);
                
                // Process the script
                await this.processScript(script.path);
                
                console.log(`✅ [${i + 1}/${mqttScripts.length}] Completed: ${script.name}`);
                
                if (i < mqttScripts.length - 1) {
                    console.log('   Waiting 5 seconds before next script...');
                    await this.wait(5000);
                }
            } catch (error) {
                console.error(`❌ [${i + 1}/${mqttScripts.length}] Failed: ${script.name}`, error.message);
            }
        }
        
        console.log('\n🎉 All scripts completed!');
        await this.cleanup();
        process.exit(0);
    }
    // Find MQTT scripts in a directory
    findMQTTScripts(scriptsDir) {
        const mqttScripts = [];
        
        try {
            // First, check if there's an 'mqtt' subfolder
            const mqttSubfolder = path.join(scriptsDir, 'mqtt');
            let searchDir = scriptsDir;
            
            if (fs.existsSync(mqttSubfolder)) {
                console.log(`📁 Found mqtt subfolder, searching in: ${mqttSubfolder}`);
                searchDir = mqttSubfolder;
            } else {
                console.log(`📁 No mqtt subfolder found, searching in: ${scriptsDir}`);
            }
            
            const files = fs.readdirSync(searchDir);
            
            for (const file of files) {
                // Look for simulation files (both mqtt_ prefixed and regular simulation_ files in mqtt folder)
                if ((file.startsWith('mqtt_simulation_') || file.startsWith('simulation_')) && file.endsWith('.txt')) {
                    const filePath = path.join(searchDir, file);
                    mqttScripts.push({
                        name: file,
                        path: filePath,
                        scale: this.extractScale(file),
                        pattern: this.extractPattern(file)
                    });
                }
            }
            
            // Sort by scale and pattern for consistent ordering
            mqttScripts.sort((a, b) => {
                if (a.scale !== b.scale) return a.scale.localeCompare(b.scale);
                return a.pattern.localeCompare(b.pattern);
            });
            
        } catch (error) {
            console.error(`Error reading scripts directory ${searchDir}:`, error.message);
        }
        
        return mqttScripts;
    }

    // Extract scale from filename - handle both formats
    extractScale(filename) {
        // Handle mqtt_simulation_scale_pattern.txt format
        let match = filename.match(/mqtt_simulation_(\w+)_/);
        if (match) return match[1];
        
        // Handle simulation_scale_pattern.txt format (files in mqtt folder)
        match = filename.match(/simulation_(\w+)_/);
        return match ? match[1] : 'unknown';
    }

    // Extract pattern from filename - handle both formats  
    extractPattern(filename) {
        // Handle mqtt_simulation_scale_pattern.txt format
        let match = filename.match(/mqtt_simulation_\w+_(.+)\.txt$/);
        if (match) return match[1];
        
        // Handle simulation_scale_pattern.txt format (files in mqtt folder)
        match = filename.match(/simulation_\w+_(.+)\.txt$/);
        return match ? match[1] : 'unknown';
    }

    // Interactive menu for script selection
    async showScriptMenu(scriptDirs) {
        console.log('\n🎯 Available Script Directories:');
        scriptDirs.forEach((dir, index) => {
            const date = new Date(dir.timestamp).toLocaleString();
            console.log(`  ${index + 1}. ${dir.name} (${date})`);
        });
        console.log('  0. Exit');
        
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        return new Promise((resolve) => {
            rl.question('\nSelect directory (number): ', (answer) => {
                rl.close();
                const choice = parseInt(answer);
                if (choice === 0) {
                    console.log('👋 Goodbye!');
                    process.exit(0);
                } else if (choice > 0 && choice <= scriptDirs.length) {
                    resolve(scriptDirs[choice - 1]);
                } else {
                    console.log('❌ Invalid choice. Exiting.');
                    process.exit(1);
                }
            });
        });
    }

    // Interactive menu for MQTT script selection
    async showMQTTScriptMenu(mqttScripts) {
        console.log('\n🚀 Available MQTT Scripts:');
        mqttScripts.forEach((script, index) => {
            console.log(`  ${index + 1}. ${script.name} (${script.scale} scale, ${script.pattern} pattern)`);
        });
        console.log('  0. Run all scripts sequentially');
        console.log('  -1. Back to directory selection');
        
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        return new Promise((resolve) => {
            rl.question('\nSelect script (number): ', (answer) => {
                rl.close();
                const choice = parseInt(answer);
                if (choice === -1) {
                    resolve('back');
                } else if (choice === 0) {
                    resolve('all');
                } else if (choice > 0 && choice <= mqttScripts.length) {
                    resolve(mqttScripts[choice - 1]);
                } else {
                    console.log('❌ Invalid choice. Exiting.');
                    process.exit(1);
                }
            });
        });
    }

    // Run multiple scripts sequentially
 
    async run() {
        try {
            console.log('🎯 MQTT Simulation Runner');
            console.log('==========================');

            // Get base directory from command line or use default
            const baseDir = process.argv[2] || path.join(__dirname, '..', 'simScripts', '01_Generate_Node');
            
            if (!fs.existsSync(baseDir)) {
                console.error(`❌ Base directory not found: ${baseDir}`);
                console.error('Usage: node mqtt-simulator.js [base_directory_path]');
                process.exit(1);
            }

            console.log(`📁 Scanning directory: ${baseDir}`);

            // Find script directories
            const scriptDirs = this.findScriptDirectories(baseDir);
            
            if (scriptDirs.length === 0) {
                console.log('❌ No script directories found (looking for Scripts_* folders)');
                process.exit(1);
            }

            // Interactive directory selection
            const selectedDir = await this.showScriptMenu(scriptDirs);
            console.log(`✅ Selected: ${selectedDir.name}`);

            // Find MQTT scripts in selected directory
            const mqttScripts = this.findMQTTScripts(selectedDir.path);
            
            if (mqttScripts.length === 0) {
                console.log('❌ No MQTT scripts found in selected directory');
                process.exit(1);
            }

            // Interactive script selection
            while (true) {
                const selection = await this.showMQTTScriptMenu(mqttScripts);
                
                if (selection === 'back') {
                    // Restart the whole process
                    return this.run();
                } else if (selection === 'all') {
                    await this.runAllScripts(mqttScripts);
                    break; // Exit after running all scripts
                } else {
                    await this.runSingleScript(selection);
                    // runSingleScript now handles its own exit, so this won't be reached
                    break;
                }
            }

        } catch (error) {
            console.error('❌ Fatal error:', error.message);
            await this.cleanup();
            process.exit(1);
        }
    }

    // Run a single script
    async runSingleScript(script) {
        this.currentSimulation = script;
        console.log(`\n🎬 Starting simulation: ${script.name}`);
        
        // Reset state
        await this.cleanup();
        this.resetState();
        
        // Create simulation-specific log directory
        const simLogDir = path.join(this.MQTT_LOGS_DIR, `sim_${script.scale}_${script.pattern}_${Date.now()}`);
        fs.mkdirSync(simLogDir, { recursive: true });
        
        // Update log paths for this simulation
        this.updateLogPaths(simLogDir);
        
        try {
            // Process the script
            await this.processScript(script.path);
            console.log(`\n✅ Simulation completed: ${script.name}`);
        } catch (error) {
            console.error(`\n❌ Simulation failed: ${script.name}`, error.message);
        }
        
        // Add final cleanup and exit for single script
        await this.cleanup();
        console.log('\n🎉 Simulation process completed!');
        process.exit(0);
    }

    // Update log paths for current simulation
    updateLogPaths(simLogDir) {
        this.BROKER_LOG_PATH = path.join(simLogDir, 'broker.txt');
        this.EVENTS_LOG_PATH = path.join(simLogDir, 'mqtt_client_events.txt');
        this.CLIENT_EVENTS_LOG_PATH = path.join(simLogDir, 'mqtt_client_events_no_broker.txt');
        this.CLIENT_LOGS_DIR = path.join(simLogDir, 'clients');
        fs.mkdirSync(this.CLIENT_LOGS_DIR, { recursive: true });
    }

    // Reset internal state
    resetState() {
        this.clients = {};
        this.pubIdMap.clear();
        this.pubInfoByPubId.clear();
        this.subIdMap.clear();
        this.publishTimestamps.clear();
    }

    // Wait utility
    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    generateId(prefix) {
        return prefix + '-' + Math.random().toString(36).substring(2, 7);
    }

    logVastEvent(eventObj) {
        const line = JSON.stringify(eventObj) + '\n';
        fs.appendFile(this.EVENTS_LOG_PATH, line, err => {
            if (err) console.error('Error writing to events log:', err);
        });
    }

    logClientEvent(eventObj) {
        const line = JSON.stringify(eventObj) + '\n';
        fs.appendFile(this.CLIENT_EVENTS_LOG_PATH, line, err => {
            if (err) console.error('Error writing to client events log:', err);
        });
    }

    logBroker(message) {
        const timestamp = new Date().toISOString();
        const line = `[${timestamp}] ${message}\n`;
        console.log(`[BROKER] ${line.trim()}`);
        fs.appendFile(this.BROKER_LOG_PATH, line, err => {
            if (err) console.error('Error writing to broker log:', err);
        });
        fs.appendFile(this.EVENTS_LOG_PATH, line, err => {
            if (err) console.error('Error writing to events log:', err);
        });
    }

    logClient(clientId, message) {
        const timestamp = new Date().toISOString();
        const line = `[${timestamp}] ${message}\n`;
        console.log(`[CLIENT ${clientId}] ${line.trim()}`);
        if (this.ENABLE_CLIENT_LOGS) {
            const clientLogPath = path.join(this.CLIENT_LOGS_DIR, `client_${clientId}.txt`);
            fs.appendFile(clientLogPath, line, err => {
                if (err) console.error(`Error writing to client ${clientId} log:`, err);
            });
        }
        fs.appendFile(this.EVENTS_LOG_PATH, line, err => {
            if (err) console.error('Error writing to events log:', err);
        });
    }

    async startBroker(port = 1883) {
        this.broker = aedes();
        const BROKER_POS = { x: 500, y: 500 };

        this.broker.on('subscribe', (subscriptions, client) => {
            if (client) {
                subscriptions.forEach(sub => {
                    const subKey = client.id + ':' + sub.topic;
                    let subId = this.subIdMap.get(subKey);
                    if (!subId) {
                        subId = this.generateId('SUB');
                        this.subIdMap.set(subKey, subId);
                    }
                    this.logClientEvent({
                        time: Date.now(),
                        event: Client_Event.SUB_NEW,
                        id: client.id,
                        alias: "unnamed_client",
                        matcher: 1,
                        sub: {
                            hostID: 1,
                            hostPos: BROKER_POS,
                            clientID: client.id,
                            subID: subId,
                            channel: sub.topic,
                            aoi: { center: BROKER_POS, radius: 100 },
                            recipients: [],
                            heartbeat: Date.now()
                        }
                    });
                });
            }
        });

        this.broker.on('unsubscribe', (subscriptions, client) => {
            if (client) {
                subscriptions.forEach(topic => {
                    const subKey = client.id + ':' + topic;
                    const subId = this.subIdMap.get(subKey);
                    if (subId) {
                        this.logClientEvent({
                            time: Date.now(),
                            event: Client_Event.SUB_DELETE,
                            id: client.id,
                            alias: "unnamed_client",
                            matcher: 1,
                            subID: subId
                        });
                        this.subIdMap.delete(subKey);
                    }
                });
            }
        });

        this.brokerServer = net.createServer(this.broker.handle);

        const startServer = (port) => {
            return new Promise((resolve, reject) => {
                this.brokerServer.once('error', (err) => {
                    if (err.code === 'EADDRINUSE') {
                        this.logBroker(`Port ${port} is in use, trying port ${port + 1}`);
                        this.brokerServer.close();
                        resolve(startServer(port + 1));
                    } else {
                        reject(err);
                    }
                });

                this.brokerServer.listen(port, () => {
                    this.logBroker(`Broker started on port ${port}`);
                    resolve(port);
                });
            });
        };

        const actualPort = await startServer(port);
        this.brokerPort = actualPort;
        return { broker: this.broker, server: this.brokerServer, port: actualPort };
    }

    createClient(clientId, host, port, x, y, r) {
        return new Promise((resolve, reject) => {
            const url = `mqtt://${host}:${port}`;
            const client = mqtt.connect(url, { 
                clientId,
                connectTimeout: 30000,
                reconnectPeriod: 0,
                clean: true
            });
            const clientPos = { x, y };

            this.logClientEvent({
                time: Date.now(),
                event: Client_Event.CLIENT_JOIN,
                id: clientId,
                alias: clientId,
                pos: clientPos,
                matcher: 0
            });

            let connected = false;

            client.on('connect', () => {
                connected = true;
                this.logClient(clientId, `Connected successfully to ${url}`);
                this.logClientEvent({
                    time: Date.now(),
                    event: Client_Event.CLIENT_CONNECT,
                    id: clientId,
                    alias: clientId,
                    pos: clientPos,
                    matcher: 0
                });
                this.logClientEvent({
                    time: Date.now(),
                    event: Client_Event.CLIENT_MIGRATE,
                    id: clientId,
                    alias: clientId,
                    pos: clientPos,
                    matcher: 1
                });
                this.clients[clientId] = client;
                resolve(client);
            });

            client.on('error', (err) => {
                this.logClient(clientId, `Connection error: ${err.message}`);
                if (!connected) {
                    reject(err);
                }
            });

            client.on('close', () => {
                this.logClient(clientId, `Connection closed`);
                if (!connected) {
                    reject(new Error('Connection closed before connecting'));
                }
                this.logClientEvent({
                    time: Date.now(),
                    event: Client_Event.CLIENT_LEAVE,
                    id: clientId,
                    alias: "unnamed_client",
                    pos: clientPos,
                    matcher: 1
                });
            });

            // Message handler with latency measurement
            client.on('message', (topic, message) => {
                let pubId = null;
                let cleanMsg = '';
                
                try {
                    // Try JSON parsing first
                    const obj = JSON.parse(message.toString());
                    pubId = obj.pubId;
                    cleanMsg = obj.message;
                    
                } catch (parseError) {
                    // Fallback to regex for backwards compatibility
                    let msgStr = message.toString();
                    const pubIdPattern = / $$pub-id: ([^$$]+)\]$/;
                    const match = msgStr.match(pubIdPattern);
                    if (match) {
                        pubId = match[1];
                        cleanMsg = msgStr.replace(pubIdPattern, '');
                                        } else {
                        // If no pubId found, use the raw message
                        cleanMsg = msgStr;
                    }
                }
                
                // Calculate latency
                const receiveTimestamp = Date.now();
                const publishTimestamp = this.publishTimestamps.get(pubId);
                const latency = publishTimestamp ? receiveTimestamp - publishTimestamp : null;
                
                // Look up publisher info
                let pubInfo = pubId ? this.pubInfoByPubId.get(pubId) : null;
                if (!pubInfo) {
                    // If not found, fallback to receiver's info
                    pubInfo = {
                        clientID: clientId,
                        pubID: pubId,
                        aoi: { center: clientPos, radius: r },
                        message: cleanMsg,
                        topic: topic
                    };
                }
                
                this.logClientEvent({
                    time: receiveTimestamp,
                    event: Client_Event.RECEIVE_PUB,
                    id: clientId,
                    alias: clientId,
                    matcher: 1,
                    pub: {
                        matcherID: 1,
                        clientID: pubInfo.clientID,
                        pubID: pubId,
                        aoi: pubInfo.aoi,
                        payload: pubInfo.message,
                        channel: pubInfo.topic,
                        recipients: [1],
                        chain: [1]
                    },
                    latency: {
                        publish: {
                            timestamp: publishTimestamp,
                            pubid: pubId
                        },
                        receive: {
                            timestamp: receiveTimestamp,
                            pubid: pubId,
                            latency: latency
                        }
                    }
                });
                
                // Clean up publish timestamp after calculating latency
                if (pubId && this.publishTimestamps.has(pubId)) {
                    setTimeout(() => {
                        this.publishTimestamps.delete(pubId);
                    }, 100);
                }
            });

            // Add timeout for connection
            setTimeout(() => {
                if (!connected) {
                    client.end(true);
                    reject(new Error(`Connection timeout after 30 seconds`));
                }
            }, 30000);
        });
    }

    async processScript(scriptPath) {
        try {
            const data = fs.readFileSync(scriptPath, 'utf-8');
            const lines = data.trim().split('\n');
    
            for (let index = 0; index < lines.length; index++) {
                const line = lines[index].trim();
                if (line === '' || line.startsWith('//')) continue;
                
                // Process the line
                const shouldStop = await this.processLine(line, index + 1);
                
                // If processLine returns true, stop processing
                if (shouldStop) {
                    this.logBroker("Script processing stopped at 'end' command");
                    break;
                }
            }
        } catch (err) {
            console.error(`Error reading script: ${err.message}`);
            throw err;
        }
    }

    async processLine(line, lineNumber) {
        const parts = line.trim().split(/\s+/);
        const command = parts[0];

        switch (command) {
            case 'newMatcher': {
                const host = parts[3];
                const port = 1883;
                this.logBroker(`Starting at ${host}:${port}`);
                const { port: actualPort } = await this.startBroker(port);
                this.brokerPort = actualPort;
                break;
            }

            case 'newClient': {
                const clientId = parts[1];
                const clientHost = parts[2];
                const x = parseFloat(parts[4]);
                const y = parseFloat(parts[5]);
                const r = parseFloat(parts[6]);
                this.logClient(clientId, `Creating connection to ${clientHost}:${this.brokerPort}`);
                try {
                    await this.createClient(clientId, clientHost, this.brokerPort, x, y, r);
                } catch (err) {
                    this.logClient(clientId, `Failed to create: ${err.message}`);
                    throw err;
                }
                break;
            }

            case 'wait': {
                const waitTime = parseInt(parts[1]);
                this.logBroker(`Waiting for ${waitTime} ms`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                break;
            }

            case 'subscribe': {
                const subClientId = parts[1];
                const topic = parts[5];
                
                if (this.clients[subClientId]) {
                    this.logClient(subClientId, `Attempting to subscribe to topic: "${topic}"`);
                    
                    if (!topic || topic === '') {
                        this.logClient(subClientId, `ERROR: Empty topic for subscribe command`);
                        break;
                    }
                    
                    const subKey = subClientId + ':' + topic;
                    let subId = this.subIdMap.get(subKey);
                    if (!subId) {
                        subId = this.generateId('SUB');
                        this.subIdMap.set(subKey, subId);
                    }
                    
                    this.clients[subClientId].subscribe(topic, (err, granted) => {
                        if (err) {
                            this.logClient(subClientId, `Failed to subscribe to ${topic}: ${err.message}`);
                        } else {
                            this.logClient(subClientId, `Successfully subscribed to "${topic}" [sub-id: ${subId}]`);
                            if (granted && granted.length > 0) {
                                this.logClient(subClientId, `Subscription to '${topic}' granted with QoS ${granted[0].qos}`);
                            }
                        }
                    });
                } else {
                    this.logBroker(`Client ${subClientId} not found for subscribe`);
                }
                break;
            }

            case 'unsubscribe': {
                const unsubClientId = parts[1];
                const unsubTopic = parts[5];
                if (this.clients[unsubClientId]) {
                    const subKey = unsubClientId + ':' + unsubTopic;
                    const subId = this.subIdMap.get(subKey);
                    if (subId) {
                        this.clients[unsubClientId].unsubscribe(unsubTopic, (err) => {
                            if (err) {
                                this.logClient(unsubClientId, `Failed to unsubscribe from ${unsubTopic}: ${err.message}`);
                            } else {
                                this.logClient(unsubClientId, `Unsubscribing from ${unsubTopic} [sub-id: ${subId}]`);
                            }
                        });
                    } else {
                        this.logClient(unsubClientId, `No subscription found for topic ${unsubTopic}`);
                    }
                } else {
                    this.logBroker(`Client ${unsubClientId} not found for unsubscribe`);
                }
                break;
            }

            case 'publish': {
                const pubClientId = parts[1];
                const pubTopic = parts[5];
                
                // Handle quoted messages properly
                let message = '';
                if (parts.length > 3) {
                    message = parts.slice(5).join(' ');
                    if (message.startsWith('"') && message.endsWith('"')) {
                        message = message.slice(1, -1);
                    }
                }
                
                this.logClient(pubClientId, `Attempting to publish to topic: "${pubTopic}" with message: "${message}"`);
                
                if (!pubTopic || pubTopic === '') {
                    this.logClient(pubClientId, `ERROR: Empty topic for publish command`);
                    break;
                }
                
                // For MQTT, use defaults since we don't have spatial coordinates
                const clientPos = { x: 0, y: 0 };
                const clientRadius = 100;
                const pubAoi = { center: clientPos, radius: clientRadius };

                if (this.clients[pubClientId]) {
                    // Generate a single pubID
                    const pubKey = pubClientId + ':' + pubTopic + ':' + message;
                    let pubId = this.pubIdMap.get(pubKey);
                    if (!pubId) {
                        pubId = this.generateId('PUB');
                        this.pubIdMap.set(pubKey, pubId);
                    }
                    
                    // Store publish timestamp for latency calculation
                    const publishTimestamp = Date.now();
                    this.publishTimestamps.set(pubId, publishTimestamp);
                    
                    // Store reverse mapping for receive log
                    this.pubInfoByPubId.set(pubId, {
                        clientID: pubClientId,
                        topic: pubTopic,
                        message,
                        aoi: pubAoi
                    });
                    
                    // Create JSON payload
                    const payloadObj = {
                        message: message,
                        pubId: pubId
                    };
                    const payloadWithId = JSON.stringify(payloadObj);
                    
                    this.clients[pubClientId].publish(pubTopic, payloadWithId, { qos: 0 }, (err) => {
                        if (err) {
                            this.logClient(pubClientId, `Failed to publish to ${pubTopic}: ${err.message}`);
                        } else {
                            this.logClient(pubClientId, `Successfully published to "${pubTopic}": "${message}" [pub-id: ${pubId}]`);
                            
                            // Log PUB event with publish timestamp
                            this.logClientEvent({
                                time: Date.now(),
                                event: Client_Event.PUB,
                                id: pubClientId,
                                alias: "unnamed_client",
                                matcher: 1,
                                pub: {
                                    pubID: pubId,
                                    aoi: pubAoi,
                                    channel: pubTopic,
                                    payload: message
                                },
                                latency: {
                                    publish: {
                                        timestamp: publishTimestamp,
                                        pubid: pubId
                                    }
                                }
                            });
                        }
                    });
                } else {
                    this.logBroker(`Client ${pubClientId} not found for publish`);
                }
                break;
            }

            case 'end':
                this.logBroker("Simulation ended.");
                return true;

            default:
                this.logBroker(`Unknown command at line ${lineNumber}: ${command}`);
                return false; // Continue processing
        }
        return false; // Continue processing for all other commands
    }

    async cleanup() {
        if (Object.keys(this.clients).length > 0) {
            this.logBroker("Starting cleanup...");
            for (const [clientId, client] of Object.entries(this.clients)) {
                try {
                    await new Promise((resolve) => {
                        client.end(true, () => {
                            this.logClient(clientId, 'Disconnected');
                            resolve();
                        });
                    });
                } catch (err) {
                    this.logBroker(`Error disconnecting client ${clientId}: ${err.message}`);
                }
            }
        }
        
        if (this.brokerServer) {
            await new Promise((resolve) => {
                this.brokerServer.close(() => {
                    this.logBroker("Broker stopped");
                    resolve();
                });
            });
            this.brokerServer = null;
        }
        
        if (this.broker) {
            this.broker.close();
            this.broker = null;
        }
        
        this.logBroker("Cleanup completed");
    }
}

// Create and run the simulator
const simulator = new MQTTSimulator();
simulator.run().catch(console.error);

// Handle cleanup on exit
process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, cleaning up...');
    await simulator.cleanup();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, cleaning up...');
    await simulator.cleanup();
    process.exit(0);
});

process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});