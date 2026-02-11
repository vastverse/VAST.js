// performanceEvaluator.js - Multi-file version
const fs = require('fs');
const readline = require('readline');
const path = require('path');

// =====================================================
// CONFIG LOADING
// =====================================================

// At the top of evaluate.js, replace the CONFIG_FILE loading:

const { generateConfig } = require('./find_latest_logs.js');

// Generate config dynamically
const generatedConfig = generateConfig();
const CONFIG_FILE = process.argv[2];

function loadConfig(configFile) {
    try {
        // If no config file specified, use generated one
        const content = configFile ? 
            fs.readFileSync(configFile, 'utf8') : 
            generatedConfig;
        
        const lines = content.split('\n');
        
        const configs = [];
        
        lines.forEach(line => {
            line = line.trim();
            // Skip empty lines and comments
            if (!line || line.startsWith('#')) return;
            
            const [label, filePath] = line.split('|').map(s => s.trim());
            
            if (!label || !filePath) {
                console.warn(`Invalid config line: ${line}`);
                return;
            }
            
            // Check if file exists
            if (!fs.existsSync(filePath)) {
                console.warn(`File not found, skipping: ${filePath}`);
                return;
            }
            
            configs.push({ label, filePath });
        });
        
        if (configs.length === 0) {
            console.error('No valid configuration entries found!');
            process.exit(1);
        }
        
        return configs;
    } catch (e) {
        console.error(`Error reading config file: ${e.message}`);
        process.exit(1);
    }
}

// =====================================================
// LOGGING SETUP
// =====================================================

const LOG_DIR = './evaluator_logs';
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const LOG_FILE = `${LOG_DIR}/evaluation_${TIMESTAMP}.log`;

function logToFile(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    fs.appendFileSync(LOG_FILE, logMessage + '\n');
    console.log(logMessage);
}

function logSeparator() {
    const separator = '═'.repeat(60);
    logToFile(separator);
}

// =====================================================
// LOAD CONFIGURATIONS
// =====================================================

logToFile('Performance Evaluator Started');
logToFile(`Config File: ${CONFIG_FILE}`);
logToFile('');

const configs = loadConfig(CONFIG_FILE);
logToFile(`Loaded ${configs.length} evaluation configurations:`);
configs.forEach(cfg => logToFile(`  - ${cfg.label}: ${cfg.filePath}`));
logToFile('');

// =====================================================
// PROCESS EACH FILE
// =====================================================

const allResults = {};

