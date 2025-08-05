// generator.js
const fs = require('fs');

class ScriptGenerator {
    constructor() {
        this.script = '';
        this.clientCount = 0;
        this.worldSize = 1000;
    }

    // Initialize the script with gateway
    init(options = {}) {
        const {
            worldSize = 1000,
            gatewayPort = 20000,
            gatewayX = worldSize / 2,
            gatewayY = worldSize / 2
        } = options;
        
        this.worldSize = worldSize;
        this.script = `// Auto-generated simulation script
// World size: ${worldSize}x${worldSize}
// Generated at: ${new Date().toISOString()}

// Start the Gateway matcher
newMatcher GW true localhost 8000 8001 ${gatewayPort} ${gatewayX} ${gatewayY} 1500
wait 100

`;
        return this;
    }

    // Add a single client
    addClient(options = {}) {
        this.clientCount++;
        const {
            id = `C${this.clientCount}`,
            x = Math.floor(Math.random() * this.worldSize),
            y = Math.floor(Math.random() * this.worldSize),
            radius = 100,
            wait = 100
        } = options;

        this.script += `newClient ${id} localhost 20000 ${x} ${y} ${radius}\n`;
        if (wait > 0) this.script += `wait ${wait}\n`;
        
        return this;
    }

    // Add multiple clients with pattern
    addClients(count, pattern = 'random', options = {}) {
        const patterns = {
            random: () => this.addRandomClients(count, options),
            grid: () => this.addGridClients(count, options),
            circle: () => this.addCircleClients(count, options),
            cluster: () => this.addClusterClients(count, options),
            line: () => this.addLineClients(count, options)
        };

        if (patterns[pattern]) {
            patterns[pattern]();
        } else {
            console.error(`Unknown pattern: ${pattern}`);
        }
        
        return this;
    }

    addRandomClients(count, options = {}) {
        const { prefix = 'C', startId = this.clientCount + 1, wait = 100 } = options;
        
        for (let i = 0; i < count; i++) {
            this.addClient({
                id: `${prefix}${startId + i}`,
                wait: wait
            });
        }
    }

    addGridClients(count, options = {}) {
        const { prefix = 'G', startId = this.clientCount + 1, wait = 100 } = options;
        const gridSize = Math.ceil(Math.sqrt(count));
        const cellSize = this.worldSize / (gridSize + 1);
        
        let clientNum = 0;
        for (let row = 1; row <= gridSize && clientNum < count; row++) {
            for (let col = 1; col <= gridSize && clientNum < count; col++) {
                this.addClient({
                    id: `${prefix}${startId + clientNum}`,
                    x: Math.floor(col * cellSize),
                    y: Math.floor(row * cellSize),
                    wait: wait
                });
                clientNum++;
            }
        }
    }

    addCircleClients(count, options = {}) {
        const {
            prefix = 'R',
            startId = this.clientCount + 1,
            centerX = this.worldSize / 2,
            centerY = this.worldSize / 2,
            radius = this.worldSize * 0.4,
            wait = 100
        } = options;
        
        for (let i = 0; i < count; i++) {
            const angle = (2 * Math.PI * i) / count;
            this.addClient({
                id: `${prefix}${startId + i}`,
                x: Math.floor(centerX + radius * Math.cos(angle)),
                y: Math.floor(centerY + radius * Math.sin(angle)),
                wait: wait
            });
        }
    }

    addClusterClients(count, options = {}) {
        const {
            prefix = 'CL',
            startId = this.clientCount + 1,
            clusters = 3,
            spread = 100,
            wait = 100
        } = options;
        
        // Generate cluster centers
        const centers = [];
        for (let i = 0; i < clusters; i++) {
            centers.push({
                x: Math.floor(Math.random() * (this.worldSize - 2 * spread) + spread),
                y: Math.floor(Math.random() * (this.worldSize - 2 * spread) + spread)
            });
        }
        
        // Distribute clients among clusters
        const clientsPerCluster = Math.ceil(count / clusters);
        let clientNum = 0;
        
        for (let c = 0; c < clusters && clientNum < count; c++) {
            for (let i = 0; i < clientsPerCluster && clientNum < count; i++) {
                const angle = Math.random() * 2 * Math.PI;
                const distance = Math.random() * spread;
                
                this.addClient({
                    id: `${prefix}${startId + clientNum}`,
                    x: Math.floor(centers[c].x + distance * Math.cos(angle)),
                    y: Math.floor(centers[c].y + distance * Math.sin(angle)),
                    wait: wait
                });
                clientNum++;
            }
        }
    }

