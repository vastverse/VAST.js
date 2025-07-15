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

    // Create clients and their subscriptions in strict sequence
    let scriptClients = '';

    // Warehouses (WH)
    for (let i = 0; i < numWarehouses; i++) {
        let xCoord = Math.round(Math.random() * worldSize);
        let yCoord = Math.round(Math.random() * worldSize);
        const clientName = `WH${i + 1}`;
        scriptClients += `newClient ${clientName} localhost 20000 ${xCoord} ${yCoord} ${worldSize * 1000}\nwait 100\n`;
        scriptClients += `subscribe ${clientName} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} ${worldSize * 1000} packageshipped\nwait 100\n`;
        scriptClients += `subscribe ${clientName} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} ${worldSize * 1000} packageintransit\nwait 100\n`;
        scriptClients += `subscribe ${clientName} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} ${worldSize * 1000} packagereadyforpickup\nwait 100\n`;
        scriptClients += `\n`;
    }

    // Trucks (TR)
    for (let i = 0; i < numTrucks; i++) {
        let xCoord = Math.round(Math.random() * worldSize);
        let yCoord = Math.round(Math.random() * worldSize);
        const clientName = `TR${i + 1}`;
        scriptClients += `newClient ${clientName} localhost 20000 ${xCoord} ${yCoord} ${worldSize * 1000}\nwait 100\n`;
        scriptClients += `subscribe ${clientName} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} ${worldSize * 1000} packagereadyforpickup\nwait 100\n`;
        scriptClients += `\n`;
    }

    // Customers (CS)
    for (let i = 0; i < numCustomers; i++) {
        let xCoord = Math.round(Math.random() * worldSize);
        let yCoord = Math.round(Math.random() * worldSize);
        const clientName = `CS${i + 1}`;
        scriptClients += `newClient ${clientName} localhost 20000 ${xCoord} ${yCoord} ${worldSize * 1000}\nwait 100\n`;
        scriptClients += `subscribe ${clientName} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} ${worldSize * 1000} packageshipped\nwait 100\n`;
        scriptClients += `subscribe ${clientName} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} ${worldSize * 1000} packageintransit\nwait 100\n`;
        scriptClients += `subscribe ${clientName} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} ${worldSize * 1000} packagedelivered\nwait 100\n`;
        scriptClients += `subscribe ${clientName} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} ${worldSize * 1000} packagereadyforpickup\nwait 100\n`;
        scriptClients += `\n`;
    }

    // Add publications (simulating events)
    let publications = '';
    publications += "wait 500\n";
    for (let i = 0; i < numWarehouses; i++) {
        publications += `publish WH${i + 1} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} ${worldSize * 1000} packagereadyforpickup \"Package ready for pickup\"\nwait 100\n`;
        publications += 'publish WH' + (i + 1) + ' ' + Math.round(Math.random() * 1000) + ' ' + Math.round(Math.random() * 1000) + ' ' + (worldSize * 1000) + ' packageshipped "Package shipped"\nwait 100\n';
    }

    for (let i = 0; i < numTrucks; i++) {
        publications += `publish TR${i + 1} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} ${worldSize * 1000} packageintransit \"Package in transit\"\nwait 100\n`;
        publications += `publish TR${i + 1} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} ${worldSize * 1000} packagedelivered \"Package delivered\"\nwait 100\n`;
        publications += `publish TR${i + 1} ${Math.round(Math.random() * 1000)} ${Math.round(Math.random() * 1000)} ${worldSize * 1000} packagereturntowarehouse \"Truck returning to warehouse\"\nwait 100\n`;
    }

    // Combine all parts
    script += scriptClients;
    script += 'wait 500\n';
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