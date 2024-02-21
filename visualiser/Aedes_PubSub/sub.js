const fs = require('fs');
const mqtt = require('mqtt');

const receivedMessages = [];

// Function to execute the subscribe command
async function executeSubscribeCommand(command) {
  // Split the command into individual parts
  const parts = command.split(' ');

  if (parts.length < 6) {
    console.error('Invalid subscribe command:', command);
    return;
  }

  const clientName = parts[1];
  const x = parseFloat(parts[2]);
  const y = parseFloat(parts[3]);
  const r = parseFloat(parts[4]);
  const channel = parts[5];

  // Connect to the MQTT broker
  const subscriber = mqtt.connect('mqtt://localhost');

  subscriber.on('connect', function () {
    console.log(`Subscriber for ${clientName} connected`);
    subscriber.subscribe(channel, function (err) {
      if (err) {
        console.error(`Error subscribing for ${clientName}:`, err);
      } else {
        console.log(`Subscribed for ${clientName} to channel: ${channel}`);
      }
    });
  });

  subscriber.on('message', function (topic, message) {
    const receivedTime = new Date().getTime(); // Get the current time as a Unix timestamp
    const messageText = message.toString('utf8'); // Convert the message buffer to a string
    console.log(`Subscriber for ${clientName} received: ${messageText}`);
    
    // Log the received message and time to the receivedMessages array
    receivedMessages.push({ clientName, channel, message: messageText, receivedTime });

    // Write receivedMessages to a JSON file
    fs.writeFileSync('received_messages.json', JSON.stringify(receivedMessages, null, 2));
  });

  subscriber.on('error', function (err) {
    console.error(`Error with subscriber for ${clientName}:`, err);
  });
}

// Read and execute commands from the script file
const inputFileName = 'script.txt';

const data = fs.readFileSync(inputFileName, 'utf8');
const commands = data.split('\n');

// Execute subscribe commands sequentially
for (const command of commands) {
  if (command.trim() === '' || command.startsWith('//') || command.startsWith('newMatcher') || command.startsWith('newClient') || command.startsWith('newClient') || command.startsWith('publish')) {
    continue;
  }

  try {
    if (command.startsWith('subscribe')) {
      executeSubscribeCommand(command);
    } else {
      console.error('Unrecognized command:', command);
    }
  } catch (err) {
    console.error('Error executing command:', err);
  }
}
