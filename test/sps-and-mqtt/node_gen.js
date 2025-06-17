const fs = require('fs');

// Prompt the user for the necessary details
function promptDetails() {
    const prompt = require('prompt-sync')();
    
    // Prompt for mode (centralized or decentralized)
    let mode = prompt('Choose mode (centralized (c) or decentralized (d)): ').toLowerCase();
    if (mode !== 'centralized' && mode !== 'c' && mode !== 'decentralized' && mode !== 'd') {
        console.log("Invalid input for mode. Please enter either 'centralized (c)' or 'decentralized (d)'.");
        return;
    }
    mode = mode === 'c' || mode === 'centralized' ? 'centralized' : 'decentralized';

    // Prompt for world size
    let worldSize = parseInt(prompt('Enter the world size (e.g., 1000 for 1000x1000 grid): '));
    if (isNaN(worldSize) || worldSize <= 0) {
        console.log("Invalid world size. Please enter a positive integer.");
        return;
    }

    // Default client percentages for simple mode
    let customersPercentage = 60;
    let trucksPercentage = 30;
    let warehousesPercentage = 10;

    // Prompt for the total number of clients to create
    let clientCount = parseInt(prompt('Enter total number of clients to create: '));

    return {
        mode,
        worldSize,
        numCustomers: Math.round((customersPercentage / 100) * clientCount),
        numTrucks: Math.round((trucksPercentage / 100) * clientCount),
        numWarehouses: Math.round((warehousesPercentage / 100) * clientCount),
        clientCount
    };
}

// Generate the simulation script
function generateSimulationScript({ mode, worldSize, numCustomers, numTrucks, numWarehouses, clientCount }) {
    let script = '';

    // Start Gateway (if centralized mode is chosen)
    if (mode === 'centralized') {
        script += `newMatcher GW true localhost 8000 8001 20000 500 500 100\nwait 100\n`;
    }

    // Create clients
    let clientCounter = 1;
    let clients = [];

    // Create Warehouses (WH)
    for (let i = 0; i < numWarehouses; i++) {
        let xCoord = Math.round(Math.random() * worldSize);
        let yCoord = Math.round(Math.random() * worldSize);
        clients.push(`newClient WH${i + 1} localhost 20000 ${xCoord} ${yCoord} 100\n`);
        clientCounter++;
    }

    // Create Trucks (TR)
    for (let i = 0; i < numTrucks; i++) {
        let xCoord = Math.round(Math.random() * worldSize);
        let yCoord = Math.round(Math.random() * worldSize);
        clients.push(`newClient TR${i + 1} localhost 20000 ${xCoord} ${yCoord} 100\n`);
        clientCounter++;
    }

    // Create Customers (CS)
    for (let i = 0; i < numCustomers; i++) {
        let xCoord = Math.round(Math.random() * worldSize);
        let yCoord = Math.round(Math.random() * worldSize);
        clients.push(`newClient CS${i + 1} localhost 20000 ${xCoord} ${yCoord} 100\n`);
        clientCounter++;
    }

    // Add subscriptions (each customer and warehouse subscribes to events)
    let subscriptions = '';
    subscriptions += "wait 500\n";
    for (let i = 0; i < numCustomers; i++) {
        // subscriptions += 'wait 500\n'; // Add a delay before subscriptions
        subscriptions += `\nsubscribe CS${i + 1} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} 100 packageshipped\n`;
        subscriptions += `subscribe CS${i + 1} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} 100 packageintransit\n`;
        subscriptions += `subscribe CS${i + 1} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} 100 packagedelivered\n`;
        subscriptions += `subscribe CS${i + 1} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} 100 packagereadyforpickup\n\n`; // Added subscription for readyforpickup
    }

    for (let i = 0; i < numWarehouses; i++) {
        subscriptions += `subscribe WH${i + 1} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} 100 packageshipped\n`;
        subscriptions += `subscribe WH${i + 1} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} 100 packageintransit\n`;
        subscriptions += `subscribe WH${i + 1} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} 100 packagereadyforpickup\n\n`; // Added subscription for readyforpickup
    }

    for (let i = 0; i < numTrucks; i++) {
        subscriptions += `subscribe TR${i + 1} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} 100 packagereadyforpickup\n`;
        // subscriptions += `subscribe TR${i + 1} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} 100 packageshipped\n`;
        // subscriptions += `subscribe TR${i + 1} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} 100 packageintransit\n`;
        // subscriptions += `subscribe TR${i + 1} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} 100 packagedelivered\n`;
        // subscriptions += `subscribe TR${i + 1} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} 100 packagereturntowarehouse\n`;
    }

    // Add publications (simulating events)
    let publications = '';
    publications += "wait 500\n";
    for (let i = 0; i < numWarehouses; i++) {
        publications += `publish WH${i + 1} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} 10 packagereadyforpickup "Package ready for pickup"\n`;
        publications += 'wait 100\n'; // Add a delay after each publication
        publications += `publish WH${i + 1} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} 10 packageshipped "Package shipped"\n`;
        publications += 'wait 100\n'; // Add a delay after each publication
    }

    for (let i = 0; i < numTrucks; i++) {
        publications += `publish TR${i + 1} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} 10 packageintransit "Package in transit"\n`;
        publications += 'wait 100\n'; // Add a delay after each publication
        publications += `publish TR${i + 1} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} 10 packagedelivered "Package delivered"\n`;
        publications += 'wait 100\n'; // Add a delay after each publication
        publications += `publish TR${i + 1} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} 10 packagereturntowarehouse "Truck returning to warehouse"\n`;
        publications += 'wait 100\n'; // Add a delay after each publication
    }

    // Combine all parts
    script += clients.join('');
    script += subscriptions;
    script += publications;

    // Add a wait command at the end for any final actions
    script += 'wait 1000\nend\n';

    return script;
}

// Main Execution
const simulationDetails = promptDetails();
if (simulationDetails) {
    const simulationScript = generateSimulationScript(simulationDetails);

    // Save to file
    fs.writeFileSync('simulationScript.txt', simulationScript);
    console.log('Simulation script generated and saved to simulationScript.txt.');
}