// scriptGenerator.js
const fs = require('fs');

class SimulationScriptGenerator {
    constructor(config = {}) {
        this.worldSize = config.worldSize || 1000;
        this.gatewayPort = config.gatewayPort || 20000;
        this.gatewayX = config.gatewayX || this.worldSize / 2;
        this.gatewayY = config.gatewayY || this.worldSize / 2;
        this.clientIdPrefix = config.clientIdPrefix || 'C';
        this.channelName = config.channelName || 'channel1';
        this.waitBetweenClients = config.waitBetweenClients || 100;
        this.waitBetweenOperations = config.waitBetweenOperations || 200;
    }

    // Generate random position within world bounds
    randomPosition(margin = 50) {
        return {
            x: Math.floor(Math.random() * (this.worldSize - 2 * margin)) + margin,
            y: Math.floor(Math.random() * (this.worldSize - 2 * margin)) + margin
        };
    }

    // Generate position in a specific region
    positionInRegion(region) {
        const regionSize = this.worldSize / 3;
        const regions = {
            'top-left': { minX: 0, maxX: regionSize, minY: 0, maxY: regionSize },
            'top-center': { minX: regionSize, maxX: 2 * regionSize, minY: 0, maxY: regionSize },
            'top-right': { minX: 2 * regionSize, maxX: this.worldSize, minY: 0, maxY: regionSize },
            'center-left': { minX: 0, maxX: regionSize, minY: regionSize, maxY: 2 * regionSize },
            'center': { minX: regionSize, maxX: 2 * regionSize, minY: regionSize, maxY: 2 * regionSize },
            'center-right': { minX: 2 * regionSize, maxX: this.worldSize, minY: regionSize, maxY: 2 * regionSize },
            'bottom-left': { minX: 0, maxX: regionSize, minY: 2 * regionSize, maxY: this.worldSize },
            'bottom-center': { minX: regionSize, maxX: 2 * regionSize, minY: 2 * regionSize, maxY: this.worldSize },
            'bottom-right': { minX: 2 * regionSize, maxX: this.worldSize, minY: 2 * regionSize, maxY: this.worldSize }
        };

        const r = regions[region] || regions['center'];
        return {
            x: Math.floor(Math.random() * (r.maxX - r.minX)) + r.minX,
            y: Math.floor(Math.random() * (r.maxY - r.minY)) + r.minY
        };
    }

    // Generate a basic script with N clients
    generateBasicScript(numClients, numPublishers = 1) {
        let script = this.generateHeader();
        
        // Create clients
        const clients = [];
        for (let i = 1; i <= numClients; i++) {
            const pos = this.randomPosition();
            const client = {
                id: `${this.clientIdPrefix}${i}`,
                x: pos.x,
                y: pos.y,
                radius: 100
            };
            clients.push(client);
            script += `newClient ${client.id} localhost ${this.gatewayPort} ${client.x} ${client.y} ${client.radius}\n`;
            if (i < numClients) {
                script += `wait ${this.waitBetweenClients}\n`;
            }
        }

        script += '\n// Subscriptions\n';
        
        // Create subscriptions
        clients.forEach((client, index) => {
            const subPos = this.randomPosition();
            const radius = Math.floor(Math.random() * 300) + 100; // 100-400
            script += `subscribe ${client.id} ${subPos.x} ${subPos.y} ${radius} ${this.channelName}\n`;
            script += `wait ${this.waitBetweenOperations}\n`;
        });

        script += '\n// Publications\n';
        
        // Create publications from first N publishers
        for (let i = 0; i < Math.min(numPublishers, clients.length); i++) {
            const client = clients[i];
            const pubPos = this.randomPosition();
            const radius = Math.floor(Math.random() * 200) + 100; // 100-300
            script += `publish ${client.id} ${pubPos.x} ${pubPos.y} ${radius} ${this.channelName} "Message from ${client.id}"\n`;
            if (i < numPublishers - 1) {
                script += `wait 500\n`;
            }
        }

        script += this.generateFooter();
        return script;
    }

