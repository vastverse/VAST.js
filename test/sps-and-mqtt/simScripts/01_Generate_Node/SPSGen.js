const fs = require('fs');
const path = require('path');
const { SCALE, ZONE_PATTERNS, TOPICS } = require('./constants');

class ConfigurationManager {
    static parseConfig(filename) {
        try {
            const content = fs.readFileSync(filename, 'utf8');
            const config = {};
            
            content.split('\n').forEach(line => {
                line = line.trim();
                if (line && !line.startsWith('#')) {
                    const [key, value] = line.split('=');
                    if (key && value) {
                        config[key.trim()] = value.trim();
                    }
                }
            });

            // Parse scales
            const scales = config.scales.split(',')
                .map(s => s.trim().toUpperCase())
                .filter(s => SCALE[s]);

            // Parse patterns
            const patterns = config.patterns.split(',')
                .map(p => p.trim().toUpperCase())
                .filter(p => ZONE_PATTERNS[p]);

            return {
                mode: config.mode,
                scales: scales,
                patterns: patterns,
                clientTypePercentages: {
                    customers: parseInt(config['clients.customers']),
                    trucks: parseInt(config['clients.trucks']),
                    warehouses: parseInt(config['clients.warehouses'])
                }
            };
        } catch (error) {
            console.error('Error reading config file:', error);
            return null;
        }
    }

    static generateConfigurations(config) {
        const configurations = [];

        config.scales.forEach(scale => {
            config.patterns.forEach(pattern => {
                configurations.push({
                    mode: config.mode,
                    worldSize: SCALE[scale].clients * 10,
                    scale: SCALE[scale],
                    totalClients: SCALE[scale].clients,
                    zoneDistribution: ZONE_PATTERNS[pattern].distribution,
                    clientTypePercentages: config.clientTypePercentages,
                    patternName: ZONE_PATTERNS[pattern].name
                });
            });
        });

        return configurations;
    }

    static validateConfiguration(config) {
        const clientSum = Object.values(config.clientTypePercentages).reduce((a, b) => a + b, 0);
        if (clientSum !== 100) {
            console.error('Client type percentages must sum to 100');
            return false;
        }
        return true;
    }
}

class ZoneManager {
    static createZones(worldSize) {
        const halfX = Math.floor(worldSize / 2);
        const halfY = Math.floor(worldSize / 2);

        return [
            { 
                name: 'NW', 
                x: [0, halfX - 1],           
                y: [0, halfY - 1]            
            },
            { 
                name: 'NE', 
                x: [halfX, worldSize - 1],   
                y: [0, halfY - 1]            
            },
            { 
                name: 'SW', 
                x: [0, halfX - 1], 
                y: [halfY, worldSize - 1]    
            },
            { 
                name: 'SE', 
                x: [halfX, worldSize - 1], 
                y: [halfY, worldSize - 1]    
            }
        ];
    }

    static getRandomCoordinatesInZone(zone) {
        const x = Math.floor(Math.random() * (zone.x[1] - zone.x[0] + 1)) + zone.x[0];
        const y = Math.floor(Math.random() * (zone.y[1] - zone.y[0] + 1)) + zone.y[0];
        return { x, y };
    }

    static calculateZoneRadius(zone, minRadiusPercent = 0.05, maxRadiusPercent = 0.20) {
        const zoneWidth = zone.x[1] - zone.x[0] + 1;
        const zoneHeight = zone.y[1] - zone.y[0] + 1;
        
        const minRadius = Math.floor(Math.min(zoneWidth, zoneHeight) * minRadiusPercent);
        const maxRadius = Math.floor(Math.min(zoneWidth, zoneHeight) * maxRadiusPercent);
        
        const radius = Math.max(1, 
            Math.floor(Math.random() * (maxRadius - minRadius + 1)) + minRadius
        );
        
        return radius;
    }

