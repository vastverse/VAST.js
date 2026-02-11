// analyzeSimulation.js
const fs = require('fs');
const readline = require('readline');

// Event type mappings
const EventTypes = {
    0: 'CLIENT_JOIN',
    1: 'CLIENT_DISCONNECT',
    2: 'CLIENT_CONNECT',
    3: 'CLIENT_LEAVE',
    4: 'CLIENT_MIGRATE',
    5: 'CLIENT_MOVE',
    6: 'SUB_NEW',
    7: 'SUB_DELETE',
    8: 'SUB_HEARTBEAT',
    9: 'PUB',
    10: 'RECEIVE_PUB'
};

// Data structures
const publications = new Map();
const latencies = [];
const clientStats = new Map();
let totalPublications = 0;
let totalReceived = 0;

// Parse events file
async function parseEventsFile(filePath) {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        if (line.trim() === '') continue;
        
        try {
            const event = JSON.parse(line);
            processEvent(event);
        } catch (e) {
            console.error('Error parsing line:', line);
        }
    }
}

function processEvent(event) {
    const { time, event: eventType, id, alias } = event;
    
    // Initialize client stats
    if (!clientStats.has(id)) {
        clientStats.set(id, {
            id,
            alias: alias || 'unnamed_client',
            pubsSent: 0,
            pubsReceived: 0,
            subscriptions: 0,
            firstTime: time,
            lastTime: time
        });
    }

    const client = clientStats.get(id);
    client.lastTime = time;

    // Event type 9: Publication sent
    if (eventType === 9) {
        const pubID = event.pub.pubID;
        totalPublications++;
        client.pubsSent++;

        publications.set(pubID, {
            pubID,
            sourceID: id,
            sourceAlias: alias,
            time,
            channel: event.pub.channel,
            payload: event.pub.payload,
            aoi: event.pub.aoi,
            receivers: new Set(),
            receiveTimes: []
        });
    }

    // Event type 10: Publication received
    if (eventType === 10) {
        const pubID = event.pub.pubID;
        totalReceived++;
        client.pubsReceived++;

        if (publications.has(pubID)) {
            const pub = publications.get(pubID);
            pub.receivers.add(id);
            pub.receiveTimes.push({
                receiverID: id,
                receiverAlias: alias,
                receiveTime: time,
                latency: time - pub.time,
                chain: event.pub.chain
            });

            latencies.push({
                pubID,
                sourceAlias: pub.sourceAlias,
                receiverAlias: alias,
                latency: time - pub.time
            });
        }
    }

    // Event type 6: Subscription created
    if (eventType === 6) {
        client.subscriptions++;
    }
}

// Calculate statistics
function calculateStats() {
    const successRate = totalPublications > 0 ? (totalReceived / totalPublications) * 100 : 0;
    
    const avgLatency = latencies.length > 0 
        ? latencies.reduce((sum, l) => sum + l.latency, 0) / latencies.length 
        : 0;

    const minLatency = latencies.length > 0 
        ? Math.min(...latencies.map(l => l.latency)) 
        : 0;

    const maxLatency = latencies.length > 0 
        ? Math.max(...latencies.map(l => l.latency)) 
        : 0;

    const stdDevLatency = latencies.length > 0
        ? Math.sqrt(
            latencies.reduce((sum, l) => sum + Math.pow(l.latency - avgLatency, 2), 0) / latencies.length
          )
        : 0;

    return {
        totalPublications,
        totalReceived,
        successRate,
        avgLatency,
        minLatency,
        maxLatency,
        stdDevLatency,
        totalClients: clientStats.size,
        clientStats: Array.from(clientStats.values())
    };
}

