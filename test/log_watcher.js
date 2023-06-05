const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const express = require('express');
const path = require('path');
const readline = require('readline');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const filePath = './logs_and_events/Matcher_events.txt';

// Clear log and event files
const files = [filePath, './logs_and_events/Client_logs.txt', './logs_and_events/Matcher_logs.txt'];

files.forEach((filePath) => {
  fs.writeFile(filePath, '', 'utf8', (err) => {
    if (err) {
      console.error(`Error while clearing the contents of ${filePath}:`, err);
    } else {
      console.log(`File contents of ${filePath} cleared successfully.`);
    }
  });
});

let isPaused = false; // Flag to track if input is paused

// Function to handle commands from terminal input
function handleCommand(command) {
  if (command === 'pause') {
    isPaused = true;
    console.log('Input paused');
  } else if (command === 'start') {
    isPaused = false;
    console.log('Input started');
  }
}

// Set up readline interface to listen for terminal input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Listen for terminal input and handle commands
rl.on('line', (input) => {
  handleCommand(input.trim());
});

wss.on('connection', (ws) => {
  console.log('Client connected');

  // Send the initial file content to the client
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error(`Error reading file: ${err}`);
    } else {
      ws.send(JSON.stringify({ type: 'fileContent', content: data }));
    }
  });

  // Watch the file for changes and send updates to the client
  const fileWatcher = fs.watch(filePath, (eventType) => {
    if (eventType === 'change' && !isPaused) {
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
          console.error(`Error reading file: ${err}`);
        } else {
          ws.send(JSON.stringify({ type: 'fileContent', content: data }));
        }
      });
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    fileWatcher.close(); // Stop watching the file when the client disconnects
  });
});

app.use(express.json());

app.post('/log', (req, res) => {
  const logData = req.body.logData;
  const filename = req.body.filename;
  const directory = req.body.directory;
  const extension = req.body.extension;

  console.log('Received log data:', logData); // Print the received log data

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  fs.appendFile(path.join(directory, filename + extension), logData, (err) => {
    if (err) {
      console.error(err);
      res.status(500).send('Error writing log data to file');
    } else {
      res.status(200).send('Log data written to file');
    }
  });
});

const PORT = process.env.PORT || 1111;
server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