function processFile(label, filePath) {
    return new Promise((resolve) => {
        logToFile(`Processing: ${label} (${filePath})`);
        
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        var events = [];
        var fileProcessingStart = Date.now();

        rl.on('line', (line) => {
            try {
                events.push(JSON.parse(line));
            } catch (e) {
                logToFile(`ERROR [${label}]: Failed to parse line`);
            }
        });

        rl.on('close', () => {
            var fileProcessingEnd = Date.now();
            logToFile(`  Finished reading (${fileProcessingEnd - fileProcessingStart}ms) - ${events.length} events`);

            // Sort events by time
            function compare(a, b) {
                var result = a.time - b.time;
                if (result === 0) {
                    result = a.event - b.event;
                }
                return result;
            }

            var sortedEvents = events.slice().sort(compare);

            // DATA COLLECTION
            var publications = {};
            var subscriptions = {};
            var receipts = [];
            var pubTimestamps = {};

            var pubCount = 0;
            var subCount = 0;

            for (var idx in sortedEvents) {
                var event = sortedEvents[idx];

                if (event.event === 6) { // SUB_NEW
                    var sub = event.sub;
                    subscriptions[sub.subID] = {
                        subID: sub.subID,
                        clientID: sub.clientID,
                        channel: sub.channel,
                        aoi: sub.aoi,
                        createdAt: event.time
                    };
                    subCount++;
                }

                if (event.event === 9) { // PUB
                    var pubID = event.pub.pubID;
                    pubTimestamps[pubID] = event.time;
                    
                    publications[pubID] = {
                        pubID: pubID,
                        publishTime: event.time,
                        clientID: event.id,
                        channel: event.pub.channel,
                        aoi: event.pub.aoi,
                        expectedRecipients: [],
                        actualRecipients: [],
                        receipts: []
                    };
                    pubCount++;
                }

                if (event.event === 10) { // RECEIVE_PUB
                    var receiptEntry = {
                        pubID: event.pub.pubID,
                        clientID: event.id,
                        receiveTime: event.time,
                        publishTime: event.pub.time || pubTimestamps[event.pub.pubID]
                    };
                    
                    if (receiptEntry.publishTime) {
                        receiptEntry.latency = receiptEntry.receiveTime - receiptEntry.publishTime;
                    }
                    
                    receipts.push(receiptEntry);
                }
            }

            // Calculate expected recipients
            var matchCount = 0;
            for (var pubID in publications) {
                var pub = publications[pubID];
                
                for (var subID in subscriptions) {
                    var sub = subscriptions[subID];
                    
                    if (sub.channel !== pub.channel) continue;
                    if (!compareAoI(pub.aoi, sub.aoi)) continue;
                    
                    pub.expectedRecipients.push(sub.clientID);
                    matchCount++;
                }
            }

            // Match receipts to publications
            var receiptsMatched = 0;
            for (var idx in receipts) {
                var receipt = receipts[idx];
                if (publications[receipt.pubID]) {
                    publications[receipt.pubID].actualRecipients.push(receipt.clientID);
                    publications[receipt.pubID].receipts.push(receipt);
                    receiptsMatched++;
                }
            }

            // CALCULATE METRICS
            var totalExpected = 0;
            var totalReceived = 0;
            var latencies = [];
            var duplicateCount = 0;
            var duplicateReceiptCount = 0;
            var undeliveredPubs = [];

            for (var pubID in publications) {
                var pub = publications[pubID];
                var expected = pub.expectedRecipients.length;
                var actual = pub.actualRecipients.length;

                totalExpected += expected;
                totalReceived += actual;

                var uniqueRecipients = new Set(pub.actualRecipients);
                var duplicates = actual - uniqueRecipients.size;
                duplicateCount += duplicates;
                duplicateReceiptCount += actual - uniqueRecipients.size;

                if (expected > 0 && actual === 0) {
                    undeliveredPubs.push({
                        pubID: pubID,
                        channel: pub.channel,
                        expectedCount: expected,
                        publisher: pub.clientID
                    });
                }

                for (var i = 0; i < pub.receipts.length; i++) {
                    if (pub.receipts[i].latency !== undefined) {
                        latencies.push({
                            pubID: pubID,
                            clientID: pub.receipts[i].clientID,
                            latency: pub.receipts[i].latency
                        });
                    }
                }
            }

            var deliveryRate = totalExpected > 0 
                ? ((totalReceived / totalExpected) * 100).toFixed(2) 
                : 0;

            var latencyStats = {};
            if (latencies.length > 0) {
                var latencyValues = latencies.map(l => l.latency);
                latencyStats = {
                    avg: (latencyValues.reduce((a, b) => a + b, 0) / latencyValues.length).toFixed(2),
                    min: Math.min(...latencyValues).toFixed(2),
                    max: Math.max(...latencyValues).toFixed(2),
                    values: latencyValues
                };
            }

            allResults[label] = {
                label: label,
                filePath: filePath,
                deliveryRate: parseFloat(deliveryRate),
                totalExpected: totalExpected,
                totalReceived: totalReceived,
                undeliveredCount: undeliveredPubs.length,
                duplicateCount: duplicateReceiptCount,
                latencies: latencies,
                latencyStats: latencyStats,
                publications: publications,
                channelStats: calculateChannelStats(publications, undeliveredPubs)
            };

            resolve();
        });
    });
}

