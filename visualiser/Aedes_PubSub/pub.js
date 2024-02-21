const fs = require('fs');
const mqtt = require('mqtt');
const { v4: uuidv4 } = require('uuid'); // Import the uuid library

const sentMessages = [];
const generatedUUIDs = [];
const clientIDMap = new Map(); // Map to store clientID for each clientName

// Function to get or create a clientID for a clientName
function getClientID(clientName) {
  if (!clientIDMap.has(clientName)) {
    const clientID = uuidv4(); // Generate a unique clientID
    clientIDMap.set(clientName, clientID);
  }
  return clientIDMap.get(clientName);
}

// Function to execute the publish command
async function executePublishCommand(command) {
  // Split the command into individual parts
  const parts = command.split(' ');

  if (parts.length < 7) {
    console.error('Invalid publish command:', command);
    return;
  }

  const clientName = parts[1];
  const x = parseFloat(parts[2]);
  const y = parseFloat(parts[3]);
  const r = parseFloat(parts[4]);
  const channel = parts[5];
  const message = parts.slice(6).join(' ');

  // Get the clientID for the clientName
  const clientID = getClientID(clientName);

  // Generate a UUID for the message
  const messageId = uuidv4();

  // Push the generated UUID to the array
  generatedUUIDs.push(messageId);

  // Connect to the MQTT broker with the clientID
  const publisher = mqtt.connect('mqtt://localhost', { clientId: clientName });

  return new Promise((resolve, reject) => {
    publisher.on('connect', function () {
      console.log(`Publisher for ${clientName} (ClientID: ${clientID}) connected`);
      publisher.publish(channel, message, { qos: 0 }, function () {
        console.log(`Published message for ${clientName} (ClientID: ${clientID}): ${message}`);
        resolve();
      });
    });

    publisher.on('error', function (err) {
      console.error(`Error with publisher for ${clientName} (ClientID: ${clientID}):`, err);
      reject(err);
    });
  });
}

// Function to execute the wait command
async function executeWaitCommand(command) {
  // Split the command and extract the time to wait (in milliseconds)
  const timeToWait = parseInt(command.split(' ')[1]);

  if (!isNaN(timeToWait)) {
    console.log(`Waiting for ${timeToWait} ms...`);
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`Wait finished (${timeToWait} ms).`);
        resolve();
      }, timeToWait);
    });
  } else {
    console.error('Invalid wait command:', command);
    return Promise.reject(new Error('Invalid wait command'));
  }
}

// Read and execute commands from the script file
const inputFileName = 'script.txt';

const data = fs.readFileSync(inputFileName, 'utf8');
const commands = data.split('\n');

// Execute commands sequentially
(async () => {
  for (const command of commands) {
    // Skip lines starting with "//", "newMatcher", or "subscribe"
    if (command.trim() === '' || command.startsWith('//') || command.startsWith('newMatcher') || command.startsWith('newClient') || command.startsWith('subscribe')) {
      continue;
    }

    try {
      if (command.startsWith('wait')) {
        await executeWaitCommand(command);
      } else {
        await executePublishCommand(command);
      }
    } catch (err) {
      console.error('Error executing command:', err);
    }
  }

  // Write sentMessages to a JSON file
  fs.writeFileSync('sent_messages.json', JSON.stringify(sentMessages, null, 2));
  console.log('Sent messages logged to sent_messages.json');

  // Write generatedUUIDs to a separate JSON file
  fs.writeFileSync('generated_uuids.json', JSON.stringify(generatedUUIDs, null, 2));
  console.log('Generated UUIDs logged to generated_uuids.json');
})();