    static validateCoordinateInZone(coordinate, zone) {
        return (
            coordinate.x >= zone.x[0] && 
            coordinate.x <= zone.x[1] && 
            coordinate.y >= zone.y[0] && 
            coordinate.y <= zone.y[1]
        );
    }
}
class ScriptGenerator {
    static generateSimulationScript(config) {
        let script = '';
        const zones = ZoneManager.createZones(config.worldSize);
        const clientRegistry = {};

        if (config.mode === 'centralized') {
            script += `newMatcher GW true localhost 8000 8001 20000 500 500 100\nwait 300\n`;
        }

        // Create all clients with their subscriptions immediately after
        zones.forEach(zone => {
            const zoneClientsCount = Math.round((config.zoneDistribution[zone.name] / 100) * config.totalClients);
            const { script: zoneScript, clients } = this.generateZoneClientsWithRegistry(zone, zoneClientsCount, config.clientTypePercentages);
            script += zoneScript;
            clientRegistry[zone.name] = clients;
        });

        // Add big delay after all clients are created and subscribed
        script += 'wait 30000\n';

        // Generate publications
        script += this.generatePublicationsFromRegistry(clientRegistry);
        script += 'wait 3000\nend\n';
        
        return script;
    }

    static generateZoneClientsWithRegistry(zone, clientCount, percentages) {
        let script = '';
        const clients = {
            warehouses: [],
            trucks: [],
            customers: []
        };
        
        const warehouses = Math.round((percentages.warehouses / 100) * clientCount);
        const trucks = Math.round((percentages.trucks / 100) * clientCount);
        const customers = Math.round((percentages.customers / 100) * clientCount);

        // Generate warehouses
        for (let i = 0; i < warehouses; i++) {
            const coords = ZoneManager.getRandomCoordinatesInZone(zone);
            const radius = ZoneManager.calculateZoneRadius(zone);
            const clientName = `WH${zone.name}${i + 1}`;
            
            clients.warehouses.push({ name: clientName, coords, radius });
            script += `\nnewClient ${clientName} localhost 20000 ${coords.x} ${coords.y} ${radius}\nwait 300\n`;
            
            // Add subscriptions immediately after client creation
            TOPICS.WAREHOUSE.SUBSCRIBE.forEach(topic => {
                script += `subscribe ${clientName} ${coords.x} ${coords.y} ${radius} ${topic}\nwait 300\n`;
            });
        }

        // Generate trucks
        for (let i = 0; i < trucks; i++) {
            const coords = ZoneManager.getRandomCoordinatesInZone(zone);
            const radius = ZoneManager.calculateZoneRadius(zone);
            const clientName = `TR${zone.name}${i + 1}`;
            
            clients.trucks.push({ name: clientName, coords, radius });
            script += `newClient ${clientName} localhost 20000 ${coords.x} ${coords.y} ${radius}\nwait 300\n`;
            
            // Add subscriptions immediately after client creation
            TOPICS.TRUCK.SUBSCRIBE.forEach(topic => {
                script += `subscribe ${clientName} ${coords.x} ${coords.y} ${radius} ${topic}\nwait 300\n`;
            });
        }

        // Generate customers
        for (let i = 0; i < customers; i++) {
            const coords = ZoneManager.getRandomCoordinatesInZone(zone);
            const radius = ZoneManager.calculateZoneRadius(zone);
            const clientName = `CS${zone.name}${i + 1}`;
            
            clients.customers.push({ name: clientName, coords, radius });
            script += `newClient ${clientName} localhost 20000 ${coords.x} ${coords.y} ${radius}\nwait 300\n`;
            
            // Add subscriptions immediately after client creation
            TOPICS.CUSTOMER.SUBSCRIBE.forEach(topic => {
                script += `subscribe ${clientName} ${coords.x} ${coords.y} ${radius} ${topic}\nwait 300\n`;
            });
        }

        return { script, clients };
    }