    // Generate a grid-based distribution
    generateGridScript(gridSize, publishersPerRegion = 1) {
        const numClients = gridSize * gridSize;
        let script = this.generateHeader();
        
        const cellSize = this.worldSize / gridSize;
        const clients = [];
        
        // Create clients in grid formation
        script += '// Create clients in grid formation\n';
        for (let row = 0; row < gridSize; row++) {
            for (let col = 0; col < gridSize; col++) {
                const clientNum = row * gridSize + col + 1;
                const x = Math.floor(col * cellSize + cellSize / 2);
                const y = Math.floor(row * cellSize + cellSize / 2);
                
                const client = {
                    id: `${this.clientIdPrefix}${clientNum}`,
                    x: x,
                    y: y,
                    radius: 100,
                    row: row,
                    col: col
                };
                clients.push(client);
                
                script += `newClient ${client.id} localhost ${this.gatewayPort} ${x} ${y} ${client.radius}\n`;
                script += `wait ${this.waitBetweenClients}\n`;
            }
        }

        // Create subscriptions centered on each cell
        script += '\n// Grid-based subscriptions\n';
        clients.forEach(client => {
            const radius = Math.floor(cellSize / 2);
            script += `subscribe ${client.id} ${client.x} ${client.y} ${radius} ${this.channelName}\n`;
            script += `wait ${this.waitBetweenOperations}\n`;
        });

        // Create publications
        script += '\n// Publications from selected cells\n';
        for (let i = 0; i < Math.min(publishersPerRegion * gridSize, clients.length); i++) {
            const client = clients[i];
            const radius = Math.floor(cellSize / 3);
            script += `publish ${client.id} ${client.x} ${client.y} ${radius} ${this.channelName} "Grid message from ${client.id}"\n`;
            script += `wait 500\n`;
        }

        script += this.generateFooter();
        return script;
    }

    // Generate overlapping pub/sub scenario
    generateOverlappingScript(numClusters, clientsPerCluster, overlapRadius) {
        let script = this.generateHeader();
        
        const clusterCenters = [];
        const clients = [];
        let clientId = 1;

        // Generate cluster centers
        for (let i = 0; i < numClusters; i++) {
            const center = this.randomPosition(overlapRadius);
            clusterCenters.push(center);
        }

        // Create clients for each cluster
        script += '// Create clients in clusters\n';
        clusterCenters.forEach((center, clusterIndex) => {
            for (let i = 0; i < clientsPerCluster; i++) {
                // Position clients around cluster center
                const angle = (2 * Math.PI * i) / clientsPerCluster;
                const distance = Math.random() * overlapRadius / 2;
                const x = Math.floor(center.x + distance * Math.cos(angle));
                const y = Math.floor(center.y + distance * Math.sin(angle));

                const client = {
                    id: `${this.clientIdPrefix}${clientId}`,
                    x: x,
                    y: y,
                    radius: 100,
                    cluster: clusterIndex,
                    clusterCenter: center
                };
                clients.push(client);
                clientId++;

                script += `newClient ${client.id} localhost ${this.gatewayPort} ${x} ${y} ${client.radius}\n`;
                script += `wait ${this.waitBetweenClients}\n`;
            }
        });

        // Create overlapping subscriptions
        script += '\n// Create overlapping subscriptions for each cluster\n';
        clients.forEach(client => {
            // Subscribe to own cluster area
            script += `subscribe ${client.id} ${client.clusterCenter.x} ${client.clusterCenter.y} ${overlapRadius} ${this.channelName}\n`;
            script += `wait ${this.waitBetweenOperations}\n`;
        });

        // Create publications from cluster centers
        script += '\n// Publish from cluster centers\n';
        clusterCenters.forEach((center, index) => {
            const publisherId = clients.find(c => c.cluster === index).id;
            script += `publish ${publisherId} ${center.x} ${center.y} ${overlapRadius / 2} ${this.channelName} "Cluster ${index} broadcast"\n`;
            script += `wait 500\n`;
        });

        script += this.generateFooter();
        return script;
    }

