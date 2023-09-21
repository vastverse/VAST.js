const fs = require('fs');
const path = require('path');

class dataCapture {

    static OUTBOUND_FILENAME = './packet_results/outbound_packet_log.csv';
    static INBOUND_FILENAME = './packet_results/inbound_packet_log.csv';

    /**
     * Checks if the file's directory exists, if not, creates it. 
     * Also clears the file content if it exists.
     */
    static prepareFile(filename) {
        const directory = path.dirname(filename);

        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
        }

        if (fs.existsSync(filename)) {
            fs.writeFileSync(filename, ''); // This will empty the file
        }
    }

    /**
     * Log a message with the current timestamp either in inbound or outbound file.
     * @param {string} message - The message to be logged.
     * @param {boolean} inbound - True if inbound, false otherwise.
     */
    static log(message, inbound) {
        const targetFilename = inbound ? this.INBOUND_FILENAME : this.OUTBOUND_FILENAME;
        this.prepareFile(targetFilename);

        const date = new Date();
        const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
        
        const logMessage = `${formattedDate},${message}\n`;
        fs.appendFileSync(targetFilename, logMessage);
    }
}

// Usage Example:
// DataCapture.log("Some outbound message", false);
// DataCapture.log("Some inbound message", true);