    static generateSubscriptionsFromRegistry(clientRegistry) {
        let script = '';
        
        Object.entries(clientRegistry).forEach(([zoneName, clients]) => {
            // Warehouses subscribe
            clients.warehouses.forEach(client => {
                TOPICS.WAREHOUSE.SUBSCRIBE.forEach(topic => {
                    script += `subscribe ${client.name} ${client.coords.x} ${client.coords.y} ${client.radius} ${topic}\nwait 300\n`;
                });
            });

            // Trucks subscribe
            clients.trucks.forEach(client => {
                TOPICS.TRUCK.SUBSCRIBE.forEach(topic => {
                    script += `subscribe ${client.name} ${client.coords.x} ${client.coords.y} ${client.radius} ${topic}\nwait 300\n`;
                });
            });

            // Customers subscribe
            clients.customers.forEach(client => {
                TOPICS.CUSTOMER.SUBSCRIBE.forEach(topic => {
                    script += `subscribe ${client.name} ${client.coords.x} ${client.coords.y} ${client.radius} ${topic}\nwait 300\n`;
                });
            });
        });

        return script;
    }

    static generatePublicationsFromRegistry(clientRegistry) {
        let script = 'wait 30000\n';
        
        Object.entries(clientRegistry).forEach(([zoneName, clients]) => {
            // Warehouses publish
            clients.warehouses.forEach(client => {
                TOPICS.WAREHOUSE.PUBLISH.forEach(topic => {
                    script += `publish ${client.name} ${client.coords.x} ${client.coords.y} ${client.radius} ${topic} "Sample ${topic} message"\nwait 300\n`;
                });
            });

            // Trucks publish
            clients.trucks.forEach(client => {
                TOPICS.TRUCK.PUBLISH.forEach(topic => {
                    script += `publish ${client.name} ${client.coords.x} ${client.coords.y} ${client.radius} ${topic} "Sample ${topic} message"\nwait 300\n`;
                });
            });

            // Customers publish
            clients.customers.forEach(client => {
                TOPICS.CUSTOMER.PUBLISH.forEach(topic => {
                    script += `publish ${client.name} ${client.coords.x} ${client.coords.y} ${client.radius} ${topic} "Sample ${topic} message"\nwait 300\n`;
                });
            });
        });

        return script;
    }
}

class OutputManager {
    static saveScripts(configurations) {
        // Create main directory with date and timestamp
        const now = new Date();
        const date = now.toISOString().split('T')[0]; // Gets YYYY-MM-DD
        const timestamp = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // Gets HH-MM-SS
        const mainDirName = `Scripts_${date}_${timestamp}`;
        
        if (!fs.existsSync(mainDirName)) {
            fs.mkdirSync(mainDirName);
        }

        // Create THREE subdirectories
        const spsDir = path.join(mainDirName, 'sps');
        const spmqttDir = path.join(mainDirName, 'spmqtt');
        const mqttDir = path.join(mainDirName, 'mqtt');
        
        if (!fs.existsSync(spsDir)) {
            fs.mkdirSync(spsDir);
        }
        
        if (!fs.existsSync(spmqttDir)) {
            fs.mkdirSync(spmqttDir);
        }
        
        if (!fs.existsSync(mqttDir)) {
            fs.mkdirSync(mqttDir);
        }

        // Generate and save scripts for each configuration
        configurations.forEach(config => {
            const scriptFileName = `simulation_${config.scale.name.toLowerCase()}_${config.patternName}.txt`;
            const script = ScriptGenerator.generateSimulationScript(config);
            
            // Save to sps and spmqtt subdirectories (mqtt will be generated separately)
            fs.writeFileSync(
                path.join(spsDir, scriptFileName),
                script
            );
            
            fs.writeFileSync(
                path.join(spmqttDir, scriptFileName),
                script
            );
            
            console.log(`Generated: ${scriptFileName} (saved to sps and spmqtt folders)`);
        });

        console.log(`\nAll scripts saved in directory: ${mainDirName}`);
        console.log(`├── sps/`);
        console.log(`├── spmqtt/`);
        console.log(`└── mqtt/ (empty - use mqtt_generator.js to populate)`);
    }
}

function main() {
    const configFile = process.argv[2] || 'config.txt';
    
    const baseConfig = ConfigurationManager.parseConfig(configFile);
    if (!baseConfig || !ConfigurationManager.validateConfiguration(baseConfig)) {
        console.error('Invalid configuration');
        return;
    }

    const configurations = ConfigurationManager.generateConfigurations(baseConfig);
    OutputManager.saveScripts(configurations);
}

main();