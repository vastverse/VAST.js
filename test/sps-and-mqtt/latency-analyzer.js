const fs = require('fs');
const path = require('path');

class LatencyAnalyzer {
    constructor() {
        this.baseLogsDir = path.join(__dirname, 'logs');
        this.results = new Map();
    }

    // Find all log directories dynamically
    findLogDirectories() {
        const logDirs = [];
        
        try {
            if (!fs.existsSync(this.baseLogsDir)) {
                console.log(`❌ Logs directory not found: ${this.baseLogsDir}`);
                return logDirs;
            }

            const items = fs.readdirSync(this.baseLogsDir);
            
            for (const item of items) {
                const itemPath = path.join(this.baseLogsDir, item);
                const stat = fs.statSync(itemPath);
                
                if (stat.isDirectory()) {
                    // Look for event files in this directory
                    const eventFiles = this.findEventFiles(itemPath);
                    if (eventFiles.length > 0) {
                        logDirs.push({
                            name: item,
                            path: itemPath,
                            eventFiles: eventFiles
                        });
                    }
                }
            }
            
        } catch (error) {
            console.error(`Error scanning logs directory:`, error.message);
        }
        
        return logDirs;
    }

    // Find event files in a directory
    findEventFiles(dirPath) {
        const eventFiles = [];
        
        try {
            const files = fs.readdirSync(dirPath);
            
            // Look for common event file patterns
            const patterns = [
                /.*client_events.*\.txt$/,
                /.*Simulator_logs\.txt$/,
                /.*mqtt_client_events_no_broker\.txt$/,
                /.*sps_events\.txt$/,
                /.*events\.txt$/
            ];
            
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const stat = fs.statSync(filePath);
                
                if (stat.isFile()) {
                    // Check if file matches any pattern
                    if (patterns.some(pattern => pattern.test(file))) {
                        eventFiles.push({
                            name: file,
                            path: filePath,
                            size: stat.size,
                            modified: stat.mtime
                        });
                    }
                }
            }
            
            // Also check subdirectories for simulation-specific logs
            for (const item of files) {
                const itemPath = path.join(dirPath, item);
                const stat = fs.statSync(itemPath);
                
                if (stat.isDirectory() && item.startsWith('sim_')) {
                    const subFiles = this.findEventFiles(itemPath);
                    eventFiles.push(...subFiles.map(f => ({
                        ...f,
                        simulation: item
                    })));
                }
            }
            
        } catch (error) {
            console.error(`Error reading directory ${dirPath}:`, error.message);
        }
        
