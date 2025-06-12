const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Function to generate a random payload string
function generatePayload() {
  const payloadLength = Math.floor(Math.random() * 20) + 1;
  let payload = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (let i = 0; i < payloadLength; i++) {
    payload += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return payload;
}

// Settings
const MODE = {
  SIMPLE: { matchers: 1, communicators: 20 },
  COMPLEX: { matchers: 3, communicators: 50 },
  DYNAMIC: { matchers: 2, communicators: 30 }
};

const selectedMode = MODE.SIMPLE; // Change this to switch between modes

// Function to generate random coordinates within a specific cluster
function generateClusterCoordinates(cluster, clusterCount, worldSizeX, worldSizeY) {
  const clusterWidth = Math.floor(worldSizeX / clusterCount);
  const clusterHeight = Math.floor(worldSizeY / clusterCount);
  const clusterIndex = cluster - 1;
  const x = Math.floor((clusterIndex % clusterCount) * clusterWidth + Math.random() * clusterWidth) + 1;
  const y = Math.floor(Math.floor(clusterIndex / clusterCount) * clusterHeight + Math.random() * clusterHeight) + 1;
  return { x, y };
}

// Function to generate entry for starting a new Matcher or Gateway
function generateNewMatcherEntry(alias, isGateway, GW_host, GW_port, VON_port, client_port, x_ord, y_ord, radius) {
  return `newMatcher ${alias} ${isGateway} ${GW_host} ${GW_port} ${VON_port} ${client_port} ${x_ord} ${y_ord} ${radius}`;
}

// Function to generate entry for starting a new client
function generateNewClientEntry(alias, GW_host, GW_port, x_ord, y_ord, radius) {
  return `newClient ${alias} ${GW_host} ${GW_port} ${x_ord} ${y_ord} ${radius}`;
}

// Function to generate entry based on mode and counts
function generateEntry(mode, index, gateways, matchers, communicators, clusterCount, worldSizeX, worldSizeY) {
  const clusterIndex = (index - 1) % matchers + 1; // Assign communicator to a cluster based on matcher count
  const { x, y } = generateClusterCoordinates(clusterIndex, clusterCount, worldSizeX, worldSizeY);
  const radius = Math.floor(Math.random() * 200) + 100; // Random radius between 100 and 300
  const nodeIdentifier = `C${index}`; // Node identifier linked to the generated node

  if (index <= communicators) {
    if (index <= communicators / 2) {
      return `publish ${nodeIdentifier} ${x} ${y} ${radius} temp "${uuidv4()}"`; // Generate unique UUID for publisher
    } else {
      return `subscribe ${nodeIdentifier} ${x} ${y} ${radius} temp`;
    }
  }
}

// Generate entries based on mode and counts
const gatewaysCount = 1; // Number of gateways
const matchersCount = selectedMode.matchers; // Number of matchers for the selected mode
const communicatorsCount = selectedMode.communicators; // Total number of communicators for the selected mode
const clusterCount = matchersCount; // Each matcher is assigned to a cluster
const worldSizeX = 1000; // World size in X coordinates
const worldSizeY = 1000; // World size in Y coordinates

const entries = [];

// // Add a comment for the 10-minute wait
// entries.push("// Wait for 10 minutes before any publishing or subscribing");
// entries.push("wait 600000\n");

// Generate entries for starting Gateways and Matchers
entries.push("// Start the Gateway");

for (let i = 1; i <= gatewaysCount; i++) {
  const center_x = Math.floor(worldSizeX / 2);
  const center_y = Math.floor(worldSizeY / 2);
  const entry = generateNewMatcherEntry(`GW${i}`, true, "localhost", 8000, 8000 + i, 8000, center_x, center_y, 100);
  entries.push(entry);
  entries.push(`wait 100\n`);
}

entries.push("// Start other matchers");

for (let i = 2; i <= matchersCount + 1; i++) {
  const entry = generateNewMatcherEntry(`M${i}`, false, "localhost", 8000, 8000 + i, 8010, Math.floor(Math.random() * 1000) + 1, Math.floor(Math.random() * 1000) + 1, 100);
  entries.push(entry);
  entries.push(`wait 100\n`);
}

// Generate entries for Clients
for (let i = 1; i <= communicatorsCount; i++) {
  const x = Math.floor(Math.random() * worldSizeX) + 1;
  const y = Math.floor(Math.random() * worldSizeY) + 1;
  const entry = generateNewClientEntry(`C${i}`, "localhost", 8000, x, y, 100);
  entries.push(entry);
  entries.push(`wait 200\n`); // Wait after creating each client
}

// Add a 10-minute wait before publishing or subscribing
entries.push("// Wait for 10 minutes before publishing or subscribing");
entries.push("wait 600000\n"); // 10 minutes in milliseconds



// Generate entries for Communicators
for (let i = 1; i <= communicatorsCount; i++) {
  const entry = generateEntry(selectedMode, i, gatewaysCount, matchersCount, communicatorsCount, clusterCount, worldSizeX, worldSizeY);
  entries.push(entry);
  entries.push(`wait 500\n`);
}

// Get current date and time
const currentDate = new Date();
const formattedDate = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')}`;
const formattedTime = `${currentDate.getHours().toString().padStart(2, '0')}-${currentDate.getMinutes().toString().padStart(2, '0')}-${currentDate.getSeconds().toString().padStart(2, '0')}`;

// Get the selected mode key
const modeKey = Object.keys(MODE).find(key => MODE[key] === selectedMode);

// Write the entries to a file with mode and world size in filename
const filename = `GeneratedNodes_${modeKey}_${formattedDate}_${formattedTime}.txt`;
fs.writeFileSync(filename, entries.join('\n'));

console.log(`Generated and saved ${entries.length / 2} entries to ${filename}`);
