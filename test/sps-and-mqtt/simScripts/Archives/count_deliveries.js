const fs = require('fs');
const path = require('path');

const scriptPath = path.join(__dirname, 'simulationScript.txt');

const subscribeRegex = /^subscribe\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)/;
const publishRegex = /^publish\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)/;

const subscribes = [];
const publishes = [];

const lines = fs.readFileSync(scriptPath, 'utf-8').split('\n');

for (const line of lines) {
  let m = subscribeRegex.exec(line);
  if (m) {
    const [, client, x, y, r, channel] = m;
    subscribes.push({ client, x: +x, y: +y, r: +r, channel });
    continue;
  }
  m = publishRegex.exec(line);
  if (m) {
    const [, client, x, y, r, channel] = m;
    publishes.push({ client, x: +x, y: +y, r: +r, channel });
  }
}

function circlesOverlap(x1, y1, r1, x2, y2, r2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist <= (r1 + r2);
}

let deliveries = 0;
for (const pub of publishes) {
  for (const sub of subscribes) {
    if (pub.channel === sub.channel) {
      if (circlesOverlap(pub.x, pub.y, pub.r, sub.x, sub.y, sub.r)) {
        deliveries++;
      }
    }
  }
}

console.log(`Total expected message deliveries: ${deliveries}`); 