    addLineClients(count, options = {}) {
        const {
            prefix = 'L',
            startId = this.clientCount + 1,
            x1 = 100,
            y1 = 100,
            x2 = this.worldSize - 100,
            y2 = this.worldSize - 100,
            wait = 100
        } = options;
        
        for (let i = 0; i < count; i++) {
            const t = i / (count - 1);
            this.addClient({
                id: `${prefix}${startId + i}`,
                x: Math.floor(x1 + t * (x2 - x1)),
                y: Math.floor(y1 + t * (y2 - y1)),
                wait: wait
            });
        }
    }

    // Add subscription
    addSubscription(clientId, options = {}) {
        const {
            x = Math.floor(Math.random() * this.worldSize),
            y = Math.floor(Math.random() * this.worldSize),
            radius = 200,
            channel = 'channel1',
            wait = 100
        } = options;

        this.script += `subscribe ${clientId} ${x} ${y} ${radius} ${channel}\n`;
        if (wait > 0) this.script += `wait ${wait}\n`;
        
        return this;
    }

    // Add subscription pattern
    addSubscriptions(clients, pattern = 'local', options = {}) {
        const patterns = {
            local: () => this.addLocalSubscriptions(clients, options),
            central: () => this.addCentralSubscriptions(clients, options),
            random: () => this.addRandomSubscriptions(clients, options),
            overlapping: () => this.addOverlappingSubscriptions(clients, options)
        };

        if (patterns[pattern]) {
            patterns[pattern]();
        }
        
        return this;
    }

    addLocalSubscriptions(clients, options = {}) {
        const { radius = 150, channel = 'channel1', wait = 100 } = options;
        
        // Parse existing script to find client positions
        const clientPositions = this.parseClientPositions();
        
        clients.forEach(clientId => {
            const pos = clientPositions[clientId];
            if (pos) {
                this.addSubscription(clientId, {
                    x: pos.x,
                    y: pos.y,
                    radius: radius,
                    channel: channel,
                    wait: wait
                });
            }
        });
    }

    addCentralSubscriptions(clients, options = {}) {
        const {
            centerX = this.worldSize / 2,
            centerY = this.worldSize / 2,
            radius = 300,
            channel = 'channel1',
            wait = 100
        } = options;
        
        clients.forEach(clientId => {
            this.addSubscription(clientId, {
                x: centerX,
                y: centerY,
                radius: radius,
                channel: channel,
                wait: wait
            });
        });
    }

    addRandomSubscriptions(clients, options = {}) {
        const {
            minRadius = 100,
            maxRadius = 400,
            channel = 'channel1',
            wait = 100
        } = options;
        
        clients.forEach(clientId => {
            const radius = Math.floor(Math.random() * (maxRadius - minRadius) + minRadius);
            this.addSubscription(clientId, {
                radius: radius,
                channel: channel,
                wait: wait
            });
        });
    }

    addOverlappingSubscriptions(clients, options = {}) {
        const {
            overlapX = this.worldSize / 2,
            overlapY = this.worldSize / 2,
            minRadius = 200,
            maxRadius = 400,
            channel = 'channel1',
            wait = 100
        } = options;
        
        clients.forEach((clientId, index) => {
            const radius = Math.floor(Math.random() * (maxRadius - minRadius) + minRadius);
            const angle = (2 * Math.PI * index) / clients.length;
            const distance = Math.random() * 200;
            
            this.addSubscription(clientId, {
                x: Math.floor(overlapX + distance * Math.cos(angle)),
                y: Math.floor(overlapY + distance * Math.sin(angle)),
                radius: radius,
                channel: channel,
                wait: wait
            });
        });
    }

    // Add publication
    addPublication(clientId, options = {}) {
        const {
            x = Math.floor(Math.random() * this.worldSize),
            y = Math.floor(Math.random() * this.worldSize),
            radius = 150,
            channel = 'channel1',
            message = `Message from ${clientId}`,
            wait = 500
        } = options;

        this.script += `publish ${clientId} ${x} ${y} ${radius} ${channel} "${message}"\n`;
        if (wait > 0) this.script += `wait ${wait}\n`;
        
        return this;
    }

    // Add multiple publications
    addPublications(publishers, options = {}) {
        publishers.forEach(pub => {
            if (typeof pub === 'string') {
                this.addPublication(pub, options);
            } else {
                this.addPublication(pub.client, { ...options, ...pub });
            }
        });
        
        return this;
    }