function calculateChannelStats(publications, undeliveredPubs) {
    var stats = {};
    for (var pubID in publications) {
        var pub = publications[pubID];
        if (!stats[pub.channel]) {
            stats[pub.channel] = {
                published: 0,
                expected: 0,
                received: 0,
                undelivered: 0
            };
        }
        stats[pub.channel].published++;
        stats[pub.channel].expected += pub.expectedRecipients.length;
        stats[pub.channel].received += pub.actualRecipients.length;
    }
    
    undeliveredPubs.forEach(pub => {
        if (stats[pub.channel]) {
            stats[pub.channel].undelivered++;
        }
    });
    
    return stats;
}

// =====================================================
// PROCESS ALL FILES SEQUENTIALLY
// =====================================================

async function processAllFiles() {
    for (const config of configs) {
        await processFile(config.label, config.filePath);
    }
    
    logToFile('');
    logSeparator();
    logToFile('ALL EVALUATIONS COMPLETED');
    logSeparator();
    logToFile('');
    
    // Print summary
    for (const [label, result] of Object.entries(allResults)) {
        logToFile(`${label}:`);
        logToFile(`  Delivery Rate: ${result.deliveryRate}%`);
        logToFile(`  Latency (avg): ${result.latencyStats.avg || 'N/A'}ms`);
        logToFile(`  Undelivered: ${result.undeliveredCount}`);
        logToFile('');
    }
    
    logToFile(`Log saved to: ${LOG_FILE}`);
    
    // Generate HTML report with tabs
    generateHTMLReportWithTabs(allResults);
}

processAllFiles();

