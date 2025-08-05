const { exec } = require('child_process');
const path = require('path');

async function runCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${error}`);
                reject(error);
                return;
            }
            console.log(stdout);
            if (stderr) console.error(`stderr: ${stderr}`);
            resolve(stdout);
        });
    });
}

async function main() {
    try {
        // Step 1: Generate simulation scripts
        console.log('Generating simulation scripts...');
        await runCommand('node SPSGen.js');

        // Step 2: Get the most recently created Scripts_ directory
        const fs = require('fs');
        const directories = fs.readdirSync('.')
            .filter(file => fs.statSync(file).isDirectory())
            .filter(dir => dir.startsWith('Scripts_'))
            .sort()
            .reverse();

        if (directories.length === 0) {
            throw new Error('No Scripts_ directory found');
        }

        const mostRecentDir = directories[0];
        console.log(`\nMost recent scripts directory: ${mostRecentDir}`);

        // Step 3: Run analysis on the generated scripts
        console.log('\nAnalyzing simulations...');
        await runCommand(`node MQTTGenfromSPS.js ${mostRecentDir}`);

        console.log('\nSimulation process completed successfully!');

    } catch (error) {
        console.error('Error during simulation process:', error);
    }
}

main();