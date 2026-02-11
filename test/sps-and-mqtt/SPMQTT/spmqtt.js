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

  // ✅ Define Client_Event constants to match SPS format
  const Client_Event = {
      CLIENT_JOIN: 1,
      CLIENT_CONNECT: 2,
      CLIENT_LEAVE: 3,
      CLIENT_MIGRATE: 4,
      SUB_NEW: 6,
      SUB_DELETE: 7,
      PUB: 9,
      RECEIVE_PUB: 10
  };
  
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
        this.EVENTS_LOG_PATH = path.join(this.SPMQTT_LOGS_DIR, 'spmqtt_events.txt');
        this.CLIENT_EVENTS_LOG_PATH = path.join(this.SPMQTT_LOGS_DIR, 'spmqtt_client_events.txt');
        this.CLIENT_EVENTS_NO_BROKER_LOG_PATH = path.join(this.SPMQTT_LOGS_DIR, 'spmqtt_client_events_no_broker.txt');
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

      // Find MQTT scripts in a directory
      findSimulationScripts(scriptsDir) {
          const mqttScripts = [];
          
          try {
              // First, check if there's a 'spmqtt' subfolder
              const mqttSubfolder = path.join(scriptsDir, 'spmqtt');
              let searchDir = scriptsDir;
              
              if (fs.existsSync(mqttSubfolder)) {
                  console.log(`📁 Found spmqtt subfolder, searching in: ${mqttSubfolder}`);
                  searchDir = mqttSubfolder;
              } else {
                  console.log(`📁 No spmqtt subfolder found, searching in: ${scriptsDir}`);
              }
              
              const files = fs.readdirSync(searchDir);
              
              for (const file of files) {
                  // Look for simulation files (both mqtt_ prefixed and regular simulation_ files in spmqtt folder)
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
              console.error(`Error reading scripts directory:`, error.message);
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
              console.log(`  ${index + 1}. ${script.name} - ${script.scale} scale, ${script.pattern} pattern`);
          });
          console.log('  0. Run all scripts sequentially');
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
  
      // Run multiple scripts sequentially
      async runAllScripts(scripts) {
          console.log(`\n🎮 Running ${scripts.length} scripts sequentially...\n`);
          
          for (let i = 0; i < scripts.length; i++) {
              const script = scripts[i];
              console.log(`\n📍 [${i + 1}/${scripts.length}] Starting: ${script.name}`);
              console.log(`   Scale: ${script.scale}, Pattern: ${script.pattern}`);
              
              try {
                  await this.runSingleScript(script);
                  console.log(`✅ [${i + 1}/${scripts.length}] Completed: ${script.name}`);
                  
                  if (i < scripts.length - 1) {
                      console.log('   Waiting 3 seconds before next script...');
                      await this.wait(3000);
                  }
              } catch (error) {
                  console.error(`❌ [${i + 1}/${scripts.length}] Failed: ${script.name}`, error.message);
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
        this.EVENTS_LOG_PATH = path.join(simLogDir, 'spmqtt_events.txt');
        this.CLIENT_EVENTS_LOG_PATH = path.join(simLogDir, 'spmqtt_client_events.txt');
        this.CLIENT_EVENTS_NO_BROKER_LOG_PATH = path.join(simLogDir, 'spmqtt_client_events_no_broker.txt');
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
  
      // ✅ UPDATED: Logging functions to match SPS format
      
        logClientEvent(clientId, eventType, data) {
            const eventObj = {
                time: Date.now(),
                event: eventType,
                id: clientId,
                ...data
            };
            const line = JSON.stringify(eventObj) + '\n';
            
            // Write to both logs
            fs.appendFileSync(this.CLIENT_EVENTS_LOG_PATH, line);
            fs.appendFileSync(this.CLIENT_EVENTS_LOG_PATH.replace('spmqtt_client_events.txt', 'spmqtt_client_events_no_broker.txt'), line);
            
            console.log(`[EVENT] ${line.trim()}`);
        }

        logToFile(message) {
            const timestamp = Date.now();
            const line = `[${timestamp}] ${message}\n`;
            console.log(line.trim());
            
            fs.appendFile(this.BROKER_LOG_PATH, line, (err) => {
                if (err) console.error('Error writing to broker log:', err);
            });
        }

        logClient(clientId, message) {
            const timestamp = Date.now();
            const line = `[${timestamp}] ${message}\n`;
            console.log(`[CLIENT ${clientId}] ${line.trim()}`);
            
            if (this.ENABLE_CLIENT_LOGS) {
                const clientLogPath = path.join(this.CLIENT_LOGS_DIR, `client_${clientId}.txt`);
                fs.appendFile(clientLogPath, line, (err) => {
                    if (err) console.error(`Error writing to client ${clientId} log:`, err);
                });
            }
            
            fs.appendFile(this.EVENTS_LOG_PATH, line, (err) => {
                if (err) console.error('Error writing to events log:', err);
            });
        }
  
      logToFile(message) {
          const timestamp = Date.now();
          const line = `[${timestamp}] ${message}\n`;
          console.log(line.trim());
          
          fs.appendFile(this.BROKER_LOG_PATH, line, (err) => {
              if (err) console.error('Error writing to broker log:', err);
          });
      }
  
      logClient(clientId, message) {
          const timestamp = Date.now();
          const line = `[${timestamp}] ${message}\n`;
          console.log(`[CLIENT ${clientId}] ${line.trim()}`);
          
          if (this.ENABLE_CLIENT_LOGS) {
              const clientLogPath = path.join(this.CLIENT_LOGS_DIR, `client_${clientId}.txt`);
              fs.appendFile(clientLogPath, line, (err) => {
                  if (err) console.error(`Error writing to client ${clientId} log:`, err);
              });
          }
          
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
                      resolve(port);
                  });
              });
          };
  
          const actualPort = await startServer(port);
          this.brokerPort = actualPort;
          return { broker: this.broker, server: this.server, port: actualPort };
      }
  
      // ✅ UPDATED: Create MQTT client with proper event logging
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
  
          // ✅ Log CLIENT_JOIN event with proper format
          this.logClientEvent(clientId, Client_Event.CLIENT_JOIN, {
              pos: { x, y },
              radius: r
          });
  
          client.on('connect', () => {
              this.logClient(clientId, 'Connected to broker');
              
              // ✅ Log CLIENT_CONNECT event
              this.logClientEvent(clientId, Client_Event.CLIENT_CONNECT, {
                  pos: { x, y },
                  radius: r
              });
              
              // ✅ Log CLIENT_MIGRATE event
              this.logClientEvent(clientId, Client_Event.CLIENT_MIGRATE, {
                  pos: { x, y },
                  radius: r
              });
              
              this.simulatedClients[clientId] = { client, x, y, r };
          });
  
          client.on('reconnect', () => {
              this.logClient(clientId, 'Reconnecting to broker');
              this.logClientEvent(clientId, Client_Event.CLIENT_MIGRATE, {
                  pos: { x, y },
                  radius: r
              });
          });
  
          client.on('error', (err) => {
              this.logClient(clientId, `Error: ${err.message}`);
          });
  
          client.on('close', () => {
              this.logClient(clientId, 'Disconnected from broker');
              
              // ✅ Log CLIENT_LEAVE event
              this.logClientEvent(clientId, Client_Event.CLIENT_LEAVE, {
                  pos: { x, y },
                  radius: r
              });
          });
  
          client.on('message', (topic, message) => {
              let pubId, payload;
              
              try {
                  const obj = JSON.parse(message.toString());
                  pubId = obj.pubId;
                  payload = obj.message;
              } catch (parseError) {
                  const [id, ...payloadParts] = message.toString().split(':');
                  pubId = id;
                  payload = payloadParts.join(':');
              }
              
              this.logClient(clientId, `Received message on topic ${topic}: ${payload}`);
              
              // Calculate latency
              const pongTimestamp = Date.now();
              const pingTimestamp = this.pingTimestamps.get(pubId);
              const latency = pingTimestamp ? pongTimestamp - pingTimestamp : null;
              
              // Look up publisher info
              let pubInfo = this.pubInfoByPubId.get(pubId);
              if (!pubInfo) {
                  pubInfo = {
                      clientID: clientId,
                      aoi: { center: { x, y }, radius: r },
                      channel: topic,
                      payload: payload
                  };
              }
              
              // ✅ Log RECEIVE_PUB event with proper format
              this.logClientEvent(clientId, Client_Event.RECEIVE_PUB, {
                  pub: {
                      pubID: pubId,
                      time: pingTimestamp,
                      aoi: pubInfo.aoi,
                      channel: pubInfo.channel
                  }
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

      // ✅ UPDATED: Process simulation script
      async processScript(scriptPath) {
          const script = fs.readFileSync(scriptPath, 'utf8');
          const lines = script.split('\n');
          
          // Read broker position from first line
          const firstLine = lines[0].trim();
          if (firstLine.toLowerCase().startsWith('newmatcher')) {
              const parts = firstLine.split(' ');
              if (parts.length >= 9) {
                  this.brokerPosition = {
                      x: parseFloat(parts[7]),
                      y: parseFloat(parts[8])
                  };
                  console.log(`✅ Broker position set to: (${this.brokerPosition.x}, ${this.brokerPosition.y})`);
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

      // ✅ UPDATED: Process individual script line
      async processLine(line, lineNumber) {
          const parts = line.trim().split(' ');
          const command = parts[0].toLowerCase();

          switch (command) {
              case 'wait':
                  const waitTime = parseInt(parts[1]);
                  this.logToFile(`⏳ Waiting for ${waitTime}ms`);
                  return new Promise(resolve => setTimeout(resolve, waitTime));

              case 'newmatcher':
                  this.logToFile(`🔧 Creating new matcher/broker`);
                  return this.startBroker(this.brokerPort);

              case 'newclient':
                  const [__, clientId, clientHost, clientPort, clientX, clientY, clientR] = parts;
                  this.logToFile(`👤 Creating new client ${clientId} at (${clientX}, ${clientY}) radius ${clientR}`);
                  this.createClient(clientId, clientHost, this.brokerPort, parseInt(clientX), parseInt(clientY), parseInt(clientR));
                  return Promise.resolve();

                  case 'subscribe':
                    const [___, subClientId, subX, subY, subRadius, channel] = parts;
                    const subId = this._generate_subID(subClientId);
                    
                    // ✅ Create topic with <sp: format for spatial tagging
                    const subTopicObj = { x: parseInt(subX), y: parseInt(subY), radius: parseInt(subRadius), channel };
                    const subTopic = `sp:<${JSON.stringify(subTopicObj)}>`;
                    
                    this.logToFile(`📬 Client ${subClientId} subscribing to ${subTopic}`);
                    const subClient = this.simulatedClients[subClientId];
                    
                    if (!subClient) {
                        this.logToFile(`❌ Error: Client ${subClientId} not found`);
                        return Promise.reject(new Error(`Client ${subClientId} not found`));
                    }
                    
                    return new Promise((resolve, reject) => {
                        subClient.client.subscribe(subTopic, (err) => {
                            if (err) {
                                this.logToFile(`❌ Error subscribing client ${subClientId}: ${err.message}`);
                                reject(err);
                            } else {
                                this.logClient(subClientId, `Subscribed to ${subTopic}`);
                                
                                // ✅ Log SUB_NEW event with proper format
                                this.logClientEvent(subClientId, Client_Event.SUB_NEW, {
                                    sub: {
                                        subID: subId,
                                        clientID: subClientId,
                                        channel: channel,
                                        aoi: {
                                            center: { x: parseInt(subX), y: parseInt(subY) },
                                            radius: parseInt(subRadius)
                                        }
                                    }
                                });
                                resolve();
                            }
                        });
                    });
                
                case 'publish':
                    const [____, pubClientId, pubX, pubY, pubRadius, pubTopic, ...pubPayloadParts] = parts;
                    const pubPayload = pubPayloadParts.join(' ').replace(/^"|"$/g, '');
                    const pubId = `PUB-${this._randomString(5)}`;
                    
                    // ✅ Create topic with <sp: format for spatial tagging
                    const pubTopicObj = { x: parseInt(pubX), y: parseInt(pubY), radius: parseInt(pubRadius), channel: pubTopic };
                    const pubTopicStr = `sp:<${JSON.stringify(pubTopicObj)}>`;
                    
                    this.logToFile(`📤 Client ${pubClientId} publishing to ${pubTopicStr}: ${pubPayload}`);
                    const pubClient = this.simulatedClients[pubClientId];
                    
                    if (!pubClient) {
                        this.logToFile(`❌ Error: Client ${pubClientId} not found`);
                        return Promise.reject(new Error(`Client ${pubClientId} not found`));
                    }
                    
                    return new Promise((resolve, reject) => {
                        const pubAoi = {
                            center: { x: parseInt(pubX), y: parseInt(pubY) },
                            radius: parseInt(pubRadius)
                        };
                        
                        // Store ping timestamp for latency calculation
                        const pingTimestamp = Date.now();
                        this.pingTimestamps.set(pubId, pingTimestamp);
                        
                        // Track publisher info
                        this.pubInfoByPubId.set(pubId, {
                            clientID: pubClientId,
                            aoi: pubAoi,
                            channel: pubTopic,
                            payload: pubPayload
                        });
                        
                        // Create message with JSON format
                        const messageObj = {
                            message: pubPayload,
                            pubId: pubId
                        };
                        const message = JSON.stringify(messageObj);
                        
                        pubClient.client.publish(pubTopicStr, message, (err) => {
                            if (err) {
                                this.logToFile(`❌ Error publishing: ${err.message}`);
                                reject(err);
                            } else {
                                this.logClient(pubClientId, `Published to ${pubTopicStr}: ${pubPayload} [pub-id: ${pubId}]`);
                                
                                // ✅ Log PUB event with proper format
                                this.logClientEvent(pubClientId, Client_Event.PUB, {
                                    pub: {
                                        pubID: pubId,
                                        time: pingTimestamp,
                                        aoi: pubAoi,
                                        channel: pubTopic
                                    }
                                });
                                resolve();
                            }
                        });
                    });
                    
              case 'end':
                  this.logToFile('⏹️ Simulation ended');
                  return Promise.resolve();

              default:
                  this.logToFile(`⚠️ Unknown command: ${command}`);
                  return Promise.resolve();
          }
      }

      // Cleanup function
      async cleanup() {
          if (Object.keys(this.simulatedClients).length > 0) {
              this.logToFile("🧹 Starting cleanup...");
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
                      this.logToFile("🛑 Broker stopped");
                      resolve();
                  });
              });
              this.server = null;
          }
          
          if (this.broker) {
              this.broker.close();
              this.broker = null;
          }
          
          this.logToFile("✅ Cleanup completed");
      }

      // Main entry point
      async run() {
          try {
              console.log('🎯 SPMQTT Simulation Runner');
              console.log('============================');

              const baseDir = process.argv[2] || path.join(__dirname, '..', 'simScripts', '01_Generate_Node');
              
              if (!fs.existsSync(baseDir)) {
                  console.error(`❌ Base directory not found: ${baseDir}`);
                  process.exit(1);
              }

              console.log(`📁 Scanning directory: ${baseDir}`);

              const scriptDirs = this.findScriptDirectories(baseDir);
              
              if (scriptDirs.length === 0) {
                  console.log('❌ No script directories found');
                  process.exit(1);
              }

              const selectedDir = await this.showScriptMenu(scriptDirs);
              console.log(`✅ Selected: ${selectedDir.name}`);

              const scripts = this.findSimulationScripts(selectedDir.path);
              
              if (scripts.length === 0) {
                  console.log('❌ No simulation scripts found');
                  process.exit(1);
              }

              while (true) {
                  const selection = await this.showSimulationScriptMenu(scripts);
                  
                  if (selection === 'back') {
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