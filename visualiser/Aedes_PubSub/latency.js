const fs = require('fs');

// Read the contents of the JSON files
const sentMessagesData = JSON.parse(fs.readFileSync('sent_messages.json'));
const receivedMessagesData = JSON.parse(fs.readFileSync('received_messages.json'));

// Create a mapping of sent messages using messageId as the key
const sentMessagesMap = {};
sentMessagesData.forEach((message) => {
  sentMessagesMap[message.messageId] = message;
});

// Calculate latency for each received message
receivedMessagesData.forEach((receivedMessage) => {
  const sentMessage = sentMessagesMap[receivedMessage.messageId];
  if (sentMessage) {
    const sentTimestamp = sentMessage.timestamp;
    const receivedTime = receivedMessage.receivedTime;
    const latency = receivedTime - sentTimestamp;

    console.log(`Message ID: ${receivedMessage.messageId}`);
    console.log(`Client Name: ${receivedMessage.clientName}`);
    console.log(`Latency (ms): ${latency}`);
  } else {
    console.log(`No matching sent message found for received message with ID ${receivedMessage.messageId}`);
  }
});
