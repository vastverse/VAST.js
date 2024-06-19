const fs = require('fs');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const LOG_DIR = "./VastPackets/";
const MAX_WORKERS = 10; // Maximum number of worker threads
const workers = []; // Array to hold worker references
let currentWorkerIndex = 0;

// Worker thread function for logging
function logWorkerThread() {
  parentPort.on('message', (messageData) => {
    const { message, category, logDir, currentTime } = messageData;
    const targetFilename = getFilenameByCategory(category, logDir);

    ensureDirectoryExistence(targetFilename);
    const dataToWrite = `${currentTime},${message}\n`;

    try {
      fs.appendFileSync(targetFilename, dataToWrite);
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  });
}

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  fs.mkdirSync(dirname, { recursive: true });
        }


// Helper method to get filename based on log category
function getFilenameByCategory(category, logDir) {
  const filenameMap = {
    VAST_COM_INBOUND: "SPSCLIENT_VC_in_packet_log.csv",
    VAST_COM_OUTBOUND: "SPSCLIENT_VC_out_packet_log.csv",
    MATCHER_INBOUND: "SPSCLIENT_M_in_packet_log.csv",
    MATCHER_OUTBOUND: "SPSCLIENT_M_out_packet_log.csv",
    CLIENT_INBOUND: "MATCHER_C_in_packet_log.csv",
    CLIENT_OUTBOUND: "MATCHER_C_out_packet_log.csv",
    // ... other cases
  };

  const filename = filenameMap[category];
  return path.join(logDir, filename);
}

// Record the start time when the script runs
const startTime = process.hrtime.bigint();

function getFormattedHighResolutionTime() {
  // Current time in milliseconds since the Unix epoch
  const now = Date.now();

  // High-resolution time difference in nanoseconds
  const hrDiff = process.hrtime.bigint() - startTime;

  // Convert high-resolution difference to milliseconds and add to current time
  const timeInMs = now + Number(hrDiff / 1000000n);

  // Convert to a Date object
  const date = new Date(timeInMs);

  // Format the date-time string
  const formattedTime = new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, fractionalSecondDigits: 3
  }).format(date);

  return formattedTime;
}

function initWorkers() {
  for (let i = 0; i < MAX_WORKERS; i++) {
    const worker = new Worker(__filename);
    workers.push(worker);
  }
}

function log(message, category) {
  // const currentTime = getFormattedHighResolutionTime();
  // if (isMainThread) {
  //   if (workers.length === 0) {
  //     initWorkers();
  //   }

  //   const worker = workers[currentWorkerIndex];
  //   worker.postMessage({ message, category, logDir: LOG_DIR, currentTime });
  //   currentWorkerIndex = (currentWorkerIndex + 1) % MAX_WORKERS;
  // } else {
  //   logWorkerThread();
  // }
}

module.exports = { log };

if (!isMainThread) {
  logWorkerThread();
}

// Optionally, implement graceful shutdown logic
process.on('SIGINT', () => {
  console.log('Shutting down workers...');
  workers.forEach(worker => worker.terminate());
  process.exit(0);
});
