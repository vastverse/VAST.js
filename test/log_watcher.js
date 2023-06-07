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

let logList = []; // List to keep track of logs
let logCounter = 0; // Counter to keep track of log entries

var Matcher_Event = {
  MATCHER_JOIN : 0,
  MATCHER_MOVE : 1,
  CLIENT_JOIN : 2,
  CLIENT_MOVE : 3,   
  CLIENT_LEAVE : 4,
  SUB_NEW : 5,
  SUB_UPDATE : 6, 
  SUB_DELETE : 7, 
  PUB : 8
}

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

  const parsedLog = JSON.parse(logData);
  const event = parsedLog.event;
  const time = parsedLog.time;
  const subID = (parsedLog.sub && parsedLog.sub.subID) || (parsedLog.msg && parsedLog.msg.subID) || null;

  console.log('Received log data:', logData); // Print the received log data

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  // Add the new log data to our logList and increase the logCounter
  logList.push({event, time, logData, subID});
  logCounter++;

  // Check if we have received 50 logs and if so, purge the old logs
  if (logCounter === 50) {
    const currentTime = Date.now();
    logList = logList.filter(log => {
      // We want to keep the log if it is not a PUB event or if it is less than 2 seconds old
      return !(log.event === Matcher_Event.PUB && (currentTime - log.time > 2000));
    });

    // If the event is a SUB_DELETE (7), remove all logs with the same subID
    if (event === Matcher_Event.SUB_DELETE) {
      const deleteSubID = subID;
      logList = logList.filter(log => log.subID !== deleteSubID);
    }

    // Reset counter
    logCounter = 0;

    // Write the updated logList to the file
    fs.writeFile(path.join(directory, filename + extension), logList.map(log => log.logData).join(''), (err) => {
      if (err) {
        console.error(err);
        res.status(500).send('Error writing log data to file');
      } else {
        res.status(200).send('Log data written to file');
      }
    });
    console.log('Amount of lines in log-file: ', logList.length);
  } else {
    // If we have not received 50 logs, simply append the log to the file
    fs.appendFile(path.join(directory, filename + extension), logData, (err) => {
      if (err) {
        console.error(err);
        res.status(500).send('Error writing log data to file');
      } else {
        res.status(200).send('Log data written to file');
      }
    });
  }
});


const PORT = process.env.PORT || 1111;
server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
