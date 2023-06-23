const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const express = require('express');
const path = require('path');
const readline = require('readline');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const logDirectoryPath = './logs_and_events/Matcher_event.txt';
const eventFiles = [logDirectoryPath, './logs_and_events/Client_logs.txt', './logs_and_events/Matcher_logs.txt'];
const Matcher_Event = { MATCHER_JOIN: 0, MATCHER_MOVE: 1, CLIENT_JOIN: 2, CLIENT_MOVE: 3, CLIENT_LEAVE: 4, SUB_NEW: 5, SUB_UPDATE: 6, SUB_DELETE: 7, PUB: 8 };
let logs = [], logCount = 0, inputPaused = false, lastSaveTimestamp = Date.now(), saveInterval;

eventFiles.forEach(filePath => {
  fs.writeFile(filePath, '', 'utf8', error => error ? console.error(`Error while clearing the contents of ${filePath}:`, error) : console.log(`File contents of ${filePath} cleared successfully.`));
});

const commandHandler = command => {
  if (command === 'pause') {
    inputPaused = true;
    console.log('Input paused');
  } else if (command === 'start') {
    inputPaused = false;
    console.log('Input started');
  }
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('line', input => commandHandler(input.trim()));

wss.on('connection', ws => {
  console.log('Client connected');
  fs.readFile(logDirectoryPath, 'utf8', (error, data) => error ? console.error(`Error reading file: ${error}`) : ws.send(JSON.stringify({ type: 'fileContent', content: data })));
});

app.use(express.json());

const startSaveInterval = () => {
  if (!saveInterval) {
    saveInterval = setInterval(saveLogs, 100);
  }
};

const stopSaveInterval = () => {
  if (saveInterval) {
    clearInterval(saveInterval);
    saveInterval = null;
  }
};

const sendUpdateToClients = () => {
  fs.readFile(logDirectoryPath, 'utf8', (error, data) => {
    if (error) {
      console.error(`Error reading file: ${error}`);
    } else {
      const fileSizeInBytes = Buffer.byteLength(data, 'utf8');
      console.log(`Sending file of size: ${fileSizeInBytes} bytes`);
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'fileContent', content: data }));
        }
      });
    }
  });
};

const saveLogs = () => {
  if (logs.length > 0) {
    console.log('Saving logs...');
    // logs = logs.filter(log => log.event !== Matcher_Event.SUB_DELETE);
    fs.writeFile(logDirectoryPath, logs.slice(-20).map(log => log.logData).join(''), error => {
      if (error) {
        console.error(error);
      } else {
        console.log('Log data written to file');
        sendUpdateToClients();
      }
    });
    console.log('Amount of lines in log-file: ', logs.length);
    logs.length = 0;
  }
  stopSaveInterval();
};

app.post('/log', (req, res) => {
  try {
    const { logData, filename, directory, extension } = req.body;
    const parsedLog = JSON.parse(logData);
    const { event, time } = parsedLog;
    const subID = (parsedLog.sub && parsedLog.sub.subID) || (parsedLog.msg && parsedLog.msg.subID) || null;

    logCount++;
    console.log('logCounter:', logCount);
    console.log('Received log data:', logData);
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });

    logs.push({ event, time, logData, subID });

    if (logCount >= 20) {
      saveLogs();
      logCount = 0;
    } else if (!saveInterval) {
      startSaveInterval();
    }

    res.status(200).send('Log data received successfully');
  } catch (error) {
    console.error('An error occurred:', error);
    res.status(500).send('An error occurred');
  }
});

const PORT = process.env.PORT || 1111;
server.listen(PORT, () => console.log(`Server started on port ${PORT}`));
