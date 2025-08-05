const fs = require('fs');
const path = require('path');

const spsScriptPath = path.join(__dirname, 'simulationScript.txt');
const mqttScriptPath = path.join(__dirname, 'mqtt_simulationScript.txt');

// Parse SPS deliveries per channel from count_deliveries.js logic
// We'll re-parse the script for subscribes and publishes, and count expected deliveries per channel
const subscribeRegex = /^subscribe\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)/;
const publishRegex = /^publish\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+"([^"]*)"/;

const subscribes = [];
const publishes = [];
const subscribersByChannel = {};
const deliveriesByChannel = {};
const clientCoords = {}; // { client: { x, y, r } }
const clientChannelCoords = {}; // { client: { channel: { x, y, r } } }
const publishesByChannel = {}; // { channel: [publishObj, ...] }

const lines = fs.readFileSync(spsScriptPath, 'utf-8').split('\n');

for (const line of lines) {
  let m = subscribeRegex.exec(line);
  if (m) {
    const [, client, x, y, r, channel] = m;
    subscribes.push({ client, x: +x, y: +y, r: +r, channel });
    if (!subscribersByChannel[channel]) subscribersByChannel[channel] = new Set();
    subscribersByChannel[channel].add(client);
    // Save the first coordinates for each client (for newClient)
    if (!clientCoords[client]) clientCoords[client] = { x: +x, y: +y, r: +r };
    // Save per channel as well (for subscribe)
    if (!clientChannelCoords[client]) clientChannelCoords[client] = {};
    clientChannelCoords[client][channel] = { x: +x, y: +y, r: +r };
  }
  m = publishRegex.exec(line);
  if (m) {
    const [, client, x, y, r, channel, message] = m;
    const pubObj = { client, x: +x, y: +y, r: +r, channel, message };
    publishes.push(pubObj);
    if (!publishesByChannel[channel]) publishesByChannel[channel] = [];
    publishesByChannel[channel].push(pubObj);
  }
}

function circlesOverlap(x1, y1, r1, x2, y2, r2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist <= (r1 + r2);
}

// Count expected deliveries per channel
for (const pub of publishes) {
  for (const sub of subscribes) {
    if (pub.channel === sub.channel) {
      if (circlesOverlap(pub.x, pub.y, pub.r, sub.x, sub.y, sub.r)) {
        deliveriesByChannel[pub.channel] = (deliveriesByChannel[pub.channel] || 0) + 1;
      }
    }
  }
}

// Generate MQTT simulation script
let output = [];
output.push('// MQTT Simulation Script (auto-generated)');
output.push('// Each channel matches the number of expected deliveries from the SPS scenario');
output.push('');

// Add all subscribers (clients) for all channels, using their original coordinates
const allClients = new Set();
for (const channel in subscribersByChannel) {
  for (const client of subscribersByChannel[channel]) {
    allClients.add(client);
  }
}
for (const client of allClients) {
  const { x, y, r } = clientCoords[client] || { x: 0, y: 0, r: 100 };
  output.push(`newClient ${client} localhost 20000 ${x} ${y} ${r}`);
  output.push('wait 100');
}
output.push('');
// Add all subscriptions, using their original coordinates/radius for each channel
for (const channel in subscribersByChannel) {
  for (const client of subscribersByChannel[channel]) {
    const coords = (clientChannelCoords[client] && clientChannelCoords[client][channel]) || { x: 0, y: 0, r: 0 };
    output.push(`subscribe ${client} ${coords.x} ${coords.y} ${coords.r} ${channel}`);
    output.push('wait 200');
  }
}
output.push('');

// For each channel, generate the required number of publishes, cycling through original publishes for that channel
for (const channel in deliveriesByChannel) {
  const numDeliveries = deliveriesByChannel[channel];
  const subscribers = Array.from(subscribersByChannel[channel] || []);
  const numSubscribers = subscribers.length;
  if (numSubscribers === 0) continue;
  const numPublishes = Math.ceil(numDeliveries / numSubscribers);
  const channelPublishes = publishesByChannel[channel] || [];
  for (let i = 0; i < numPublishes; i++) {
    // Cycle through original publishes for this channel
    const pubObj = channelPublishes[i % channelPublishes.length] || { client: subscribers[i % subscribers.length], x: 0, y: 0, r: 0, message: `MQTT message ${i + 1} for ${channel}` };
    output.push(`publish ${pubObj.client} ${pubObj.x} ${pubObj.y} ${pubObj.r} ${channel} "${pubObj.message}"`);
    output.push('wait 500');
  }
  output.push('');
}
output.push('wait 10000');
output.push('end');

fs.writeFileSync(mqttScriptPath, output.join('\n'), 'utf-8');
console.log(`MQTT simulation script generated at ${mqttScriptPath}`);
for (const channel in deliveriesByChannel) {
  const subscribers = Array.from(subscribersByChannel[channel] || []);
  const numPublishes = Math.ceil(deliveriesByChannel[channel] / (subscribers.length || 1));
  console.log(`Channel: ${channel}, Subscribers: ${subscribers.length}, Publishes: ${numPublishes}, Estimated deliveries: ${subscribers.length * numPublishes}`);
} 