// Generate HTML report
function generateHTML(stats) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VAST.js Logistics Analysis</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            min-height: 100vh;
        }
        
        .container {
            max-width: 1600px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        
        h1 {
            color: #333;
            margin-bottom: 10px;
            text-align: center;
            font-size: 32px;
        }
        
        .subtitle {
            text-align: center;
            color: #666;
            margin-bottom: 40px;
            font-size: 16px;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 20px;
            margin-bottom: 50px;
        }
        
        .stat-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 25px;
            border-radius: 12px;
            text-align: center;
            box-shadow: 0 8px 25px rgba(0,0,0,0.15);
            transition: transform 0.3s ease;
        }
        
        .stat-card:hover {
            transform: translateY(-5px);
        }
        
        .stat-card h3 {
            font-size: 13px;
            opacity: 0.9;
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .stat-card .value {
            font-size: 36px;
            font-weight: bold;
        }
        
        .stat-card.success {
            background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
        }
        
        .stat-card.latency {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        }
        
        .stat-card.info {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
        }
        
        .charts-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(550px, 1fr));
            gap: 30px;
            margin-bottom: 50px;
        }
        
        .chart-container {
            background: #f9f9f9;
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.1);
        }
        
        .chart-container h2 {
            color: #333;
            font-size: 18px;
            margin-bottom: 20px;
            border-bottom: 3px solid #667eea;
            padding-bottom: 10px;
        }
        
        canvas {
            max-width: 100%;
        }
        
        .table-container {
            background: #f9f9f9;
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.1);
            overflow-x: auto;
        }
        
        .table-container h2 {
            color: #333;
            font-size: 18px;
            margin-bottom: 20px;
            border-bottom: 3px solid #667eea;
            padding-bottom: 10px;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
        }
        
        th, td {
            padding: 14px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        
        th {
            background: #667eea;
            color: white;
            font-weight: 600;
            text-transform: uppercase;
            font-size: 12px;
            letter-spacing: 0.5px;
        }
        
        tr:hover {
            background: #f0f0f0;
        }
        
        tr:nth-child(even) {
            background: #fafafa;
        }
        
        .success-rate {
            color: #38ef7d;
            font-weight: bold;
        }
        
        .failure {
            color: #f5576c;
            font-weight: bold;
        }
        
        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }
        
        .badge-success {
            background: #d4edda;
            color: #155724;
        }
        
        .badge-warning {
            background: #fff3cd;
            color: #856404;
        }
        
        .badge-danger {
            background: #f8d7da;
            color: #721c24;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 VAST.js Logistics Simulation Analysis</h1>
        <p class="subtitle">Publication Delivery & Latency Performance Metrics</p>
        
        <div class="stats-grid">
            <div class="stat-card info">
                <h3>Total Clients</h3>
                <div class="value">${stats.totalClients}</div>
            </div>
            <div class="stat-card info">
                <h3>Total Publications</h3>
                <div class="value">${stats.totalPublications}</div>
            </div>
            <div class="stat-card info">
                <h3>Total Received</h3>
                <div class="value">${stats.totalReceived}</div>
            </div>
            <div class="stat-card success">
                <h3>Success Rate</h3>
                <div class="value">${stats.successRate.toFixed(2)}%</div>
            </div>
            <div class="stat-card latency">
                <h3>Average Latency</h3>
                <div class="value">${stats.avgLatency.toFixed(2)}ms</div>
            </div>
            <div class="stat-card latency">
                <h3>Min Latency</h3>
                <div class="value">${stats.minLatency.toFixed(2)}ms</div>
            </div>
            <div class="stat-card latency">
                <h3>Max Latency</h3>
                <div class="value">${stats.maxLatency.toFixed(2)}ms</div>
            </div>
            <div class="stat-card latency">
                <h3>Std Dev</h3>
                <div class="value">${stats.stdDevLatency.toFixed(2)}ms</div>
            </div>
        </div>
        
        <div class="charts-grid">
            <div class="chart-container">
                <h2>📈 1. Publication Success Rate</h2>
                <canvas id="successChart"></canvas>
            </div>
            <div class="chart-container">
                <h2>⏱️ 2. Latency Distribution</h2>
                <canvas id="latencyChart"></canvas>
            </div>
            <div class="chart-container">
                <h2>📊 3. Client Performance</h2>
                <canvas id="clientChart"></canvas>
            </div>
            <div class="chart-container">
                <h2>📉 4. Latency Percentiles</h2>
                <canvas id="percentilesChart"></canvas>
            </div>
        </div>
        
        <div class="table-container">
            <h2>📋 Client Statistics</h2>
            <table id="statsTable">
                <thead>
                    <tr>
                        <th>Client ID</th>
                        <th>Pubs Sent</th>
                        <th>Pubs Received</th>
                        <th>Subscriptions</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody id="statsTableBody">
                </tbody>
            </table>
        </div>
    </div>

    <script>
        const stats = ${JSON.stringify(stats)};
        const latencies = ${JSON.stringify(latencies)};

        // 1. Success Rate Chart
        const successCtx = document.getElementById('successChart').getContext('2d');
        new Chart(successCtx, {
            type: 'doughnut',
            data: {
                labels: ['Received', 'Missed'],
                datasets: [{
                    data: [
                        stats.totalReceived,
                        stats.totalPublications - stats.totalReceived
                    ],
                    backgroundColor: ['#38ef7d', '#f5576c'],
                    borderColor: ['#11998e', '#f093fb'],
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(2);
                                return context.label + ': ' + context.parsed + ' (' + percentage + '%)';
                            }
                        }
                    }
                }
            }
        });

        // 2. Latency Distribution
        const latencyBuckets = {
            '0-10ms': 0,
            '10-50ms': 0,
            '50-100ms': 0,
            '100-500ms': 0,
            '500+ms': 0
        };
        
        latencies.forEach(l => {
            if (l.latency <= 10) latencyBuckets['0-10ms']++;
            else if (l.latency <= 50) latencyBuckets['10-50ms']++;
            else if (l.latency <= 100) latencyBuckets['50-100ms']++;
            else if (l.latency <= 500) latencyBuckets['100-500ms']++;
            else latencyBuckets['500+ms']++;
        });

        const latencyCtx = document.getElementById('latencyChart').getContext('2d');
        new Chart(latencyCtx, {
            type: 'bar',
            data: {
                labels: Object.keys(latencyBuckets),
                datasets: [{
                    label: 'Count',
                    data: Object.values(latencyBuckets),
                    backgroundColor: '#667eea',
                    borderColor: '#764ba2',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });

        // 3. Client Performance
        const clientLabels = stats.clientStats.map(c => c.alias);
        const clientSent = stats.clientStats.map(c => c.pubsSent);
        const clientReceived = stats.clientStats.map(c => c.pubsReceived);

        const clientCtx = document.getElementById('clientChart').getContext('2d');
        new Chart(clientCtx, {
            type: 'bar',
            data: {
                labels: clientLabels,
                datasets: [
                    {
                        label: 'Sent',
                        data: clientSent,
                        backgroundColor: '#667eea'
                    },
                    {
                        label: 'Received',
                        data: clientReceived,
                        backgroundColor: '#38ef7d'
                    }
                ]
            },
            options: {
                responsive: true,
                scales: { y: { beginAtZero: true } }
            }
        });

        // 4. Latency Percentiles
        const sortedLatencies = latencies.map(l => l.latency).sort((a, b) => a - b);
        const p25 = sortedLatencies[Math.floor(sortedLatencies.length * 0.25)];
        const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.50)];
        const p75 = sortedLatencies[Math.floor(sortedLatencies.length * 0.75)];
        const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)];
        const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)];

        const percentilesCtx = document.getElementById('percentilesChart').getContext('2d');
        new Chart(percentilesCtx, {
            type: 'bar',
            data: {
                labels: ['P25', 'P50', 'P75', 'P95', 'P99'],
                datasets: [{
                    label: 'Latency (ms)',
                    data: [p25, p50, p75, p95, p99],
                    backgroundColor: ['#4facfe', '#00f2fe', '#667eea', '#f093fb', '#f5576c'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });

        // Populate table
        const tbody = document.getElementById('statsTableBody');
        stats.clientStats.forEach(client => {
            const row = document.createElement('tr');
            const status = client.pubsSent > 0 ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-warning">Idle</span>';
            row.innerHTML = \`
                <td>\${client.alias}</td>
                <td>\${client.pubsSent}</td>
                <td>\${client.pubsReceived}</td>
                <td>\${client.subscriptions}</td>
                <td>\${status}</td>
            \`;
            tbody.appendChild(row);
        });
    </script>
</body>
</html>`;

    return html;
}

// Main execution
async function main() {
    const eventsFilePath = '/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/SPS/logs_and_events/Client_events.txt';
    
    if (!fs.existsSync(eventsFilePath)) {
        console.error(`Error: File not found at ${eventsFilePath}`);
        process.exit(1);
    }

    console.log('Parsing events file...');
    await parseEventsFile(eventsFilePath);
    
    console.log('Calculating statistics...');
    const stats = calculateStats();
    
    console.log('\n=== VAST.js Simulation Summary ===');
    console.log(`Total Clients: ${stats.totalClients}`);
    console.log(`Total Publications: ${stats.totalPublications}`);
    console.log(`Total Received: ${stats.totalReceived}`);
    console.log(`Success Rate: ${stats.successRate.toFixed(2)}%`);
    console.log(`Average Latency: ${stats.avgLatency.toFixed(2)}ms`);
    console.log(`Min Latency: ${stats.minLatency.toFixed(2)}ms`);
    console.log(`Max Latency: ${stats.maxLatency.toFixed(2)}ms`);
    console.log(`Std Dev: ${stats.stdDevLatency.toFixed(2)}ms\n`);
    
    console.log('Generating HTML report...');
    const html = generateHTML(stats);
    fs.writeFileSync('analysis_report.html', html);
    
    console.log('✅ Report generated: analysis_report.html');
}

main().catch(console.error);