    // Helper to parse client positions from script
    parseClientPositions() {
        const positions = {};
        const lines = this.script.split('\n');
        
        lines.forEach(line => {
            const match = line.match(/newClient\s+(\w+)\s+\w+\s+\d+\s+(\d+)\s+(\d+)/);
            if (match) {
                positions[match[1]] = {
                    x: parseInt(match[2]),
                    y: parseInt(match[3])
                };
            }
        });
        
        return positions;
    }

    // Finalize script
    finish(waitTime = 10000) {
        this.script += `\n// End of simulation
wait ${waitTime}
end\n`;
        return this;
    }

    // Get the script
    toString() {
        return this.script;
    }

    // Save to file
    save(filename) {
        fs.writeFileSync(filename, this.script);
        console.log(`Script saved to ${filename}`);
        return this;
    }
}

// Usage examples
if (require.main === module) {
    // Example 1: Basic usage
    const gen1 = new ScriptGenerator()
        .init({ worldSize: 1000 })
        .addClients(10, 'random')
        .addSubscriptions(['C1', 'C2', 'C3', 'C4', 'C5'], 'local', { radius: 200 })
        .addSubscriptions(['C6', 'C7', 'C8', 'C9', 'C10'], 'central', { radius: 300 })
        .addPublications(['C1', 'C5', 'C10'])
        .finish()
        .save('example1_mixed.txt');

     // Example 2: Grid pattern with overlapping subscriptions
    const gen2 = new ScriptGenerator()
        .init({ worldSize: 1000 })
        .addClients(16, 'grid', { prefix: 'G' })
        .addSubscriptions(['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8'], 'overlapping', {
            overlapX: 500,
            overlapY: 500,
            minRadius: 250,
            maxRadius: 350
        })
        .addPublications([
            { client: 'G1', x: 500, y: 500, radius: 200 },
            { client: 'G5', x: 500, y: 500, radius: 200 }
        ])
        .finish()
        .save('example2_grid_overlap.txt');

    // Example 3: Clustered deployment
    const gen3 = new ScriptGenerator()
        .init({ worldSize: 1000 })
        .addClients(20, 'cluster', { clusters: 4, spread: 150 })
        .addSubscriptions(['CL1', 'CL2', 'CL3', 'CL4', 'CL5'], 'local', { radius: 100 })
        .addSubscriptions(['CL6', 'CL7', 'CL8', 'CL9', 'CL10'], 'random', { minRadius: 100, maxRadius: 300 })
        .addPublications(['CL1', 'CL6', 'CL11', 'CL16'])
        .finish()
        .save('example3_clusters.txt');

    // Example 4: Circle formation with central subscriptions
    const gen4 = new ScriptGenerator()
        .init({ worldSize: 800 })
        .addClients(12, 'circle', { radius: 300, prefix: 'R' })
        .addSubscriptions(['R1', 'R2', 'R3', 'R4', 'R5', 'R6'], 'central', { radius: 400 })
        .addSubscriptions(['R7', 'R8', 'R9', 'R10', 'R11', 'R12'], 'local', { radius: 150 })
        .addPublication('R1', { x: 400, y: 400, radius: 350 })
        .finish()
        .save('example4_circle.txt');

    // Example 5: Complex scenario with multiple patterns
    const gen5 = new ScriptGenerator()
        .init({ worldSize: 1200 })
        // Add different client groups
        .addClients(5, 'line', { prefix: 'L', x1: 100, y1: 100, x2: 1100, y2: 100 })
        .addClients(8, 'circle', { prefix: 'C', centerX: 600, centerY: 600, radius: 200 })
        .addClients(10, 'random', { prefix: 'R' })
        // Mixed subscriptions
        .addSubscriptions(['L1', 'L2', 'L3', 'L4', 'L5'], 'local', { radius: 150 })
        .addSubscriptions(['C1', 'C2', 'C3', 'C4'], 'overlapping', { overlapX: 600, overlapY: 600 })
        .addSubscriptions(['R1', 'R2', 'R3', 'R4', 'R5'], 'random')
        // Multiple publications
        .addPublications([
            { client: 'L3', x: 600, y: 100, radius: 200 },
            { client: 'C1', x: 600, y: 600, radius: 300 },
            { client: 'R1', radius: 150 }
        ])
        .finish()
        .save('example5_complex.txt');
}

// Export for use in other scripts
module.exports = ScriptGenerator;