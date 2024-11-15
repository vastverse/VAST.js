const aedes = require('aedes')();
const server = require('net').createServer(aedes.handle);

const fs = require('fs');
const receivedMessagesFile = 'received_messages.json';

// Create the received messages array or read it from an existing file
let receivedMessages = [];

if (fs.existsSync(receivedMessagesFile)) {
  // If the file exists, read the received messages
  receivedMessages = JSON.parse(fs.readFileSync(receivedMessagesFile, 'utf8'));
} else {
  // If the file doesn't exist, start with an empty array
  receivedMessages = [];
}

// Function to handle incoming messages
aedes.on('publish', function (packet, client) {
  if (client) {
    const message = {
      clientName: client.id,
      topic: packet.topic,
      payload: packet.payload.toString(),
      receivedTime: new Date().toISOString(),
    };

    // Append the received message to the array
    receivedMessages.push(message);

    // Write the array to the JSON file
    fs.writeFileSync(receivedMessagesFile, JSON.stringify(receivedMessages, null, 2));

    console.log(`Received message from ${client.id}:`, message);
  }
});

server.listen(1883, function () {
  console.log('Broker server listening on port 1883');
});