        return eventFiles;
    }

    // Enhanced latency analysis with more detailed metrics
    analyzeLatency(filePath) {
        if (!fs.existsSync(filePath)) {
            console.log(`❌ File not found: ${filePath}`);
            return {
                latencies: [],
                publishes: {},
                channels: new Set(),
                clients: new Set(),
                errors: []
            };
        }

        console.log(`📊 Analyzing: ${path.basename(filePath)}`);
        
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(Boolean);
        const publishes = {};
        const latencies = [];
        const channels = new Set();
        const clients = new Set();
        const errors = [];

        let lineCount = 0;
        for (const line of lines) {
            lineCount++;
            let event;
            try {
                event = JSON.parse(line);
            } catch (e) {
                errors.push(`Line ${lineCount}: Invalid JSON`);
                continue;
            }

            // Track clients and channels
            if (event.id) clients.add(event.id);
            if (event.pub && event.pub.channel) channels.add(event.pub.channel);

            if (event.event === 9 && event.pub && event.pub.pubID) {
                // Publish event
                publishes[event.pub.pubID] = {
                    time: event.time,
                    client: event.id,
                    channel: event.pub.channel || 'unknown',
                    payload: event.pub.payload || '',
                    aoi: event.pub.aoi
                };
            } else if (event.event === 10 && event.pub && event.pub.pubID) {
                // Receive event
                const pubID = event.pub.pubID;
                if (publishes[pubID]) {
                    const latency = event.time - publishes[pubID].time;
                    latencies.push({
                        pubID: pubID,
                        publishClient: publishes[pubID].client,
                        receiveClient: event.id,
                        channel: event.pub.channel || publishes[pubID].channel,
                        latency: latency,
                        publishTime: publishes[pubID].time,
                        receiveTime: event.time,
                        payload: publishes[pubID].payload,
                        rtt: event.pingpong?.pong?.rtt || null
                    });
                } else {
                    errors.push(`Receive event for unknown pubID: ${pubID}`);
                }
            }
        }

        return {
            latencies,
            publishes,
            channels,
            clients,
            errors,
            totalLines: lineCount,
            validEvents: lineCount - errors.length
        };
    }

    // Calculate comprehensive statistics
    calculateStats(latencies) {
        if (latencies.length === 0) return null;

        const latencyValues = latencies.map(e => e.latency);
        const sorted = [...latencyValues].sort((a, b) => a - b);
        
        const sum = latencyValues.reduce((a, b) => a + b, 0);
        const mean = sum / latencies.length;
        
        // Calculate variance and standard deviation
        const variance = latencyValues.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / latencies.length;
        const stdDev = Math.sqrt(variance);
        
        // Percentiles
        const percentile = (p) => {
            const index = Math.ceil((p / 100) * sorted.length) - 1;
            return sorted[Math.max(0, index)];
        };

        return {
            count: latencies.length,
            mean: mean,
            median: percentile(50),
            min: Math.min(...latencyValues),
            max: Math.max(...latencyValues),
            stdDev: stdDev,
            p95: percentile(95),
            p99: percentile(99),
            p999: percentile(99.9)
        };
    }

    // Analyze by channel
    analyzeByChannel(latencies) {
        const channelStats = {};
        
        for (const latency of latencies) {
            const channel = latency.channel;
            if (!channelStats[channel]) {
                channelStats[channel] = [];
            }
            channelStats[channel].push(latency);
        }
        
        const results = {};
        for (const [channel, channelLatencies] of Object.entries(channelStats)) {
            results[channel] = this.calculateStats(channelLatencies);
        }
        
        return results;
    }

    // Print detailed statistics
    printDetailedStats(analysis, systemName) {
        console.log(`\n📈 ${systemName} Analysis Results`);
        console.log('='.repeat(50));
        
        if (analysis.errors.length > 0) {
            console.log(`\n⚠️  Errors found: ${analysis.errors.length}`);
            analysis.errors.slice(0, 5).forEach(err => console.log(`   ${err}`));
            if (analysis.errors.length > 5) {
                console.log(`   ... and ${analysis.errors.length - 5} more errors`);
            }
        }
        
        console.log(`\n📊 File Statistics:`);
        console.log(`   Total lines: ${analysis.totalLines}`);
        console.log(`   Valid events: ${analysis.validEvents}`);
        console.log(`   Unique clients: ${analysis.clients.size}`);
        console.log(`   Unique channels: ${analysis.channels.size}`);
        console.log(`   Unmatched publishes: ${Object.keys(analysis.publishes).length}`);

        if (analysis.latencies.length === 0) {
            console.log(`\n❌ No latency data found`);
            return;
        }

        const stats = this.calculateStats(analysis.latencies);
        
        console.log(`\n🚀 Overall Latency Statistics:`);
        console.log(`   Messages delivered: ${stats.count}`);
        console.log(`   Mean latency: ${stats.mean.toFixed(2)}ms`);
        console.log(`   Median latency: ${stats.median.toFixed(2)}ms`);
        console.log(`   Min latency: ${stats.min}ms`);
        console.log(`   Max latency: ${stats.max}ms`);
        console.log(`   Std deviation: ${stats.stdDev.toFixed(2)}ms`);
        console.log(`   95th percentile: ${stats.p95.toFixed(2)}ms`);
        console.log(`   99th percentile: ${stats.p99.toFixed(2)}ms`);
        console.log(`   99.9th percentile: ${stats.p999.toFixed(2)}ms`);

        // Channel-specific analysis
        const channelStats = this.analyzeByChannel(analysis.latencies);
        if (Object.keys(channelStats).length > 1) {
            console.log(`\n📡 Per-Channel Statistics:`);
            for (const [channel, channelStat] of Object.entries(channelStats)) {
                if (channelStat) {
                    console.log(`   ${channel}:`);
                    console.log(`     Messages: ${channelStat.count}`);
                    console.log(`     Mean: ${channelStat.mean.toFixed(2)}ms`);
                    console.log(`     P95: ${channelStat.p95.toFixed(2)}ms`);
                }
            }
        }

        // Show RTT data if available
        const rttData = analysis.latencies.filter(l => l.rtt !== null);
        if (rttData.length > 0) {
            const rttValues = rttData.map(l => l.rtt);
            const avgRtt = rttValues.reduce((a, b) => a + b, 0) / rttValues.length;
            console.log(`\n🏓 RTT Statistics (${rttData.length} samples):`);
            console.log(`   Average RTT: ${avgRtt.toFixed(2)}ms`);
            console.log(`   Min RTT: ${Math.min(...rttValues)}ms`);
            console.log(`   Max RTT: ${Math.max(...rttValues)}ms`);
        }

        // Show sample of detailed latencies
        console.log(`\n🔍 Sample Latencies (first 10):`);
        analysis.latencies.slice(0, 10).forEach((e, i) => {
            const rttInfo = e.rtt ? ` (RTT: ${e.rtt}ms)` : '';
            console.log(`   ${i + 1}. ${e.publishClient} → ${e.receiveClient} [${e.channel}]: ${e.latency}ms${rttInfo}`);
        });
        
        if (analysis.latencies.length > 10) {
            console.log(`   ... and ${analysis.latencies.length - 10} more messages`);
        }
    }

    // Generate comparison report
    generateComparison() {
        if (this.results.size < 2) {
            console.log('\n📊 Comparison Report: Need at least 2 systems to compare');
            return;
        }

        console.log('\n📊 System Comparison Report');
        console.log('='.repeat(60));

        const systems = Array.from(this.results.entries()).map(([name, analysis]) => ({
            name,
            stats: this.calculateStats(analysis.latencies)
        })).filter(s => s.stats);

        if (systems.length === 0) {
            console.log('No systems with valid latency data to compare');
            return;
        }

        // Create comparison table
        console.log('\nMetric'.padEnd(20) + systems.map(s => s.name.padStart(15)).join(''));
        console.log('-'.repeat(20 + systems.length * 15));
        
        const metrics = [
            ['Messages', s => s.count.toString()],
            ['Mean (ms)', s => s.mean.toFixed(2)],
            ['Median (ms)', s => s.median.toFixed(2)],
            ['Min (ms)', s => s.min.toString()],
            ['Max (ms)', s => s.max.toString()],
            ['P95 (ms)', s => s.p95.toFixed(2)],
            ['P99 (ms)', s => s.p99.toFixed(2)],
            ['Std Dev (ms)', s => s.stdDev.toFixed(2)]
        ];

        for (const [label, getValue] of metrics) {
            const row = label.padEnd(20) + systems.map(s => getValue(s.stats).padStart(15)).join('');
            console.log(row);
        }

        // Find best performing system for each metric
        console.log('\n🏆 Best Performance:');
        const bestMean = systems.reduce((best, curr) => curr.stats.mean < best.stats.mean ? curr : best);
        const bestP95 = systems.reduce((best, curr) => curr.stats.p95 < best.stats.p95 ? curr : best);
        console.log(`   Lowest mean latency: ${bestMean.name} (${bestMean.stats.mean.toFixed(2)}ms)`);
        console.log(`   Lowest P95 latency: ${bestP95.name} (${bestP95.stats.p95.toFixed(2)}ms)`);
    }

    // Export results to CSV
    exportToCSV(outputPath = 'latency_analysis.csv') {
        const csvRows = ['System,Messages,Mean(ms),Median(ms),Min(ms),Max(ms),P95(ms),P99(ms),StdDev(ms)'];
        
        for (const [systemName, analysis] of this.results.entries()) {
            const stats = this.calculateStats(analysis.latencies);
            if (stats) {
                csvRows.push([
                    systemName,
                    stats.count,
                    stats.mean.toFixed(2),
                    stats.median.toFixed(2),
                    stats.min,
                    stats.max,
                    stats.p95.toFixed(2),
                    stats.p99.toFixed(2),
                    stats.stdDev.toFixed(2)
                ].join(','));
            }
        }
        
        fs.writeFileSync(outputPath, csvRows.join('\n'));
        console.log(`\n💾 Results exported to: ${outputPath}`);
    }

    // Main analysis runner
    async run() {
        console.log('🔍 Latency Analysis Tool');
        console.log('========================');

        // Find all log directories
        const logDirs = this.findLogDirectories();
        
        if (logDirs.length === 0) {
            console.log('❌ No log directories with event files found');
            return;
        }

        console.log(`\n📁 Found ${logDirs.length} log directories with event files:`);
        logDirs.forEach(dir => {
            console.log(`   ${dir.name} (${dir.eventFiles.length} event files)`);
        });

        // Process all found event files
        for (const logDir of logDirs) {
            for (const eventFile of logDir.eventFiles) {
                const systemName = eventFile.simulation ? 
                    `${logDir.name}_${eventFile.simulation}` : 
                    `${logDir.name}_${path.basename(eventFile.name, '.txt')}`;
                
                const analysis = this.analyzeLatency(eventFile.path);
                this.results.set(systemName, analysis);
                this.printDetailedStats(analysis, systemName);
            }
        }

        // Generate comparison and export
        this.generateComparison();
        this.exportToCSV();
    }
}

// Run the analyzer
const analyzer = new LatencyAnalyzer();
analyzer.run().catch(console.error);