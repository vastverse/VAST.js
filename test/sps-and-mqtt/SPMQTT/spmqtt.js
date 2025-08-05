const aedesOpts = {
    VAST: true,
    VASTGateway: true,
    VASTx: 250,
    VASTy: 500,
    VASTport: 8000,
    VASTradius: 50,
    connectTimeout: 30000,
    keepalive: 60
  };
  
  const fs = require('fs');
  const path = require('path');
  const aedes = require('../../../../aedes');
  const net = require('net');
  const mqtt = require('mqtt');
  require('../../../lib/common');
  
  class SPMQTTSimulator {
      constructor() {
          this.simulatedClients = {};
          this.brokerPort = 1884;
          this.brokerPosition = { x: 0, y: 0 };
          this.broker = null;
          this.server = null;
          
          // Store subscriptions and pub info
          this.subscriptions = new Map();
          this.pubInfoByPubId = new Map();
          this.pingTimestamps = new Map();
          
          // Configuration
          this.ENABLE_CLIENT_LOGS = true;
          
          this.setupLogging();
      }
  
      setupLogging() {
          // Create logs directory structure
          this.LOGS_DIR = path.join(__dirname, '../logs');
          this.SPMQTT_LOGS_DIR = path.join(this.LOGS_DIR, 'spmqtt_events');
          this.CLIENT_LOGS_DIR = path.join(this.SPMQTT_LOGS_DIR, 'clients');
          this.BROKER_LOG_PATH = path.join(this.SPMQTT_LOGS_DIR, 'broker.txt');
          this.EVENTS_LOG_PATH = path.join(this.SPMQTT_LOGS_DIR, 'spmqtt_client_events.txt');
          this.CLIENT_EVENTS_LOG_PATH = path.join(this.SPMQTT_LOGS_DIR, 'spmqtt_client_events_no_broker.txt');
          this.CLIENT_MESSAGES_LOG_PATH = path.join(this.SPMQTT_LOGS_DIR, 'spmqtt_client_messages.txt');
  
          // Ensure directories exist
          fs.mkdirSync(this.LOGS_DIR, { recursive: true });
          fs.mkdirSync(this.SPMQTT_LOGS_DIR, { recursive: true });
          fs.mkdirSync(this.CLIENT_LOGS_DIR, { recursive: true });
      }
  
      // Find all script directories
      findScriptDirectories(baseDir) {
          const scriptDirs = [];
          
          try {
              const items = fs.readdirSync(baseDir);
              
              for (const item of items) {
                  const itemPath = path.join(baseDir, item);
                  const stat = fs.statSync(itemPath);
                  
                  if (stat.isDirectory() && item.startsWith('Scripts_')) {
                      scriptDirs.push({
                          name: item,
                          path: itemPath,
                          timestamp: this.extractTimestamp(item)
                      });
                  }
              }
              
              // Sort by timestamp (newest first)
              scriptDirs.sort((a, b) => b.timestamp - a.timestamp);
              
          } catch (error) {
              console.error(`Error reading directory ${baseDir}:`, error.message);
          }
          
          return scriptDirs;
      }
  
      // Extract timestamp from directory name
      extractTimestamp(dirName) {
          const match = dirName.match(/Scripts_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})/);
          if (match) {
              const [, date, time] = match;
              const dateTimeStr = `${date}T${time.replace(/-/g, ':')}`;
              return new Date(dateTimeStr).getTime();
          }
          return 0;
      }
  
    //   // Find simulation scripts in a directory (both original and MQTT versions)
    //   findSimulationScripts(scriptsDir) {
    //       const scripts = [];
          
    //       try {
    //           const files = fs.readdirSync(scriptsDir);
              
    //           for (const file of files) {
    //               if (file.startsWith('simulation_') && file.endsWith('.txt')) {
    //                   const filePath = path.join(scriptsDir, file);
    //                   scripts.push({
    //                       name: file,
    //                       path: filePath,
    //                       type: 'original',
    //                       scale: this.extractScale(file),
    //                       pattern: this.extractPattern(file)
    //                   });
    //               }
    //               // Also include MQTT scripts for comparison
    //               if (file.startsWith('mqtt_simulation_') && file.endsWith('.txt')) {
    //                   const filePath = path.join(scriptsDir, file);
    //                   scripts.push({
    //                       name: file,
    //                       path: filePath,
    //                       type: 'mqtt',
    //                       scale: this.extractScale(file),
    //                       pattern: this.extractPattern(file)
    //                   });
    //               }
    //           }
              
    //           // Sort by type, then scale, then pattern
    //           scripts.sort((a, b) => {
    //               if (a.type !== b.type) return a.type.localeCompare(b.type);
    //               if (a.scale !== b.scale) return a.scale.localeCompare(b.scale);
    //               return a.pattern.localeCompare(b.pattern);
    //           });
              
    //       } catch (error) {
    //           console.error(`Error reading scripts directory ${scriptsDir}:`, error.message);
    //       }
          
    //       return scripts;
    //   }

        // Find MQTT scripts in a directory
        findSimulationScripts(scriptsDir) {
            const mqttScripts = [];
            
            try {
                // First, check if there's an 'mqtt' subfolder
                const mqttSubfolder = path.join(scriptsDir, 'spmqtt');
                let searchDir = scriptsDir;
                
                if (fs.existsSync(mqttSubfolder)) {
                    console.log(`📁 Found mqtt subfolder, searching in: ${mqttSubfolder}`);
                    searchDir = mqttSubfolder;
                } else {
                    console.log(`📁 No mqtt subfolder found, searching in: ${scriptsDir}`);
                }
                
                const files = fs.readdirSync(searchDir);
                
                for (const file of files) {
                    // Look for simulation files (both mqtt_ prefixed and regular simulation_ files in mqtt folder)
                    if ((file.startsWith('mqtt_simulation_') || file.startsWith('simulation_')) && file.endsWith('.txt')) {
                        const filePath = path.join(searchDir, file);
                        mqttScripts.push({
                            name: file,
                            path: filePath,
                            scale: this.extractScale(file),
                            pattern: this.extractPattern(file)
                        });
                    }
                }
                
                // Sort by scale and pattern for consistent ordering
                mqttScripts.sort((a, b) => {
                    if (a.scale !== b.scale) return a.scale.localeCompare(b.scale);
                    return a.pattern.localeCompare(b.pattern);
                });
                
            } catch (error) {
                console.error(`Error reading scripts directory ${searchDir}:`, error.message);
            }
            
            return mqttScripts;
        }
  


      // Extract scale from filename
      extractScale(filename) {
          const match = filename.match(/(?:mqtt_)?simulation_(\w+)_/);
          return match ? match[1] : 'unknown';
      }
  
      // Extract pattern from filename
      extractPattern(filename) {
          const match = filename.match(/(?:mqtt_)?simulation_\w+_(.+)\.txt$/);
          return match ? match[1] : 'unknown';
      }
  
      // Interactive menu for script selection
      async showScriptMenu(scriptDirs) {
          console.log('\n🎯 Available Script Directories:');
          scriptDirs.forEach((dir, index) => {
              const date = new Date(dir.timestamp).toLocaleString();
              console.log(`  ${index + 1}. ${dir.name} (${date})`);
          });
          console.log('  0. Exit');
          
          const readline = require('readline');
          const rl = readline.createInterface({
              input: process.stdin,
              output: process.stdout
          });
          
          return new Promise((resolve) => {
              rl.question('\nSelect directory (number): ', (answer) => {
                  rl.close();
                  const choice = parseInt(answer);
                  if (choice === 0) {
                      console.log('👋 Goodbye!');
                      process.exit(0);
                  } else if (choice > 0 && choice <= scriptDirs.length) {
                      resolve(scriptDirs[choice - 1]);
                  } else {
                      console.log('❌ Invalid choice. Exiting.');
                      process.exit(1);
                  }
              });
          });
      }
  
      // Interactive menu for simulation script selection
      async showSimulationScriptMenu(scripts) {
          console.log('\n🚀 Available Simulation Scripts:');
          scripts.forEach((script, index) => {
              const typeLabel = script.type === 'mqtt' ? '(MQTT)' : '(SPS)';
              console.log(`  ${index + 1}. ${script.name} ${typeLabel} - ${script.scale} scale, ${script.pattern} pattern`);
          });
          console.log('  0. Run all SPS scripts sequentially');
          console.log('  -1. Back to directory selection');
          
          const readline = require('readline');
          const rl = readline.createInterface({
              input: process.stdin,
              output: process.stdout
          });
          
          return new Promise((resolve) => {
              rl.question('\nSelect script (number): ', (answer) => {
                  rl.close();
                  const choice = parseInt(answer);
                  if (choice === -1) {
                      resolve('back');
                  } else if (choice === 0) {
                      resolve('all');
                  } else if (choice > 0 && choice <= scripts.length) {
                      resolve(scripts[choice - 1]);
                  } else {
                      console.log('❌ Invalid choice. Exiting.');
                      process.exit(1);
                  }
              });
          });
      }
  
      // Run multiple scripts sequentially (only SPS scripts)
      async runAllScripts(scripts) {
          const spsScripts = scripts.filter(s => s.type === 'original');
          console.log(`\n🎮 Running ${spsScripts.length} SPS scripts sequentially...\n`);
          
          for (let i = 0; i < spsScripts.length; i++) {
              const script = spsScripts[i];
              console.log(`\n📍 [${i + 1}/${spsScripts.length}] Starting: ${script.name}`);
              console.log(`   Scale: ${script.scale}, Pattern: ${script.pattern}`);
              
              try {
                  await this.runSingleScript(script);
                  console.log(`✅ [${i + 1}/${spsScripts.length}] Completed: ${script.name}`);
                  
                  if (i < spsScripts.length - 1) {
                      console.log('   Waiting 3 seconds before next script...');
                      await this.wait(3000);
                  }
              } catch (error) {
                  console.error(`❌ [${i + 1}/${spsScripts.length}] Failed: ${script.name}`, error.message);
              }
          }
          
          console.log('\n🎉 All scripts completed!');
      }
  
      // Run a single script
      async runSingleScript(script) {
          console.log(`\n🎬 Starting SPMQTT simulation: ${script.name}`);
          
          // Reset state
          await this.cleanup();
          this.resetState();
          
          // Create simulation-specific log directory
          const simLogDir = path.join(this.SPMQTT_LOGS_DIR, `sim_${script.scale}_${script.pattern}_${Date.now()}`);
          fs.mkdirSync(simLogDir, { recursive: true });
          
          // Update log paths for this simulation
          this.updateLogPaths(simLogDir);
          
          // Process the script
          await this.processScript(script.path);
      }
  
      // Update log paths for current simulation
      updateLogPaths(simLogDir) {
          this.BROKER_LOG_PATH = path.join(simLogDir, 'broker.txt');
          this.EVENTS_LOG_PATH = path.join(simLogDir, 'spmqtt_client_events.txt');
          this.CLIENT_EVENTS_LOG_PATH = path.join(simLogDir, 'spmqtt_client_events_no_broker.txt');
          this.CLIENT_MESSAGES_LOG_PATH = path.join(simLogDir, 'spmqtt_client_messages.txt');
          this.CLIENT_LOGS_DIR = path.join(simLogDir, 'clients');
          fs.mkdirSync(this.CLIENT_LOGS_DIR, { recursive: true });
      }
  
      // Reset internal state
      resetState() {
          this.simulatedClients = {};
          this.subscriptions.clear();
          this.pubInfoByPubId.clear();
          this.pingTimestamps.clear();
          this.brokerPosition = { x: 0, y: 0 };
      }
  
      // Wait utility
      async wait(ms) {
          return new Promise(resolve => setTimeout(resolve, ms));
      }
  
      // Random string generation
      _randomString(length) {
          var result = '';
          var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
          var charactersLength = characters.length;
          for (var i = 0; i < length; i++) {
              result += characters.charAt(Math.floor(Math.random() * charactersLength));
          }
          return result;
      }
  
      // Generate subscription ID
      _generate_subID(clientID) {
          return clientID + '-' + this._randomString(5);
      }
  
      // Logging functions
      logToFile(message) {
          const timestamp = Date.now();
          const line = `[${timestamp}] ${message}\n`;
          console.log(line.trim());
          
          fs.appendFile(this.BROKER_LOG_PATH, line, (err) => {
              if (err) console.error('Error writing to broker log:', err);
          });
      }
  
      logClientEvent(clientId, eventType, data) {
          const eventObj = {
              time: Date.now(),
              event: eventType,
              id: clientId,
              alias: "unnamed_client",
              matcher: 1,
              ...data
          };
          const line = JSON.stringify(eventObj) + '\n';
          fs.appendFileSync(this.CLIENT_EVENTS_LOG_PATH, line);
      }
  
      logClientMessage(clientId, topic, message) {
          const timestamp = Date.now();
          const logEntry = JSON.stringify({
              time: timestamp,
              clientId,
              topic,
              message: message.toString()
          }) + '\n';
  
          fs.appendFile(this.CLIENT_MESSAGES_LOG_PATH, logEntry, (err) => {
              if (err) {
                  console.error('Error writing to client messages log:', err);
              }
          });
      }
  
      logClient(clientId, message) {
          const timestamp = Date.now();
          const line = `[${timestamp}] ${message}\n`;
          console.log(`[CLIENT ${clientId}] ${line.trim()}`);
          
          // Write to individual client log files if enabled
          if (this.ENABLE_CLIENT_LOGS) {
              const clientLogPath = path.join(this.CLIENT_LOGS_DIR, `client_${clientId}.txt`);
              fs.appendFile(clientLogPath, line, (err) => {
                  if (err) console.error(`Error writing to client ${clientId} log:`, err);
              });
          }
          
          // Always write to events log
          fs.appendFile(this.EVENTS_LOG_PATH, line, (err) => {
              if (err) console.error('Error writing to events log:', err);
          });
      }
  
      // Start broker with VAST integration
      async startBroker(port = 1884) {
          const brokerOptions = {
              ...aedesOpts,
              authenticate: (client, username, password, cb) => cb(null, true)
          };
  
          if (isNaN(brokerOptions.connectTimeout)) {
              brokerOptions.connectTimeout = 30000;
          }
  
          this.broker = aedes(brokerOptions);
  
          if (!this.broker.matcher && typeof this.broker.createMatcher === 'function') {
              this.broker.matcher = this.broker.createMatcher();
          }
  
          // Add broker event handlers
          this.broker.on('client', (client) => {
              this.logToFile(`Client ${client.id} connected to broker`);
          });
  
          this.broker.on('clientDisconnect', (client) => {
              this.logToFile(`Client ${client.id} disconnected from broker`);
          });
  
          this.broker.on('subscribe', (subscriptions, client) => {
              subscriptions.forEach(sub => {
                  this.logToFile(`Client ${client ? client.id : 'unknown'} subscribed to ${sub.topic}`);
              });
          });
  
          this.broker.on('publish', (packet, client) => {
              if (!packet.topic.startsWith('$SYS')) {
                  this.logToFile(`${client ? client.id : 'BROKER'} published to ${packet.topic}: ${packet.payload.toString()}`);
              }
          });
  
          this.server = net.createServer(this.broker.handle);
  
          const startServer = (port) => {
              return new Promise((resolve, reject) => {
                  this.server.once('error', (err) => {
                      if (err.code === 'EADDRINUSE') {
                          this.logToFile(`Port ${port} is in use, trying port ${port + 1}`);
                          this.server.close();
                          resolve(startServer(port + 1));
                      } else {
                          reject(err);
                      }
                  });
  
                  this.server.listen(port, () => {
                      this.logToFile(`Aedes broker started on port ${port}`);
                      this.logToFile(`Broker configuration: ${JSON.stringify(brokerOptions, null, 2)}`);
                      resolve(port);
                  });
              });
          };
  
          const actualPort = await startServer(port);
          this.brokerPort = actualPort;
          return { broker: this.broker, server: this.server, port: actualPort };
      }
  
      // Create MQTT client with VAST positioning
      createClient(clientId, host, port, x, y, r) {
          const url = `mqtt://${host}:${port}`;
          const authPayload = JSON.stringify({ x, y, r });
  
          const options = {
              clientId,
              username: clientId,
              password: authPayload,
              clean: true,
              reconnectPeriod: 1000,
              connectTimeout: 30_000
          };
  
          const client = mqtt.connect(url, options);
  
          this.logClient(clientId, `Connecting to ${host}:${port} with position (${x}, ${y}) and radius ${r}`);
  
          // Log CLIENT_JOIN event
          this.logClientEvent(clientId, Client_Event.CLIENT_JOIN, {
              pos: { x, y },
              radius: r,
              matcher: 1
          });
  
          client.on('connect', () => {
              this.logClient(clientId, 'Connected to broker');
              this.logClientEvent(clientId, Client_Event.CLIENT_CONNECT, {
                  pos: { x, y },
                  radius: r,
                  matcher: 1
              });
              this.logClientEvent(clientId, Client_Event.CLIENT_MIGRATE, {
                  pos: { x, y },
                  radius: r,
                  matcher: 1
              });
              this.simulatedClients[clientId] = { client, x, y, r };
          });
  
          client.on('reconnect', () => {
              this.logClient(clientId, 'Reconnecting to broker');
              this.logClientEvent(clientId, Client_Event.CLIENT_MIGRATE, {
                  pos: { x, y },
                  radius: r,
                  matcher: 1
              });
          });
  
          client.on('error', (err) => {
              this.logClient(clientId, `Error: ${err.message}`);
              this.logClientEvent(clientId, Client_Event.CLIENT_DISCONNECT, {
                  error: err.message,
                  pos: { x, y },
                  radius: r,
                  matcher: 1
              });
          });
  
          client.on('close', () => {
              this.logClient(clientId, 'Disconnected from broker');
              this.logClientEvent(clientId, Client_Event.CLIENT_LEAVE, {
                  pos: { x, y },
                  radius: r,
                  matcher: 1
              });
          });
  
          client.on('message', (topic, message) => {
              let pubId, payload;
              
              try {
                  // Try JSON parsing first (for newer format)
                  const obj = JSON.parse(message.toString());
                  pubId = obj.pubId;
                  payload = obj.message;
              } catch (parseError) {
                  // Fallback to string parsing (for older format)
                  const [id, ...payloadParts] = message.toString().split(':');
                  pubId = id;
                  payload = payloadParts.join(':');
              }
              
              this.logClient(clientId, `Received message on topic ${topic}: ${payload}`);
              this.logClientMessage(clientId, topic, message);
              
              // Calculate RTT if available
              const pongTimestamp = Date.now();
              const pingTimestamp = this.pingTimestamps.get(pubId);
              const rtt = pingTimestamp ? pongTimestamp - pingTimestamp : null;
              
              // Look up publisher info for this pubId
              let pubInfo = this.pubInfoByPubId.get(pubId);
              if (!pubInfo) {
                  pubInfo = {
                    clientID: clientId,
                    aoi: { center: { x, y }, radius: r },
                    channel: topic,
                    payload: payload
                };
            }
            
            this.logClientEvent(clientId, Client_Event.RECEIVE_PUB, {
                pub: {
                    matcherID: 1,
                    clientID: pubInfo.clientID,
                    pubID: pubId,
                    aoi: pubInfo.aoi,
                    payload: pubInfo.payload,
                    channel: pubInfo.channel,
                    recipients: [1],
                    chain: [1]
                },
                pingpong: rtt ? {
                    ping: {
                        timestamp: pingTimestamp,
                        pubid: pubId
                    },
                    pong: {
                        timestamp: pongTimestamp,
                        pubid: pubId,
                        rtt: rtt
                    }
                } : undefined
            });
            
            // Clean up ping timestamp
            if (pubId && this.pingTimestamps.has(pubId)) {
                setTimeout(() => {
                    this.pingTimestamps.delete(pubId);
                }, 100);
            }
        });

        return client;
    }

    // Process simulation script
    async processScript(scriptPath) {
        const script = fs.readFileSync(scriptPath, 'utf8');
        const lines = script.split('\n');
        
        // Read broker position from first line
        const firstLine = lines[0].trim();
        if (firstLine.startsWith('newMatcher')) {
            const parts = firstLine.split(' ');
            if (parts.length >= 9) {
                this.brokerPosition = {
                    x: parseFloat(parts[7]),
                    y: parseFloat(parts[8])
                };
                console.log(`Broker position set to: (${this.brokerPosition.x}, ${this.brokerPosition.y})`);
            }
        }

        try {
            for (let index = 0; index < lines.length; index++) {
                const line = lines[index].trim();
                if (line === '' || line.startsWith('//')) continue;
                await this.processLine(line, index + 1);
            }
        } catch (err) {
            this.logToFile(`Error reading script: ${err.message}`);
            throw err;
        }
    }

    // Process individual script line
    async processLine(line, lineNumber) {
        const parts = line.trim().split(' ');
        const command = parts[0].toLowerCase();

        switch (command) {
            case 'wait':
                const waitTime = parseInt(parts[1]);
                this.logToFile(`Waiting for ${waitTime}ms`);
                return new Promise(resolve => setTimeout(resolve, waitTime));

            case 'newmatcher':
                const [_, matcherId, isGateway, host, port, x, y, radius] = parts;
                this.logToFile(`Creating new matcher ${matcherId} at ${host}:${this.brokerPort} position (${x}, ${y}) radius ${radius}`);
                return this.startBroker(this.brokerPort);

            case 'newclient':
                const [__, clientId, clientHost, clientPort, clientX, clientY, clientR] = parts;
                this.logToFile(`Creating new client ${clientId} at ${clientHost}:${this.brokerPort} position (${clientX}, ${clientY}) radius ${clientR}`);
                const client = this.createClient(clientId, clientHost, this.brokerPort, parseInt(clientX), parseInt(clientY), parseInt(clientR));
                return Promise.resolve();

            case 'subscribe':
                const [___, subClientId, subX, subY, subRadius, channel] = parts;
                const topicObj = { x: parseInt(subX), y: parseInt(subY), radius: parseInt(subRadius), channel };
                const topic = `sp: <${JSON.stringify(topicObj)}>`;
                this.logToFile(`Client ${subClientId} subscribing to topic ${topic}`);
                const subClient = this.simulatedClients[subClientId];
                if (!subClient) {
                    this.logToFile(`Error: Client ${subClientId} not found`);
                    return Promise.reject(new Error(`Client ${subClientId} not found`));
                }
                return new Promise((resolve, reject) => {
                    const subId = `SUB-${this._randomString(5)}`;
                    subClient.client.subscribe(topic, (err) => {
                        if (err) {
                            this.logToFile(`Error subscribing client ${subClientId} to topic ${topic}: ${err.message}`);
                            reject(err);
                        } else {
                            this.logToFile(`Client ${subClientId} subscribed to topic ${topic}`);
                            this.logClient(subClientId, `Subscribed to topic ${topic}`);
                            
                            this.logClientEvent(subClientId, Client_Event.SUB_NEW, {
                                sub: {
                                    hostID: 1,
                                    hostPos: this.brokerPosition,
                                    clientID: subClientId,
                                    subID: subId,
                                    channel: topic,
                                    aoi: {
                                        center: { x: parseInt(subX), y: parseInt(subY) },
                                        radius: parseInt(subRadius)
                                    },
                                    recipients: [],
                                    heartbeat: Date.now()
                                }
                            });
                            resolve();
                        }
                    });
                });

            case 'publish':
                const [____, pubClientId, pubX, pubY, pubRadius, pubTopic, ...pubPayloadParts] = parts;
                const pubPayload = pubPayloadParts.join(' ').replace(/^"|"$/g, '');
                const pubTopicObj = { x: parseInt(pubX), y: parseInt(pubY), radius: parseInt(pubRadius), channel: pubTopic };
                const pubTopicStr = `sp: <${JSON.stringify(pubTopicObj)}>`;
                this.logToFile(`Client ${pubClientId} publishing to topic ${pubTopicStr}: ${pubPayload}`);
                const pubClient = this.simulatedClients[pubClientId];
                if (!pubClient) {
                    this.logToFile(`Error: Client ${pubClientId} not found`);
                    return Promise.reject(new Error(`Client ${pubClientId} not found`));
                }
                return new Promise((resolve, reject) => {
                    const pubId = `PUB-${this._randomString(5)}`;
                    const pubAoi = {
                        center: { x: parseInt(pubX), y: parseInt(pubY) },
                        radius: parseInt(pubRadius)
                    };
                    
                    // Store ping timestamp for RTT calculation
                    const pingTimestamp = Date.now();
                    this.pingTimestamps.set(pubId, pingTimestamp);
                    
                    // Track publisher info for this pubId
                    this.pubInfoByPubId.set(pubId, {
                        clientID: pubClientId,
                        aoi: pubAoi,
                        channel: pubTopicStr,
                        payload: pubPayload
                    });
                    
                    // Create message with JSON format for consistency
                    const messageObj = {
                        message: pubPayload,
                        pubId: pubId
                    };
                    const message = JSON.stringify(messageObj);
                    
                    pubClient.client.publish(pubTopicStr, message, (err) => {
                        if (err) {
                            this.logToFile(`Error publishing from client ${pubClientId} to topic ${pubTopicStr}: ${err.message}`);
                            reject(err);
                        } else {
                            this.logToFile(`Client ${pubClientId} published to topic ${pubTopicStr}: ${pubPayload}`);
                            this.logClient(pubClientId, `Published to topic ${pubTopicStr}: ${pubPayload} [pub-id: ${pubId}]`);
                            
                            // Log PUB event with ping info
                            this.logClientEvent(pubClientId, Client_Event.PUB, {
                                pub: {
                                    pubID: pubId,
                                    aoi: pubAoi,
                                    channel: pubTopicStr,
                                    payload: pubPayload
                                },
                                pingpong: {
                                    ping: {
                                        timestamp: pingTimestamp,
                                        pubid: pubId
                                    }
                                }
                            });
                            resolve();
                        }
                    });
                });

            case 'end':
                this.logToFile('Simulation ended, waiting for message delivery...');
                setTimeout(() => {
                    // Don't exit immediately, let cleanup handle it
                }, 1000);
                return Promise.resolve();

            default:
                this.logToFile(`Unknown command: ${command}`);
                return Promise.resolve();
        }
    }

    // Cleanup function
    async cleanup() {
        if (Object.keys(this.simulatedClients).length > 0) {
            this.logToFile("Starting cleanup...");
            for (const [clientId, clientData] of Object.entries(this.simulatedClients)) {
                try {
                    await new Promise((resolve) => {
                        clientData.client.end(true, () => {
                            this.logClient(clientId, 'Disconnected');
                            resolve();
                        });
                    });
                } catch (err) {
                    this.logToFile(`Error disconnecting client ${clientId}: ${err.message}`);
                }
            }
        }
        
        if (this.server) {
            await new Promise((resolve) => {
                this.server.close(() => {
                    this.logToFile("Broker stopped");
                    resolve();
                });
            });
            this.server = null;
        }
        
        if (this.broker) {
            this.broker.close();
            this.broker = null;
        }
        
        this.logToFile("Cleanup completed");
    }

    // Main entry point
    async run() {
        try {
            console.log('🎯 SPMQTT Simulation Runner');
            console.log('============================');

            // Get base directory from command line or use default
            const baseDir = process.argv[2] || path.join(__dirname, '..', 'simScripts', '01_Generate_Node');
            
            if (!fs.existsSync(baseDir)) {
                console.error(`❌ Base directory not found: ${baseDir}`);
                console.error('Usage: node spmqtt-simulator.js [base_directory_path]');
                process.exit(1);
            }

            console.log(`📁 Scanning directory: ${baseDir}`);

            // Find script directories
            const scriptDirs = this.findScriptDirectories(baseDir);
            
            if (scriptDirs.length === 0) {
                console.log('❌ No script directories found (looking for Scripts_* folders)');
                process.exit(1);
            }

            // Interactive directory selection
            const selectedDir = await this.showScriptMenu(scriptDirs);
            console.log(`✅ Selected: ${selectedDir.name}`);

            // Find simulation scripts in selected directory
            const scripts = this.findSimulationScripts(selectedDir.path);
            
            if (scripts.length === 0) {
                console.log('❌ No simulation scripts found in selected directory');
                process.exit(1);
            }

            // Interactive script selection
            while (true) {
                const selection = await this.showSimulationScriptMenu(scripts);
                
                if (selection === 'back') {
                    // Restart the whole process
                    return this.run();
                } else if (selection === 'all') {
                    await this.runAllScripts(scripts);
                    break;
                } else {
                    await this.runSingleScript(selection);
                    break;
                }
            }

        } catch (error) {
            console.error('❌ Fatal error:', error.message);
            process.exit(1);
        } finally {
            await this.cleanup();
        }
    }
}

// Create and run the simulator
const simulator = new SPMQTTSimulator();
simulator.run().catch(console.error);

// Handle cleanup on exit
process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, cleaning up...');
    await simulator.cleanup();
    process.exit(0);
});

process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', reason);
});