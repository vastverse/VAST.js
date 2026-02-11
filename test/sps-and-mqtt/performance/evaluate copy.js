// performanceEvaluator.js
var fs = require('fs');
// require('../lib/common');
const readline = require('readline');

var filename = process.argv[2] || "./Client_events.txt";

if (filename.length > 4 && filename.slice(-4) != ".txt") {
    error("Please Provide A Text File");
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
// START EVALUATION
// =====================================================

logToFile('Performance Evaluator Started');
logToFile(`Input File: ${filename}`);
logToFile('');

const fileStream = fs.createReadStream(filename);
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
        logToFile(`ERROR: Failed to parse line: ${line}`);
    }
});

rl.on('close', () => {
    var fileProcessingEnd = Date.now();
    logToFile(`Finished reading the file (${fileProcessingEnd - fileProcessingStart}ms)`);
    logToFile(`Total events read: ${events.length}`);
    logToFile('');

    // Sort events by time
    function compare(a, b) {
        var result = a.time - b.time;
        if (result === 0) {
            result = a.event - b.event;
        }
        return result;
    }

    var sortedEvents = events.slice().sort(compare);

    logToFile('Events sorted by timestamp');
    
    if (sortedEvents.length > 0) {
        var minTime = sortedEvents[0].time;
        var maxTime = sortedEvents[sortedEvents.length - 1].time;
        var duration = maxTime - minTime;
        
        logToFile(`Time span: ${new Date(minTime).toISOString()} to ${new Date(maxTime).toISOString()}`);
        logToFile(`Duration: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
        logToFile('');
    }

    // =====================================================
    // DATA COLLECTION
    // =====================================================
    logToFile('Collecting publication and subscription data...');
    
    var publications = {};      // pubID -> {time, pub, expectedRecipients, actualRecipients}
    var subscriptions = {};     // subID -> subscription data
    var receipts = [];          // Track all RECEIVE_PUB events
    var pubTimestamps = {};     // pubID -> timestamp for latency calculation

    // First pass: collect subscriptions and publications
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
            pubTimestamps[pubID] = event.time; // Store for latency calc
            
            publications[pubID] = {
                pubID: pubID,
                publishTime: event.time,
                clientID: event.id,
                channel: event.pub.channel,
                aoi: event.pub.aoi,
                expectedRecipients: [],
                actualRecipients: [],
                receipts: [] // Track individual receipts with timestamps
            };
            pubCount++;
        }

        if (event.event === 10) { // RECEIVE_PUB
            var receiptEntry = {
                pubID: event.pub.pubID,
                clientID: event.id,
                receiveTime: event.time,
                publishTime: event.pub.time || pubTimestamps[event.pub.pubID] // Use pub.time if available
            };
            
            // Calculate latency
            if (receiptEntry.publishTime) {
                receiptEntry.latency = receiptEntry.receiveTime - receiptEntry.publishTime;
            }
            
            receipts.push(receiptEntry);
        }
    }

    logToFile(`Found ${pubCount} publications`);
    logToFile(`Found ${subCount} subscriptions`);
    logToFile(`Found ${receipts.length} receipt events`);
    logToFile('');

    // Calculate expected recipients for each publication
    logToFile('Calculating expected recipients for each publication...');
    var matchCount = 0;

    for (var pubID in publications) {
        var pub = publications[pubID];
        
        for (var subID in subscriptions) {
            var sub = subscriptions[subID];
            
            // Match channel
            if (sub.channel !== pub.channel) continue;
            
            // Check spatial overlap
            if (!compareAoI(pub.aoi, sub.aoi)) continue;
            
            // This subscription should receive it
            pub.expectedRecipients.push(sub.clientID);
            matchCount++;
        }
    }

    logToFile(`Matched ${matchCount} subscription-publication pairs`);
    logToFile('');

    // Match receipts to publications
    logToFile('Matching receipts to publications...');
    var receiptsMatched = 0;

    for (var idx in receipts) {
        var receipt = receipts[idx];
        if (publications[receipt.pubID]) {
            publications[receipt.pubID].actualRecipients.push(receipt.clientID);
            publications[receipt.pubID].receipts.push(receipt);
            receiptsMatched++;
        }
    }

    logToFile(`Matched ${receiptsMatched} receipts to publications`);
    logToFile('');

    // =====================================================
    // METRIC CALCULATIONS
    // =====================================================

    logToFile('Calculating metrics...');

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

        // Detect duplicates
        var uniqueRecipients = new Set(pub.actualRecipients);
        var duplicates = actual - uniqueRecipients.size;
        duplicateCount += duplicates;
        duplicateReceiptCount += actual - uniqueRecipients.size;

        // Detect undelivered
        if (expected > 0 && actual === 0) {
            undeliveredPubs.push({
                pubID: pubID,
                channel: pub.channel,
                expectedCount: expected,
                publisher: pub.clientID,
                publishTime: new Date(pub.publishTime).toISOString()
            });
        }

        // Collect latencies
        for (var i = 0; i < pub.receipts.length; i++) {
            if (pub.receipts[i].latency !== undefined) {
                latencies.push({
                    pubID: pubID,
                    clientID: pub.receipts[i].clientID,
                    latency: pub.receipts[i].latency,
                    publishTime: new Date(pub.receipts[i].publishTime).toISOString(),
                    receiveTime: new Date(pub.receipts[i].receiveTime).toISOString()
                });
            }
        }
    }

    logToFile('');
    logSeparator();
    logToFile('MUST-HAVE PERFORMANCE METRICS');
    logSeparator();
    logToFile('');

    // =====================================================
    // METRIC 1: DELIVERY RATE
    // =====================================================
    var deliveryRate = totalExpected > 0 
        ? ((totalReceived / totalExpected) * 100).toFixed(2) 
        : 0;

    logToFile('1. DELIVERY RATE');
    logToFile('   Expected Receipts: ' + totalExpected);
    logToFile('   Actual Receipts:   ' + totalReceived);
    logToFile('   Delivery Rate:     ' + deliveryRate + '%');
    logToFile('');

    // =====================================================
    // METRIC 2: MESSAGE LATENCY
    // =====================================================
    logToFile('2. MESSAGE LATENCY (milliseconds)');

    if (latencies.length > 0) {
        var latencyValues = latencies.map(l => l.latency);
        var avgLatency = latencyValues.reduce((a, b) => a + b, 0) / latencyValues.length;
        var minLatency = Math.min(...latencyValues);
        var maxLatency = Math.max(...latencyValues);
        
        // Calculate variance
        var variance = latencyValues.reduce((sum, lat) => {
            return sum + Math.pow(lat - avgLatency, 2);
        }, 0) / latencyValues.length;
        var stdDev = Math.sqrt(variance);

        // Calculate median
        var sorted = latencyValues.slice().sort((a, b) => a - b);
        var medianLatency = sorted.length % 2 === 0
            ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
            : sorted[Math.floor(sorted.length / 2)];

        logToFile('   Sample Size:        ' + latencyValues.length);
        logToFile('   Average Latency:    ' + avgLatency.toFixed(2) + ' ms');
        logToFile('   Median Latency:     ' + medianLatency.toFixed(2) + ' ms');
        logToFile('   Min Latency:        ' + minLatency.toFixed(2) + ' ms');
        logToFile('   Max Latency:        ' + maxLatency.toFixed(2) + ' ms');
        logToFile('   Std Deviation:      ' + stdDev.toFixed(2) + ' ms');
        logToFile('');

        // Show top 5 slowest deliveries
        logToFile('   Top 5 Slowest Deliveries:');
        latencies.slice().sort((a, b) => b.latency - a.latency).slice(0, 5).forEach((entry, i) => {
            logToFile(`     ${i + 1}. PubID: ${entry.pubID} | Client: ${entry.clientID} | Latency: ${entry.latency.toFixed(2)}ms`);
        });
        logToFile('');

    } else {
        logToFile('   [No latency data available]');
        logToFile('');
    }

    // =====================================================
    // METRIC 3: UNDELIVERED MESSAGES
    // =====================================================
    logToFile('3. UNDELIVERED MESSAGES');
    logToFile('   Total Publications: ' + Object.keys(publications).length);
    logToFile('   Undelivered Pubs:   ' + undeliveredPubs.length);
    
    var undeliveredRate = Object.keys(publications).length > 0
        ? ((undeliveredPubs.length / Object.keys(publications).length) * 100).toFixed(2)
        : 0;
    logToFile('   Undelivered Rate:   ' + undeliveredRate + '%');
    logToFile('');

    if (undeliveredPubs.length > 0) {
        logToFile('   Undelivered Publications (first 20):');
        undeliveredPubs.slice(0, 20).forEach(detail => {
            logToFile(`     - PubID: ${detail.pubID} | Channel: ${detail.channel} | Expected: ${detail.expectedCount} | Publisher: ${detail.publisher} | Time: ${detail.publishTime}`);
        });
        if (undeliveredPubs.length > 20) {
            logToFile(`     ... and ${undeliveredPubs.length - 20} more`);
        }
    } else {
        logToFile('   [No undelivered publications found]');
    }
    logToFile('');

    // =====================================================
    // METRIC 4: DUPLICATE MESSAGES
    // =====================================================
    logToFile('4. DUPLICATE MESSAGES');
    logToFile('   Total Duplicate Receipts: ' + duplicateReceiptCount);
    
    var duplicatesByPub = [];
    for (var pubID in publications) {
        var pub = publications[pubID];
        var actual = pub.actualRecipients.length;
        var unique = new Set(pub.actualRecipients).size;
        if (actual > unique) {
            duplicatesByPub.push({
                pubID: pubID,
                channel: pub.channel,
                expected: pub.expectedRecipients.length,
                actualReceived: actual,
                uniqueRecipients: unique,
                duplicates: actual - unique
            });
        }
    }

    if (duplicatesByPub.length > 0) {
        logToFile('   Publications with Duplicates: ' + duplicatesByPub.length);
        logToFile('   Duplicate Details (first 20):');
        duplicatesByPub.slice(0, 20).forEach(dup => {
            logToFile(`     - PubID: ${dup.pubID} | Channel: ${dup.channel} | Expected: ${dup.expected} | Received: ${dup.actualReceived} (Unique: ${dup.uniqueRecipients}) | Duplicates: ${dup.duplicates}`);
        });
        if (duplicatesByPub.length > 20) {
            logToFile(`     ... and ${duplicatesByPub.length - 20} more`);
        }
    } else {
        logToFile('   [No duplicates detected]');
    }
    logToFile('');

    // =====================================================
    // SUMMARY & RESULTS
    // =====================================================
    logSeparator();
    logToFile('EVALUATION SUMMARY');
    logSeparator();
    logToFile('');

    var overallStatus = 'PASS';
    var issues = [];

    if (parseFloat(deliveryRate) < 95) {
        overallStatus = 'FAIL';
        issues.push(`Delivery rate (${deliveryRate}%) below 95% threshold`);
    }

    if (undeliveredPubs.length > 0) {
        issues.push(`${undeliveredPubs.length} undelivered publications detected`);
    }

    if (duplicateReceiptCount > 0) {
        issues.push(`${duplicateReceiptCount} duplicate receipts detected`);
    }

    logToFile('Overall Status: ' + overallStatus);
    logToFile('');

    if (issues.length > 0) {
        logToFile('Issues Found:');
        issues.forEach((issue, i) => {
            logToFile(`  ${i + 1}. ${issue}`);
        });
    } else {
        logToFile('No critical issues found.');
    }

    logToFile('');
    logToFile('Evaluation completed at ' + new Date().toISOString());
    logToFile('Log saved to: ' + LOG_FILE);

    // /performance/evaluate.js - ADD THIS AT THE END before closing rl.on('close')

    // =====================================================
    // GENERATE HTML VISUALIZATION
    // =====================================================
    
    generateHTMLReport(publications, latencies, undeliveredPubs, duplicatesByPub, deliveryRate);
});

function generateHTMLReport(publications, latencies, undeliveredPubs, duplicatesByPub, deliveryRate) {
    
    // Prepare data for charts
    var latencyValues = latencies.map(l => l.latency);
    var latencyBuckets = {
        '0-10ms': 0,
        '10-50ms': 0,
        '50-100ms': 0,
        '100-500ms': 0,
        '500ms+': 0
    };
    
    latencyValues.forEach(lat => {
        if (lat <= 10) latencyBuckets['0-10ms']++;
        else if (lat <= 50) latencyBuckets['10-50ms']++;
        else if (lat <= 100) latencyBuckets['50-100ms']++;
        else if (lat <= 500) latencyBuckets['100-500ms']++;
        else latencyBuckets['500ms+']++;
    });

    // Calculate delivery status
    var totalPubs = Object.keys(publications).length;
    var deliveredPubs = totalPubs - undeliveredPubs.length;
    
    // Channel breakdown
    var channelStats = {};
    for (var pubID in publications) {
        var pub = publications[pubID];
        if (!channelStats[pub.channel]) {
            channelStats[pub.channel] = {
                published: 0,
                expected: 0,
                received: 0,
                undelivered: 0
            };
        }
        channelStats[pub.channel].published++;
        channelStats[pub.channel].expected += pub.expectedRecipients.length;
        channelStats[pub.channel].received += pub.actualRecipients.length;
    }
    
    undeliveredPubs.forEach(pub => {
        if (channelStats[pub.channel]) {
            channelStats[pub.channel].undelivered++;
        }
    });

    var avgLatency = latencyValues.length > 0 
        ? (latencyValues.reduce((a, b) => a + b, 0) / latencyValues.length).toFixed(2)
        : 0;
    
    var minLatency = latencyValues.length > 0 ? Math.min(...latencyValues).toFixed(2) : 0;
    var maxLatency = latencyValues.length > 0 ? Math.max(...latencyValues).toFixed(2) : 0;

    var htmlContent = `
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
        
        header p {
            font-size: 1.1em;
            opacity: 0.9;
        }
        
        .timestamp {
            font-size: 0.9em;
            opacity: 0.8;
            margin-top: 10px;
        }
        
        .content {
            padding: 40px;
        }
        
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
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
            line-height: 1.4;
        }
        
        .charts-section {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
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
        
        .chart-wrapper {
            position: relative;
            height: 350px;
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
            <p>Pub/Sub System Analysis</p>
            <div class="timestamp">${new Date().toISOString()}</div>
        </header>
        
        <div class="content">
            <!-- KEY METRICS -->
            <section class="metrics-grid">
                <div class="metric-card ${deliveryRate >= 95 ? 'success' : 'danger'}">
                    <div class="metric-label">Delivery Rate</div>
                    <div class="metric-value">${deliveryRate}<span class="metric-unit">%</span></div>
                    <div class="metric-description">${deliveryRate >= 95 ? '✓ Excellent' : '✗ Below threshold (95%)'}</div>
                </div>
                
                <div class="metric-card success">
                    <div class="metric-label">Average Latency</div>
                    <div class="metric-value">${avgLatency}<span class="metric-unit">ms</span></div>
                    <div class="metric-description">Mean delivery time</div>
                </div>
                
                <div class="metric-card">
                    <div class="metric-label">Latency Range</div>
                    <div class="metric-value">${minLatency}-${maxLatency}<span class="metric-unit">ms</span></div>
                    <div class="metric-description">Min to Max delivery times</div>
                </div>
                
                <div class="metric-card ${undeliveredPubs.length === 0 ? 'success' : 'danger'}">
                    <div class="metric-label">Undelivered</div>
                    <div class="metric-value">${undeliveredPubs.length}</div>
                    <div class="metric-description">${undeliveredPubs.length === 0 ? 'All publications delivered' : 'Publications with zero receipts'}</div>
                </div>
                
                <div class="metric-card ${duplicatesByPub.length === 0 ? 'success' : 'warning'}">
                    <div class="metric-label">Duplicate Publications</div>
                    <div class="metric-value">${duplicatesByPub.length}</div>
                    <div class="metric-description">Publications with duplicate receipts</div>
                </div>
                
                <div class="metric-card">
                    <div class="metric-label">Total Publications</div>
                    <div class="metric-value">${totalPubs}</div>
                    <div class="metric-description">${deliveredPubs} delivered successfully</div>
                </div>
            </section>
            
            <!-- CHARTS -->
            <section class="charts-section">
                <div class="chart-container">
                    <h3>Delivery Status Overview</h3>
                    <div class="chart-wrapper">
                        <canvas id="deliveryChart"></canvas>
                    </div>
                </div>
                
                <div class="chart-container">
                    <h3>Latency Distribution</h3>
                    <div class="chart-wrapper">
                        <canvas id="latencyChart"></canvas>
                    </div>
                </div>
                
                <div class="chart-container">
                    <h3>Channel Performance</h3>
                    <div class="chart-wrapper">
                        <canvas id="channelChart"></canvas>
                    </div>
                </div>
                
                <div class="chart-container">
                    <h3>Latency Timeline</h3>
                    <div class="chart-wrapper">
                        <canvas id="timelineChart"></canvas>
                    </div>
                </div>
            </section>
            
            <!-- TABLES -->
            <section class="table-section">
                <h3>Channel Breakdown</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Channel</th>
                            <th>Published</th>
                            <th>Expected</th>
                            <th>Received</th>
                            <th>Undelivered</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.entries(channelStats).map(([channel, stats]) => {
                            var rate = stats.expected > 0 ? ((stats.received / stats.expected) * 100).toFixed(1) : 0;
                            return `
                        <tr>
                            <td><strong>${channel}</strong></td>
                            <td>${stats.published}</td>
                            <td>${stats.expected}</td>
                            <td>${stats.received}</td>
                            <td>${stats.undelivered}</td>
                            <td><span class="status-badge ${rate >= 95 ? 'status-pass' : 'status-fail'}">${rate}%</span></td>
                        </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </section>
        </div>
        
        <footer>
            Generated on ${new Date().toLocaleString()}
        </footer>
    </div>
    
    <script>
        // Delivery Status Chart
        var deliveryCtx = document.getElementById('deliveryChart').getContext('2d');
        new Chart(deliveryCtx, {
            type: 'doughnut',
            data: {
                labels: ['Delivered', 'Undelivered'],
                datasets: [{
                    data: [${totalPubs - undeliveredPubs.length}, ${undeliveredPubs.length}],
                    backgroundColor: ['#10b981', '#ef4444'],
                    borderColor: ['#059669', '#dc2626'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { padding: 15, font: { size: 12 } }
                    }
                }
            }
        });
        
        // Latency Distribution Chart
        var latencyCtx = document.getElementById('latencyChart').getContext('2d');
        new Chart(latencyCtx, {
            type: 'bar',
            data: {
                labels: ['0-10ms', '10-50ms', '50-100ms', '100-500ms', '500ms+'],
                datasets: [{
                    label: 'Message Count',
                    data: [
                        ${latencyBuckets['0-10ms']},
                        ${latencyBuckets['10-50ms']},
                        ${latencyBuckets['50-100ms']},
                        ${latencyBuckets['100-500ms']},
                        ${latencyBuckets['500ms+']}
                    ],
                    backgroundColor: '#667eea',
                    borderColor: '#4c51bf',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'x',
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
        
        // Channel Performance Chart
        var channelCtx = document.getElementById('channelChart').getContext('2d');
        var channelLabels = ${JSON.stringify(Object.keys(channelStats))};
        var channelDeliveryRates = ${JSON.stringify(
            Object.values(channelStats).map(stats => 
                stats.expected > 0 ? ((stats.received / stats.expected) * 100).toFixed(1) : 0
            )
        )};
        
        new Chart(channelCtx, {
            type: 'bar',
            data: {
                labels: channelLabels,
                datasets: [{
                    label: 'Delivery Rate (%)',
                    data: channelDeliveryRates,
                    backgroundColor: channelDeliveryRates.map(rate => rate >= 95 ? '#10b981' : '#ef4444'),
                    borderColor: channelDeliveryRates.map(rate => rate >= 95 ? '#059669' : '#dc2626'),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { 
                        min: 0,
                        max: 100
                    }
                }
            }
        });
        
        // Latency Timeline Chart
        var timelineCtx = document.getElementById('timelineChart').getContext('2d');
        var timelineData = ${JSON.stringify(
            latencies.slice(0, 100).map((l, i) => ({ x: i, y: l.latency }))
        )};
        
        new Chart(timelineCtx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Message Latency',
                    data: timelineData,
                    backgroundColor: 'rgba(102, 126, 234, 0.6)',
                    borderColor: '#667eea',
                    borderWidth: 1,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { padding: 15, font: { size: 12 } }
                    }
                },
                scales: {
                    x: { 
                        title: { display: true, text: 'Message Index' }
                    },
                    y: { 
                        title: { display: true, text: 'Latency (ms)' }
                    }
                }
            }
        });
    </script>
</body>
</html>
    `;

    const REPORT_FILE = `./evaluator_logs/report_${TIMESTAMP}.html`;
    fs.writeFileSync(REPORT_FILE, htmlContent);
    console.log(`\n✓ HTML Report generated: ${REPORT_FILE}`);
}

var compareAoI = function(pub_aoi, sub_aoi) {
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