// sps_simulator.js -- Interactive, multi-script SPS simulation runner

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const matcher = require('../../../lib/matcher.js');
const client = require('../../../lib/client.js');
// const LOG = require('../../../lib/log.js'); // Adjust per your project
var log = LOG.newLayer('Simulator_logs', 'Simulator_logs', '../logs/sps_events', 5, 5);

class SPSSimulator {
    constructor() {
        this.baseLogs = path.join(__dirname, '../logs/sps_events');
        this.setupLogging();
    }

    setupLogging() {
        fs.mkdirSync(this.baseLogs, { recursive: true });
        // Top-level log
        this.mainLog = LOG.newLayer('SPSMain', 'SPSMain', this.baseLogs, 5, 5);
        this.setCurrentLog(this.baseLogs);
    }

    setCurrentLog(dir) {
        // switch or re-init log file (if you want per-simulation logs)
        this.log = LOG.newLayer('Simulator_logs', 'Simulator_logs', dir, 5, 5);
    }

    resetState() {
        // State for each run
        this.matchers = {};
        this.matcherIDs2alias = {};
        this.clients = {};
        this.clientIDs2alias = {};
        this.instructions = [];
    }

    findScriptDirectories(baseDir) {
        return fs.readdirSync(baseDir)
            .filter(name => name.startsWith('Scripts_') &&
                fs.statSync(path.join(baseDir, name)).isDirectory())
            .map(name => ({
                name,
                path: path.join(baseDir, name),
                timestamp: this.extractTimestamp(name)
            }))
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    extractTimestamp(dirName) {
        const m = dirName.match(/Scripts_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})/);
        if (!m) return 0;
        return new Date(`${m[1]}T${m[2].replace(/-/g, ':')}`).getTime();
    }

    findSPSScripts(scriptsDir) {
    // Always look only in sps/ subfolder
    const spsSub = path.join(scriptsDir, 'sps');
    if (!fs.existsSync(spsSub) || !fs.statSync(spsSub).isDirectory()) {
        // No sps/ subfolder, so no SPS scripts for this dir
        return [];
    }
    return fs.readdirSync(spsSub)
        .filter(file =>
            (file.startsWith('sps_simulation_') || file.startsWith('simulation_')) &&
            file.endsWith('.txt')
        )
        .map(file => ({
            name: file,
            path: path.join(spsSub, file),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}


    async showScriptMenu(scriptDirs) {
        console.log('\nAvailable Folders:');
        scriptDirs.forEach((d, i) => {
            console.log(` ${i + 1}. ${d.name} (${new Date(d.timestamp).toLocaleString()})`);
        });
        console.log(' 0. Exit');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise(resolve => rl.question('\nSelect directory: ', resolve));
        rl.close();
        const idx = parseInt(answer);
        if (idx === 0) process.exit(0);
        if (idx > 0 && idx <= scriptDirs.length)
            return scriptDirs[idx - 1];
        console.error('Invalid choice.');
        process.exit(1);
    }

    async showSPSScriptMenu(spsScripts) {
        console.log('\nAvailable SPS Scripts:');
        spsScripts.forEach((scr, i) => {
            console.log(` ${i + 1}. ${scr.name}`);
        });
        console.log(' 0. Run all scripts sequentially');
        console.log(' -1. Back to directory selection');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise(resolve => rl.question('\nSelect script: ', resolve));
        rl.close();
        const idx = parseInt(answer);
        if (idx === -1) return 'back';
        if (idx === 0) return 'all';
        if (idx > 0 && idx <= spsScripts.length)
            return spsScripts[idx - 1];
        console.error('Invalid script choice.');
        process.exit(1);
    }

    updateLogPaths(simLogDir) {
        this.setCurrentLog(simLogDir);
    }

    async dataFromTextFiles(filename) {
        try {
            const lines = [];
            const rl = readline.createInterface({ input: fs.createReadStream(filename), crlfDelay: Infinity });
            for await (const data of rl) {
                let dataLine = [], cur = "", isString = 0;
                for (let d of data) {
                    if (d === '"') isString = 1 - isString;
                    else if (isString === 1) cur += d;
                    else if ((d >= "a" && d <= "z") || (d >= "A" && d <= "Z") ||
                        (d >= "0" && d <= "9") || d === "/") cur += d;
                    else {
                        if (cur.length !== 0) dataLine.push(cur);
                        cur = "";
                    }
                }
                if (cur.length !== 0) dataLine.push(cur);
                lines.push(dataLine);
            }
            return lines;
        } catch (e) {
            this.log.error("Error reading script: " + e.stack);
            throw e;
        }
    }

    async loadAndPrepareInstructions(scriptPath) {
        // Fills this.instructions from file as in your original
        this.instructions = [];
        const dataFromTextFile = await this.dataFromTextFiles(scriptPath);
        let i = 1;
        for (const dataLine of dataFromTextFile) {
            switch (dataLine[0]) {
                case "wait":
                    if (dataLine.length !== 2) this.error(`wrong input in line number ${i}`);
                    this.instructions.push(new Instruction(dataLine[0], { waitTime: dataLine[1] }));
                    i++; break;
                case "newMatcher":
                    if (dataLine.length !== 10) this.error(`wrong input in line number ${i}`);
                    this.instructions.push(new Instruction(dataLine[0], {
                        alias: dataLine[1],
                        isGateway: dataLine[2] === "true",
                        GW_host: dataLine[3],
                        GW_port: Number(dataLine[4]),
                        VON_port: Number(dataLine[5]),
                        client_port: Number(dataLine[6]),
                        x: Number(dataLine[7]),
                        y: Number(dataLine[8]),
                        radius: Number(dataLine[9])
                    }));
                    i++; break;
                case "newClient":
                    if (dataLine.length !== 7) this.error(`wrong input in line number ${i}`);
                    this.instructions.push(new Instruction(dataLine[0], {
                        alias: dataLine[1],
                        host: dataLine[2],
                        port: Number(dataLine[3]),
                        x: Number(dataLine[4]),
                        y: Number(dataLine[5]),
                        radius: Number(dataLine[6])
                    }));
                    i++; break;
                case "subscribe":
                    if (dataLine.length !== 6) this.error(`wrong input in line number ${i}`);
                    this.instructions.push(new Instruction(dataLine[0], {
                        alias: dataLine[1],
                        x: Number(dataLine[2]),
                        y: Number(dataLine[3]),
                        radius: Number(dataLine[4]),
                        channel: dataLine[5]
                    }));
                    i++; break;
                case "publish":
                    if (dataLine.length !== 7) this.error(`wrong input in line number ${i}`);
                    this.instructions.push(new Instruction(dataLine[0], {
                        alias: dataLine[1],
                        x: Number(dataLine[2]),
                        y: Number(dataLine[3]),
                        radius: Number(dataLine[4]),
                        channel: dataLine[5],
                        payload: dataLine[6]
                    }));
                    i++; break;
                case "moveClient":
                    if (dataLine.length !== 4) this.error(`wrong input in line number ${i}`);
                    this.instructions.push(new Instruction(dataLine[0], {
                        alias: dataLine[1],
                        x: Number(dataLine[2]),
                        y: Number(dataLine[3])
                    }));
                    i++; break;
                case "end":
                    this.instructions.push(new Instruction(dataLine[0]));
                    return;
                default:
                    if (dataLine.length > 0 && !dataLine[0].startsWith('//'))
                        this.error(`Unrecognised Input in line number ${i}`);
                    i++; break;
            }
        }
    }

    async execute(step = 0) {
        if (step >= this.instructions.length) {
            this.log.debug('Reached end of instructions');
            return;
        }
        try {
            this.log.debug(`Executing instruction ${step}: ${this.instructions[step].type}`);
            let result = await this.executeInstructionWrapper(this.instructions[step], step);
            this.log.debug(result);
        } catch (e) {
            this.log.error(e);
        }
        await this.execute(step + 1);
    }

    executeInstructionWrapper(instruction, step) {
        return new Promise((resolve, reject) => {
            this.executeInstruction(instruction, step, resolve, reject);
        });
    }

    async executeInstruction(instruction, step, success, fail) {
        var opts = instruction.opts, type = instruction.type;
        switch (type) {
            case 'wait':
                await this.delay(opts.waitTime, () => success(`waited for ${opts.waitTime}ms`));
                break;
            case 'newMatcher':
                if (!this.matchers[opts.alias])
                    this.matchers[opts.alias] = new matcher(
                        opts.x, opts.y, opts.radius,
                        {
                            isGateway: opts.isGateway,
                            GW_host: opts.GW_host,
                            GW_port: opts.GW_port,
                            VON_port: opts.VON_port,
                            client_port: opts.client_port,
                            alias: opts.alias,
                            logDisplayLevel: 3,
                            logRecordLevel: 4,
                            eventDisplayLevel: 0,
                            eventRecordLevel: 5
                        },
                        id => {
                            this.matcherIDs2alias[id] = opts.alias;
                            success(`Matcher: ${opts.alias} created with ID: ${id}`);
                        });
                else fail('Matcher already exists with alias: ' + opts.alias);
                break;
            case 'newClient':
                if (!this.clients[opts.alias])
                    this.clients[opts.alias] = new client(
                        opts.host, opts.port, opts.alias,
                        opts.x, opts.y, opts.radius,
                        id => {
                            this.clientIDs2alias[id] = opts.alias;
                            this.clients[opts.alias].setAlias = opts.alias;
                            let m = this.clients[opts.alias].getMatcherID();
                            success(`Client ${opts.alias} assigned to matcher: ${this.matcherIDs2alias[m]}`);
                        }
                    );
                else fail('client already exists with alias: ' + opts.alias);
                break;
            case 'subscribe':
                if (this.clients[opts.alias]) {
                    this.clients[opts.alias].subscribe(opts.x, opts.y, opts.radius, opts.channel);
                    success(`${opts.alias}: subscribed [${opts.x},${opts.y},${opts.radius},${opts.channel}]`);
                } else fail('Invalid client alias for subscription: ' + opts.alias);
                break;
            case 'publish':
                if (this.clients[opts.alias]) {
                    this.clients[opts.alias].publish(opts.x, opts.y, opts.radius, opts.payload, opts.channel);
                    success(`${opts.alias} published: ${opts.payload} on channel: ${opts.channel}`);
                } else fail('client with alias "' + opts.alias + '" does not exist');
                break;
            case 'moveClient':
                if (this.clients[opts.alias]) {
                    this.clients[opts.alias].move(opts.x, opts.y);
                    success(`${opts.alias} move to [${opts.x}; ${opts.y}]`);
                } else fail('client with alias "' + opts.alias + '" does not exist');
                break;
            case 'end':
                this.log.debug('Ending Simulation');
                process.exit(0);
            default:
                fail(`Unrecognised instruction at step ${step}`);
        }
    }

    async delay(ms, cb) { await new Promise(res => setTimeout(res, ms)); cb(); }

    error(message) {
        this.log.error(message);
        process.exit();
    }

    async cleanup() {
        this.resetState();
    }

    async wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    async run() {
        try {
            const baseDir = process.argv[2] || path.join(__dirname, '..', 'simScripts', '01_Generate_Node');
            if (!fs.existsSync(baseDir)) { console.error(`No directory: ${baseDir}`); process.exit(1); }
            const scriptDirs = this.findScriptDirectories(baseDir);
            if (scriptDirs.length === 0) { console.error('No Scripts_* folders found'); process.exit(1); }
            const pickedDir = await this.showScriptMenu(scriptDirs);
            const spsScripts = this.findSPSScripts(pickedDir.path);
            if (spsScripts.length === 0) { console.error('No SPS scripts found in selected directory'); process.exit(1); }
            while (true) {
                const selection = await this.showSPSScriptMenu(spsScripts);
                if (selection === 'back') return this.run();
                else if (selection === 'all') { await this.runAllScripts(spsScripts); break; }
                else { await this.runSingleScript(selection); break; }
            }
        } catch (e) {
            this.log.error(e.message);
            await this.cleanup();
            process.exit(1);
        }
    }

    async runAllScripts(spsScripts) {
        for (let i = 0; i < spsScripts.length; i++) {
            const script = spsScripts[i];
            console.log(`\nRunning [${i+1}/${spsScripts.length}]: ${script.name}`);
            await this.runSingleScript(script, true);
            if (i < spsScripts.length - 1) await this.wait(3000);
        }
        await this.cleanup();
        process.exit(0);
    }

    async runSingleScript(script, noExit) {
        // Per-simulation log folder
        const simLogDir = path.join(this.baseLogs, `sim_${Date.now()}`);
        fs.mkdirSync(simLogDir, { recursive: true });
        this.updateLogPaths(simLogDir);

        console.log('\n--- Starting', script.name, '---');
        await this.cleanup();
        this.resetState();

        try {
            await this.loadAndPrepareInstructions(script.path);
            await this.execute();
            console.log(`--- Completed: ${script.name} ---`);
        } catch (e) {
            this.log.error(e);
            console.error('Simulation failed:', script.name, e.message);
        }
        if (!noExit) {
            await this.cleanup();
            process.exit(0);
        }
    }
}

// Helper for instruction objects
function Instruction(type, opts) { this.type = type; this.opts = opts; }

// ----- ENTRY POINT -----
const simulator = new SPSSimulator();
simulator.run().catch(console.error);

// Optional: Handle CTRL+C etc for cleanup
process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, cleaning up...');
    await simulator.cleanup();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, cleaning up...');
    await simulator.cleanup();
    process.exit(0);
});
process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});