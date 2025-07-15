// 
const readline = require('readline');
const ScriptGenerator = require('./generator');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function question(prompt) {
    return new Promise(resolve => {
        rl.question(prompt, resolve);
    });
}

async function interactiveGenerate() {
    console.log('=== Spatial Pub/Sub Script Generator ===\n');
    
    const gen = new ScriptGenerator();
    
    // World setup
    const worldSize = parseInt(await question('World size (default 1000): ')) || 1000;
    gen.init({ worldSize });
    
    // Clients
    const numClients = parseInt(await question('Number of clients: '));
    const patterns = ['random', 'grid', 'circle', 'cluster', 'line'];
    console.log('Available patterns:', patterns.join(', '));
    const pattern = await question('Client pattern (default random): ') || 'random';
    
    if (pattern === 'cluster') {
        const clusters = parseInt(await question('Number of clusters (default 3): ')) || 3;
        gen.addClients(numClients, pattern, { clusters });
    } else {
        gen.addClients(numClients, pattern);
    }
    
    // Subscriptions
    const subPercent = parseInt(await question('Percentage of clients that subscribe (0-100): ')) || 80;
    const numSubs = Math.floor(numClients * subPercent / 100);
    
    const clientIds = [];
    for (let i = 1; i <= numSubs; i++) {
        clientIds.push(`C${i}`);
    }
    
    console.log('Subscription patterns: local, central, random, overlapping');
    const subPattern = await question('Subscription pattern (default local): ') || 'local';
    const subRadius = parseInt(await question('Average subscription radius: ')) || 200;
    
    gen.addSubscriptions(clientIds, subPattern, { radius: subRadius });
    
    // Publications
    const numPubs = parseInt(await question('Number of publishers: '));
    const publishers = [];
    for (let i = 1; i <= numPubs; i++) {
        publishers.push(`C${i}`);
    }
    gen.addPublications(publishers);
    
    // Save
    const filename = await question('Output filename: ') || 'generated_script.txt';
    gen.finish().save(filename);
    
    console.log(`\nScript generated successfully: ${filename}`);
    rl.close();
}

if (require.main === module) {
    interactiveGenerate().catch(console.error);
}