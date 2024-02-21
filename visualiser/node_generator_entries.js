const fs = require('fs');

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

// Create an array to store the entries
const entries = [];

var requestcount = 1000;

// Generate 100 c2 entries
for (let i = 1; i <= requestcount; i++) {
  // const payload = generatePayload();
  const entry = `publish C2 400 500 150 temp "hello${i} from C2!"`;
  entries.push(entry);
  entries.push(`wait 500\n`);
}

// Write the entries to a file
const filename = 'output_entries.txt';
fs.writeFileSync(filename, entries.join('\n'));

console.log(`Generated and saved ${entries.length / 2} entries to ${filename}`);