// =====================================================
// HTML REPORT WITH TABS
// =====================================================
function generateHTMLReportWithTabs(allResults) {
    // Sanitize keys to be valid JavaScript identifiers
    const sanitizeKey = (key) => key.replace(/[^a-zA-Z0-9_]/g, '_');
    
    const tabsHTML = Object.entries(allResults).map(([key, result], index) => {
        const sanitized = sanitizeKey(key);
        return `
        <button class="tablinks" onclick="window.openTab(event, '${sanitized}')" ${index === 0 ? 'id="defaultOpen"' : ''}>
            ${result.label}
        </button>
        `;
    }).join('');

    const tabContentsHTML = Object.entries(allResults).map(([key, result]) => {
        const sanitized = sanitizeKey(key);
        const deliveryRate = result.deliveryRate;
        const latencyStats = result.latencyStats;
        
        const latencyBuckets = {
            '0-10ms': 0,
            '10-50ms': 0,
            '50-100ms': 0,
            '100-500ms': 0,
            '500ms+': 0
        };
        
        if (latencyStats.values) {
            latencyStats.values.forEach(lat => {
                if (lat <= 10) latencyBuckets['0-10ms']++;
                else if (lat <= 50) latencyBuckets['10-50ms']++;
                else if (lat <= 100) latencyBuckets['50-100ms']++;
                else if (lat <= 500) latencyBuckets['100-500ms']++;
                else latencyBuckets['500ms+']++;
            });
        }

        const totalPubs = Object.keys(result.publications).length;
        const deliveredPubs = totalPubs - result.undeliveredCount;

        return `
        <div id="${sanitized}" class="tabcontent">
            <h2>${result.label} Results</h2>
            
            <section class="metrics-grid">
                <div class="metric-card ${deliveryRate >= 95 ? 'success' : 'danger'}">
                    <div class="metric-label">Delivery Rate</div>
                    <div class="metric-value">${deliveryRate}<span class="metric-unit">%</span></div>
                    <div class="metric-description">${deliveryRate >= 95 ? '✓ Excellent' : '✗ Below threshold'}</div>
                </div>
                
                <div class="metric-card">
                    <div class="metric-label">Average Latency</div>
                    <div class="metric-value">${latencyStats.avg || 'N/A'}<span class="metric-unit">ms</span></div>
                    <div class="metric-description">Mean delivery time</div>
                </div>
                
                <div class="metric-card">
                    <div class="metric-label">Latency Range</div>
                    <div class="metric-value">${latencyStats.min || 'N/A'}-${latencyStats.max || 'N/A'}<span class="metric-unit">ms</span></div>
                </div>
                
                <div class="metric-card ${result.undeliveredCount === 0 ? 'success' : 'danger'}">
                    <div class="metric-label">Undelivered</div>
                    <div class="metric-value">${result.undeliveredCount}</div>
                </div>
                
                <div class="metric-card ${result.duplicateCount === 0 ? 'success' : 'warning'}">
                    <div class="metric-label">Duplicates</div>
                    <div class="metric-value">${result.duplicateCount}</div>
                </div>
                
                <div class="metric-card">
                    <div class="metric-label">Total Pubs</div>
                    <div class="metric-value">${totalPubs}</div>
                    <div class="metric-description">${deliveredPubs} delivered</div>
                </div>
            </section>
            
            <section class="charts-section">
                <div class="chart-container">
                    <h3>Delivery Status</h3>
                    <canvas id="deliveryChart_${sanitized}"></canvas>
                </div>
                
                <div class="chart-container">
                    <h3>Latency Distribution</h3>
                    <canvas id="latencyChart_${sanitized}"></canvas>
                </div>
                
                <div class="chart-container">
                    <h3>Channel Performance</h3>
                    <canvas id="channelChart_${sanitized}"></canvas>
                </div>
            </section>
            
            <section class="table-section">
                <h3>Channel Breakdown</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Channel</th>
                            <th>Published</th>
                            <th>Expected</th>
                            <th>Received</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.entries(result.channelStats).map(([channel, stats]) => {
                            var rate = stats.expected > 0 ? ((stats.received / stats.expected) * 100).toFixed(1) : 0;
                            return `
                        <tr>
                            <td><strong>${channel}</strong></td>
                            <td>${stats.published}</td>
                            <td>${stats.expected}</td>
                            <td>${stats.received}</td>
                            <td><span class="status-badge ${rate >= 95 ? 'status-pass' : 'status-fail'}">${rate}%</span></td>
                        </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </section>
        </div>
        `;
    }).join('');

    // Comparison Tab HTML
    const comparisonHTML = generateComparisonTab(allResults);

    // Generate charts script BEFORE wrapping in HTML
    const chartsScript = generateChartsScript(allResults, sanitizeKey);

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Performance Evaluation Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        
        header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
        }
        
        header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        
        .timestamp {
            font-size: 0.9em;
            opacity: 0.8;
            margin-top: 10px;
        }
        
        .tabs {
            display: flex;
            background: #f0f0f0;
            border-bottom: 2px solid #ddd;
            flex-wrap: wrap;
        }
        
        .tablinks {
            background-color: #f0f0f0;
            border: none;
            outline: none;
            cursor: pointer;
            padding: 14px 16px;
            transition: 0.3s;
            font-size: 14px;
            font-weight: 500;
        }
        
        .tablinks:hover {
            background-color: #ddd;
        }
        
        .tablinks.active {
            background-color: #667eea;
            color: white;
        }
        
        .tabcontent {
            display: none;
            padding: 40px;
            animation: fadeEffect 0.5s;
        }
        
        .tabcontent.active {
            display: block;
        }
        
        @keyframes fadeEffect {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        
        .metric-card {
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            padding: 25px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            border-left: 5px solid #667eea;
        }
        
        .metric-card.success {
            border-left-color: #10b981;
        }
        
        .metric-card.warning {
            border-left-color: #f59e0b;
        }
        
        .metric-card.danger {
            border-left-color: #ef4444;
        }
        
        .metric-label {
            font-size: 0.9em;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
        }
        
        .metric-value {
            font-size: 2.5em;
            font-weight: bold;
            color: #333;
        }
        
        .metric-unit {
            font-size: 0.5em;
            color: #999;
            margin-left: 5px;
        }
        
        .metric-description {
            font-size: 0.8em;
            color: #666;
            margin-top: 10px;
        }
        
        .charts-section {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
            gap: 30px;
            margin-bottom: 40px;
        }
        
        .chart-container {
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            position: relative;
            height: 400px;
        }
        
        .chart-container h3 {
            margin-bottom: 20px;
            color: #333;
            font-size: 1.3em;
        }
        
        canvas {
            max-height: 350px;
        }
        
        .table-section {
            margin-top: 40px;
        }
        
        .table-section h3 {
            margin-bottom: 20px;
            color: #333;
            font-size: 1.3em;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            border-radius: 10px;
            overflow: hidden;
        }
        
        thead {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        
        th {
            padding: 15px;
            text-align: left;
            font-weight: 600;
        }
        
        td {
            padding: 12px 15px;
            border-bottom: 1px solid #eee;
        }
        
        tbody tr:hover {
            background: #f5f7fa;
        }
        
        .status-badge {
            display: inline-block;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 0.85em;
            font-weight: 600;
        }
        
        .status-pass {
            background: #d1fae5;
            color: #065f46;
        }
        
        .status-fail {
            background: #fee2e2;
            color: #991b1b;
        }
        
        footer {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #666;
            border-top: 1px solid #eee;
        }
        
        h2 {
            color: #667eea;
            margin-bottom: 30px;
            padding-bottom: 10px;
            border-bottom: 2px solid #667eea;
        }
        
        @media (max-width: 1024px) {
            .charts-section {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>📊 Performance Evaluation Report</h1>
            <p>Multi-System Pub/Sub Analysis</p>
            <div class="timestamp">${new Date().toISOString()}</div>
        </header>
        
        <div class="tabs">
            ${tabsHTML}
            <button class="tablinks" onclick="window.openTab(event, 'Comparison')">
                📊 Comparison
            </button>
        </div>
        
        <div class="content">
            ${tabContentsHTML}
            ${comparisonHTML}
        </div>
        
        <footer>
            Generated on ${new Date().toLocaleString()}
        </footer>
    </div>
    
    <script>
        window.openTab = function(evt, tabName) {
            var i, tabcontent, tablinks;
            tabcontent = document.getElementsByClassName("tabcontent");
            for (i = 0; i < tabcontent.length; i++) {
                tabcontent[i].classList.remove("active");
            }
            tablinks = document.getElementsByClassName("tablinks");
            for (i = 0; i < tablinks.length; i++) {
                tablinks[i].classList.remove("active");
            }
            var element = document.getElementById(tabName);
            if (element) {
                element.classList.add("active");
            }
            if (evt && evt.currentTarget) {
                evt.currentTarget.classList.add("active");
            }
        };
        
        ${chartsScript}
        
        // Open default tab after everything is loaded
        document.addEventListener('DOMContentLoaded', function() {
            var defaultBtn = document.getElementById("defaultOpen");
            if (defaultBtn) {
                window.openTab(null, defaultBtn.textContent.trim());
                defaultBtn.click();
            }
        });
    </script>
</body>
</html>
    `;

    const REPORT_FILE = `./evaluator_logs/report_${TIMESTAMP}.html`;
    fs.writeFileSync(REPORT_FILE, htmlContent);
    console.log(`\n✓ HTML Report generated: ${REPORT_FILE}`);
    console.log(`Open in browser: ${REPORT_FILE}\n`);
}

function generateComparisonTab(allResults) {
    const labels = Object.keys(allResults);
    
    if (labels.length < 2) {
        return `
        <div id="Comparison" class="tabcontent">
            <h2>Comparison</h2>
            <p>Need at least 2 systems to compare</p>
        </div>
        `;
    }
    
    const deliveryRates = labels.map(l => allResults[l].deliveryRate);
    const avgLatencies = labels.map(l => allResults[l].latencyStats.avg || 0);
    const undeliveredCounts = labels.map(l => allResults[l].undeliveredCount);
    const duplicateCounts = labels.map(l => allResults[l].duplicateCount);
    
    return `
    <div id="Comparison" class="tabcontent">
        <h2>System Comparison</h2>
        
        <section class="charts-section">
            <div class="chart-container">
                <h3>Delivery Rate Comparison</h3>
                <canvas id="comparisonDeliveryChart"></canvas>
            </div>
            
            <div class="chart-container">
                <h3>Average Latency Comparison</h3>
                <canvas id="comparisonLatencyChart"></canvas>
            </div>
            
            <div class="chart-container">
                <h3>Undelivered Count Comparison</h3>
                <canvas id="comparisonUndeliveredChart"></canvas>
            </div>
            
            <div class="chart-container">
                <h3>Duplicate Count Comparison</h3>
                <canvas id="comparisonDuplicateChart"></canvas>
            </div>
        </section>
        
        <section class="table-section">
            <h3>Summary Comparison</h3>
            <table>
                <thead>
                    <tr>
                        <th>System</th>
                        <th>Delivery Rate</th>
                        <th>Avg Latency</th>
                        <th>Undelivered</th>
                        <th>Duplicates</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${labels.map(label => {
                        const result = allResults[label];
                        const status = result.deliveryRate >= 95 ? '✓ Pass' : '✗ Fail';
                        return `
                    <tr>
                        <td><strong>${label}</strong></td>
                        <td>${result.deliveryRate}%</td>
                        <td>${result.latencyStats.avg || 'N/A'}ms</td>
                        <td>${result.undeliveredCount}</td>
                        <td>${result.duplicateCount}</td>
                        <td>${status}</td>
                    </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </section>
    </div>
    `;
}

function generateChartsScript(allResults, sanitizeKey) {
    let script = '';
    
    // Individual charts for each system
    for (const [key, result] of Object.entries(allResults)) {
        const sanitized = sanitizeKey(key);
        const deliveryRate = result.deliveryRate;
        const latencyStats = result.latencyStats;
        const totalPubs = Object.keys(result.publications).length;
        const deliveredPubs = totalPubs - result.undeliveredCount;
        
        const latencyBuckets = {
            '0-10ms': 0,
            '10-50ms': 0,
            '50-100ms': 0,
            '100-500ms': 0,
            '500ms+': 0
        };
        
        if (latencyStats.values) {
            latencyStats.values.forEach(lat => {
                if (lat <= 10) latencyBuckets['0-10ms']++;
                else if (lat <= 50) latencyBuckets['10-50ms']++;
                else if (lat <= 100) latencyBuckets['50-100ms']++;
                else if (lat <= 500) latencyBuckets['100-500ms']++;
                else latencyBuckets['500ms+']++;
            });
        }
        
        const channelLabels = JSON.stringify(Object.keys(result.channelStats));
        const channelRates = Object.values(result.channelStats).map(stats => 
            stats.expected > 0 ? parseFloat(((stats.received / stats.expected) * 100).toFixed(1)) : 0
        );
        
        script += `
        // Delivery Chart for ${sanitized}
        (function() {
            var deliveryCtx = document.getElementById('deliveryChart_${sanitized}');
            if (deliveryCtx) {
                new Chart(deliveryCtx.getContext('2d'), {
                    type: 'doughnut',
                    data: {
                        labels: ['Delivered', 'Undelivered'],
                        datasets: [{
                            data: [${deliveredPubs}, ${result.undeliveredCount}],
                            backgroundColor: ['#10b981', '#ef4444'],
                            borderColor: ['#059669', '#dc2626'],
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'bottom', labels: { padding: 15, font: { size: 12 } } }
                        }
                    }
                });
            }
        })();
        
        // Latency Chart for ${sanitized}
        (function() {
            var latencyCtx = document.getElementById('latencyChart_${sanitized}');
            if (latencyCtx) {
                new Chart(latencyCtx.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: ['0-10ms', '10-50ms', '50-100ms', '100-500ms', '500ms+'],
                        datasets: [{
                            label: 'Message Count',
                            data: [${latencyBuckets['0-10ms']}, ${latencyBuckets['10-50ms']}, ${latencyBuckets['50-100ms']}, ${latencyBuckets['100-500ms']}, ${latencyBuckets['500ms+']}],
                            backgroundColor: '#667eea',
                            borderColor: '#4c51bf',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true } }
                    }
                });
            }
        })();
        
        // Channel Chart for ${sanitized}
        (function() {
            var channelCtx = document.getElementById('channelChart_${sanitized}');
            if (channelCtx) {
                var channelRatesData = ${JSON.stringify(channelRates)};
                var channelColors = channelRatesData.map(rate => rate >= 95 ? '#10b981' : '#ef4444');
                var channelBorders = channelRatesData.map(rate => rate >= 95 ? '#059669' : '#dc2626');
                new Chart(channelCtx.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: ${channelLabels},
                        datasets: [{
                            label: 'Delivery Rate (%)',
                            data: channelRatesData,
                            backgroundColor: channelColors,
                            borderColor: channelBorders,
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        indexAxis: 'y',
                        plugins: { legend: { display: false } },
                        scales: { x: { min: 0, max: 100 } }
                    }
                });
            }
        })();
        `;
    }
    
    // Comparison charts
    const labels = Object.keys(allResults);
    if (labels.length >= 2) {
        const deliveryRates = labels.map(l => allResults[l].deliveryRate);
        const avgLatencies = labels.map(l => allResults[l].latencyStats.avg || 0);
        const undeliveredCounts = labels.map(l => allResults[l].undeliveredCount);
        const duplicateCounts = labels.map(l => allResults[l].duplicateCount);
        
        script += `
        // Comparison: Delivery Rate
        (function() {
            var ctx = document.getElementById('comparisonDeliveryChart');
            if (ctx) {
                var rates = ${JSON.stringify(deliveryRates)};
                var colors = rates.map(rate => rate >= 95 ? '#10b981' : '#ef4444');
                var borders = rates.map(rate => rate >= 95 ? '#059669' : '#dc2626');
                new Chart(ctx.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: ${JSON.stringify(labels)},
                        datasets: [{
                            label: 'Delivery Rate (%)',
                            data: rates,
                            backgroundColor: colors,
                            borderColor: borders,
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { y: { min: 0, max: 100 } }
                    }
                });
            }
        })();
        
        // Comparison: Latency
        (function() {
            var ctx = document.getElementById('comparisonLatencyChart');
            if (ctx) {
                new Chart(ctx.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: ${JSON.stringify(labels)},
                        datasets: [{
                            label: 'Average Latency (ms)',
                            data: ${JSON.stringify(avgLatencies)},
                            backgroundColor: '#667eea',
                            borderColor: '#4c51bf',
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } }
                    }
                });
            }
        })();
        
        // Comparison: Undelivered
        (function() {
            var ctx = document.getElementById('comparisonUndeliveredChart');
            if (ctx) {
                new Chart(ctx.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: ${JSON.stringify(labels)},
                        datasets: [{
                            label: 'Undelivered Count',
                            data: ${JSON.stringify(undeliveredCounts)},
                            backgroundColor: '#f59e0b',
                            borderColor: '#d97706',
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } }
                    }
                });
            }
        })();
        
        // Comparison: Duplicates
        (function() {
            var ctx = document.getElementById('comparisonDuplicateChart');
            if (ctx) {
                new Chart(ctx.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: ${JSON.stringify(labels)},
                        datasets: [{
                            label: 'Duplicate Count',
                            data: ${JSON.stringify(duplicateCounts)},
                            backgroundColor: '#ef4444',
                            borderColor: '#dc2626',
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } }
                    }
                });
            }
        })();
        `;
    }
    
    return script;
}


function compareAoI(pub_aoi, sub_aoi) {
    var distance = Math.sqrt(
        Math.pow(pub_aoi.center.x - sub_aoi.center.x, 2) + 
        Math.pow(pub_aoi.center.y - sub_aoi.center.y, 2)
    );
    if (distance < (pub_aoi.radius + sub_aoi.radius)) {
        return true;
    }
    return false;
}

var error = function(message) {
    console.error(message);
    process.exit(1);
}