    // Generate a scenario with hotspots
    generateHotspotScript(numClients, numHotspots, hotspotRadius) {
        let script = this.generateHeader();
        
        // Generate hotspots
        const hotspots = [];
        for (let i = 0; i < numHotspots; i++) {
            hotspots.push(this.randomPosition(hotspotRadius));
        }

        // Create clients
        const clients = [];
        script += '// Create clients with bias towards hotspots\n';
        
        for (let i = 1; i <= numClients; i++) {
            let x, y;
            
            // 70% chance to be near a hotspot
            if (Math.random() < 0.7 && hotspots.length > 0) {
                const hotspot = hotspots[Math.floor(Math.random() * hotspots.length)];
                const angle = Math.random() * 2 * Math.PI;
                const distance = Math.random() * hotspotRadius;
                x = Math.floor(hotspot.x + distance * Math.cos(angle));
                y = Math.floor(hotspot.y + distance * Math.sin(angle));
                
                // Ensure within bounds
                x = Math.max(50, Math.min(this.worldSize - 50, x));
                y = Math.max(50, Math.min(this.worldSize - 50, y));
            } else {
                const pos = this.randomPosition();
                x = pos.x;
                y = pos.y;
            }

            const client = {
                id: `${this.clientIdPrefix}${i}`,
                x: x,
                y: y,
                radius: 100
            };
            clients.push(client);

            script += `newClient ${client.id} localhost ${this.gatewayPort} ${x} ${y} ${client.radius}\n`;
            script += `wait ${this.waitBetweenClients}\n`;
        }

        // Subscriptions focused on hotspots
        script += '\n// Subscriptions focused on hotspots\n';
        clients.forEach((client, index) => {
            if (index < numHotspots && hotspots[index]) {
                // First few clients subscribe to hotspot areas
                const hotspot = hotspots[index];
                script += `subscribe ${client.id} ${hotspot.x} ${hotspot.y} ${hotspotRadius} ${this.channelName}\n`;
            } else {
                // Others subscribe to their local area
                const radius = Math.floor(Math.random() * 200) + 100;
                script += `subscribe ${client.id} ${client.x} ${client.y} ${radius} ${this.channelName}\n`;
            }
            script += `wait ${this.waitBetweenOperations}\n`;
        });

        // Publish from hotspots
        script += '\n// Publish from hotspot areas\n';
        hotspots.forEach((hotspot, index) => {
            if (index < clients.length) {
                script += `publish ${clients[index].id} ${hotspot.x} ${hotspot.y} ${hotspotRadius / 2} ${this.channelName} "Hotspot ${index} message"\n`;
                script += `wait 500\n`;
            }
        });

        script += this.generateFooter();
        return script;
    }

    generateHeader() {
        return `// Auto-generated simulation script
// Generated at: ${new Date().toISOString()}
// World size: ${this.worldSize}x${this.worldSize}

// Start the Gateway matcher
newMatcher GW true localhost 8000 8001 ${this.gatewayPort} ${this.gatewayX} ${this.gatewayY} 1500
wait 100

`;
    }

    generateFooter() {
        return `
// End of simulation; wait for pending operations
wait 10000
end
`;
    }

    // Save script to file
    saveToFile(script, filename) {
        fs.writeFileSync(filename, script);
        console.log(`Script saved to ${filename}`);
    }
}

// Example usage
if (require.main === module) {
    const generator = new SimulationScriptGenerator({
        worldSize: 1000,
        gatewayPort: 20000
    });

    // Generate different types of scripts
    console.log('Generating simulation scripts...\n');

    // 1. Basic random distribution
    const basicScript = generator.generateBasicScript(20, 5);
    generator.saveToFile(basicScript, 'basic_20_clients.txt');

    // 2. Grid distribution
    const gridScript = generator.generateGridScript(5, 2);
    generator.saveToFile(gridScript, 'grid_5x5.txt');

    // 3. Overlapping clusters
    const overlapScript = generator.generateOverlappingScript(4, 5, 300);
    generator.saveToFile(overlapScript, 'overlapping_clusters.txt');

    // 4. Hotspot scenario
    const hotspotScript = generator.generateHotspotScript(30, 3, 250);
    generator.saveToFile(hotspotScript, 'hotspot_scenario.txt');

    // 5. Large scale test
    const largeScript = generator.generateBasicScript(100, 10);
    generator.saveToFile(largeScript, 'large_scale_100.txt');
}

module.exports = SimulationScriptGenerator;