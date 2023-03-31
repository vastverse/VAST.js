// Run this file on device with log files to visualise the changes in the Virtual environment

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const filePath = './logs_and_events/Matcher_events.txt';

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
        if (eventType === 'change') {
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

const PORT = process.env.PORT || 1111;
server.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
