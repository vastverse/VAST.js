const fs = require('fs');
const path = require('path');

class SimulationAnalyzer {
    constructor(scriptsFolderPath) {
        this.scriptsFolderPath = scriptsFolderPath;
        this.newClientRegex = /^newClient\s+(\S+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/;
        this.newMatcherRegex = /^newMatcher\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/;
        this.subscribeRegex = /^subscribe\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)/;
        this.publishRegex = /^publish\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+"([^"]*)"/;
        
        // Data structures
        this.clients = new Map(); // client -> {x, y, r, host, port}
        this.matcher = null;
        this.subscribes = [];
        this.publishes = [];
        this.subscribersByChannel = {};
        this.deliveriesByChannel = {};
        this.publishesByChannel = {};
    }

    analyzeSimulationFiles() {
        const spsPath = path.join(this.scriptsFolderPath, 'sps');
        const mqttPath = path.join(this.scriptsFolderPath, 'mqtt');
        
        if (!fs.existsSync(spsPath)) {
            console.error('❌ sps subfolder not found. Expected structure:');
            console.error('  Scripts_folder/');
            console.error('  ├── sps/');
            console.error('  ├── spmqtt/');
            console.error('  └── mqtt/');
            return;
        }

        // Create mqtt folder if it doesn't exist
        if (!fs.existsSync(mqttPath)) {
            fs.mkdirSync(mqttPath, { recursive: true });
            console.log('📁 Created mqtt subfolder');
        }

        console.log('📁 Processing sps folder and generating mqtt versions...');
        this.processFolder(spsPath, mqttPath);
    }

    processFolder(inputFolder, outputFolder) {
        const files = fs.readdirSync(inputFolder);
        const simulationFiles = files.filter(file => 
            file.startsWith('simulation_') && !file.includes('mqtt') && file.endsWith('.txt'));

        if (simulationFiles.length === 0) {
            console.log('⚠️  No simulation files found to process');
            return;
        }

        simulationFiles.forEach(file => {
            console.log(`\n🔍 Analyzing ${file}...`);
            this.analyzeFile(path.join(inputFolder, file));
            this.generateMQTTScript(file, outputFolder);
        });
    }

    analyzeFile(filePath) {
        this.clearDataStructures();
        const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('#') || trimmedLine === 'end' || trimmedLine.startsWith('wait')) {
                continue;
            }

            // Parse newMatcher
            let match = this.newMatcherRegex.exec(trimmedLine);
            if (match) {
                const [, name, distributed, host, port1, port2, port3, x, y, r] = match;
                this.matcher = { name, distributed: distributed === 'true', host, port1: +port1, port2: +port2, port3: +port3, x: +x, y: +y, r: +r };
                continue;
            }

            // Parse newClient
            match = this.newClientRegex.exec(trimmedLine);
            if (match) {
                const [, client, host, port, x, y, r] = match;
                this.clients.set(client, { host, port: +port, x: +x, y: +y, r: +r });
                continue;
            }

            // Parse subscribe
            match = this.subscribeRegex.exec(trimmedLine);
            if (match) {
                const [, client, x, y, r, channel] = match;
                this.processSubscribe(client, +x, +y, +r, channel);
                continue;
            }

            // Parse publish
            match = this.publishRegex.exec(trimmedLine);
            if (match) {
                const [, client, x, y, r, channel, message] = match;
                this.processPublish(client, +x, +y, +r, channel, message);
                continue;
            }
        }

        this.calculateDeliveries();
    }

    clearDataStructures() {
        this.clients.clear();
        this.matcher = null;
        this.subscribes = [];
        this.publishes = [];
        this.subscribersByChannel = {};
        this.deliveriesByChannel = {};
        this.publishesByChannel = {};
    }

    processSubscribe(client, x, y, r, channel) {
        this.subscribes.push({ client, x, y, r, channel });
        if (!this.subscribersByChannel[channel]) {
            this.subscribersByChannel[channel] = new Set();
        }
        this.subscribersByChannel[channel].add(client);
    }

    processPublish(client, x, y, r, channel, message) {
        const pubObj = { client, x, y, r, channel, message };
        this.publishes.push(pubObj);
        if (!this.publishesByChannel[channel]) {
            this.publishesByChannel[channel] = [];
        }
        this.publishesByChannel[channel].push(pubObj);
    }

    circlesOverlap(x1, y1, r1, x2, y2, r2) {
        const dx = x1 - x2;
        const dy = y1 - y2;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist <= (r1 + r2);
    }

    calculateDeliveries() {
        // Initialize all channels to 0
        for (const channel in this.subscribersByChannel) {
            this.deliveriesByChannel[channel] = 0;
        }

        // Calculate overlapping deliveries
        for (const pub of this.publishes) {
            for (const sub of this.subscribes) {
                if (pub.channel === sub.channel) {
                    if (this.circlesOverlap(pub.x, pub.y, pub.r, sub.x, sub.y, sub.r)) {
                        this.deliveriesByChannel[pub.channel]++;
                    }
                }
            }
        }
    }

    generateMQTTScript(originalFileName, outputFolder) {
        const output = [];
        output.push('// MQTT Simulation Script (auto-generated)');
        output.push(`// Generated from ${originalFileName}`);
        output.push('// Uses MQTT topic-based pub/sub instead of spatial pub/sub');
        output.push('');

        // Add matcher if it exists in original script
        if (this.matcher) {
            const { name, distributed, host, port1, port2, port3, x, y, r } = this.matcher;
            output.push(`newMatcher ${name} ${distributed} ${host} ${port1} ${port2} ${port3} ${x} ${y} ${r}`);
            output.push('wait 100');
            output.push('');
        }

        // Add all clients using their original coordinates
        for (const [client, clientData] of this.clients) {
            const { host, port, x, y, r } = clientData;
            output.push(`newClient ${client} ${host} ${port} ${x} ${y} ${r}`);
            output.push('wait 100');
        }
        
        // Add big delay after all clients are created (matching the original pattern)
        output.push('wait 10000');
        output.push('');

        // Add MQTT topic subscriptions (no coordinates needed for MQTT)
        for (const sub of this.subscribes) {
            output.push(`subscribe ${sub.client} ${sub.channel}`);
            output.push('wait 100');
        }
        output.push('');

        // Generate MQTT publications
        output.push('wait 500');
        
        // Group publishes by channel and generate MQTT equivalent
        const processedChannels = new Set();
        
        for (const pub of this.publishes) {
            if (!processedChannels.has(pub.channel)) {
                processedChannels.add(pub.channel);
                
                const subscribers = Array.from(this.subscribersByChannel[pub.channel] || []);
                const expectedDeliveries = this.deliveriesByChannel[pub.channel];
                const channelPubs = this.publishesByChannel[pub.channel] || [];
                
                output.push(`// Channel: ${pub.channel} - Expected deliveries: ${expectedDeliveries} (${subscribers.length} subscribers)`);
                
                // In MQTT, each publish goes to ALL subscribers of that topic
                // So we need fewer publishes to achieve the same delivery count
                if (subscribers.length > 0) {
                    const mqttPublishCount = Math.ceil(expectedDeliveries / subscribers.length);
                    
                    for (let i = 0; i < mqttPublishCount; i++) {
                        const originalPub = channelPubs[i % channelPubs.length];
                        output.push(`publish ${originalPub.client} ${pub.channel} "${originalPub.message}"`);
                        output.push('wait 100');
                    }
                } else {
                    // If no subscribers, still include the original publish for completeness
                    for (const originalPub of channelPubs) {
                        output.push(`publish ${originalPub.client} ${originalPub.channel} "${originalPub.message}"`);
                        output.push('wait 100');
                    }
                }
                output.push('');
            }
        }

        output.push('wait 1000');
        output.push('end');

        // Save to mqtt subfolder with same filename as original
        const outputPath = path.join(outputFolder, originalFileName);
        
        fs.writeFileSync(outputPath, output.join('\n'), 'utf-8');
        
        console.log(`✅ Generated MQTT version: ${originalFileName}`);
        this.printAnalysisResults();
    }

    printAnalysisResults() {
        console.log('📊 Analysis Results:');
        console.log(`   Clients: ${this.clients.size}, Subscribes: ${this.subscribes.length}, Publishes: ${this.publishes.length}`);
        
        console.log('📈 Channel Statistics:');
        for (const channel in this.deliveriesByChannel) {
            const subscribers = this.subscribersByChannel[channel]?.size || 0;
            const publishers = this.publishesByChannel[channel]?.length || 0;
            const deliveries = this.deliveriesByChannel[channel];
            console.log(`   ${channel}: ${subscribers} subs, ${publishers} pubs, ${deliveries} deliveries`);
        }
    }
}

// Usage
function main() {
    const scriptsDir = process.argv[2];
    if (!scriptsDir) {
        console.error('❌ Please provide the scripts directory path');
        console.error('Usage: node mqtt_generator.js <scripts_directory_path>');
        console.error('Example: node mqtt_generator.js "./Scripts_2024-01-15_14-30-25"');
        return;
    }

    if (!fs.existsSync(scriptsDir)) {
        console.error(`❌ Directory not found: ${scriptsDir}`);
        return;
    }

    console.log(`🔍 Generating MQTT versions for scripts in: ${scriptsDir}`);
    console.log('📁 Expected folder structure:');
    console.log('   Scripts_folder/');
    console.log('   ├── sps/');
    console.log('   ├── spmqtt/');
    console.log('   └── mqtt/ (will be created)');
    
    const analyzer = new SimulationAnalyzer(scriptsDir);
    analyzer.analyzeSimulationFiles();
    console.log('\n✅ MQTT generation complete!');
}

main();