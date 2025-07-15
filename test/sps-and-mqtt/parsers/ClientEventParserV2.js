//importing data from text file
const fs = require('fs');
const path = require('path');
const common = require('../../../lib/common');

const readline = require('readline');

class EventProcessor {
    constructor() {
        this.resetState();
    }

    resetState() {
        this.events = [];
        this.clients = {};
        this.subscriptions = {};
        this.publications = {};
    }

    async processFile(filename) {
        if (filename.length > 4 && filename.slice(-4) != ".txt") {
            error("Please Provide A Text File");
            return;
        }

        console.log(`\nProcessing file: ${filename}`);
        console.log('----------------------------------------');

        return new Promise((resolve, reject) => {
            const fileStream = fs.createReadStream(filename);
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });

            rl.on('line', (line) => {
                this.events.push(JSON.parse(line));
            });

            rl.on('close', () => {
                this.analyzeEvents();
                this.resetState();
                resolve();
            });

            rl.on('error', (error) => {
                reject(error);
            });
        });
    }

    analyzeEvents() {
        console.log('Finished reading the file.');
        console.log('Read ' + this.events.length + ' events');

        const sortedEvents = this.events.slice().sort(this.compare);
        const receivedPublications = [];

        // Process all events except received publications
        for (const currentEvent of sortedEvents) {
            if (currentEvent.event !== Client_Event.RECEIVE_PUB) {
                this.prepareClientEvent(currentEvent);
            } else {
                receivedPublications.push(currentEvent);
            }
        }

        // Process received publications
        for (const currentEvent of receivedPublications) {
            this.prepareClientEvent(currentEvent);
        }

        this.printStatistics();
    }

    compare(a, b) {
        let result = a.time - b.time;
        if (result === 0) {
            result = a.event - b.event;
        }
        return result;
    }

    printStatistics() {
        let totalSubscriptions = 0;
        let totalRecipients = 0;
        let totalErrors = 0;
        let totalCorrect = 0;
        let totalExtra = 0;
        let totalUndelivered = 0;

        for (const pubID in this.publications) {
            const pub = this.publications[pubID];
            totalSubscriptions += pub.subscribers.length;
            totalRecipients += pub.recipients.length;

            const uniqSubscribers = new Set(pub.subscribers);
            const uniqRecipients = new Set(pub.recipients);
            const uniqCombined = Array.from(uniqSubscribers).concat(Array.from(uniqRecipients));
            const combinedSubscribers = new Map();
            const combinedRecipients = new Map();

            uniqCombined.forEach(obj => {
                combinedSubscribers.set(obj, 0);
                combinedRecipients.set(obj, 0);
            });

            for (const recipientID of pub.recipients) {
                const count = pub.recipients.reduce((counter, obj) => obj === recipientID ? counter += 1 : counter, 0);
                combinedRecipients.set(recipientID, count);
            }

            for (const subscriberID of pub.subscribers) {
                const count = pub.subscribers.reduce((counter, obj) => obj === subscriberID ? counter += 1 : counter, 0);
                combinedSubscribers.set(subscriberID, count);
            }

            const uniqCombinedComparison = new Map();
            uniqCombined.forEach(obj => {
                const value = combinedRecipients.get(obj) - combinedSubscribers.get(obj);
                uniqCombinedComparison.set(obj, value);
            });

            uniqCombinedComparison.forEach((value, key) => {
                totalErrors += Math.abs(value);
                if (value > 0) {
                    totalExtra += value;
                    console.log('Too many copies of publication [' + pubID + '] was delivered to Client [' + key + ']');
                }
                if (value < 0) {
                    totalUndelivered += Math.abs(value);
                    console.log('Not enough copies of publication [' + pubID + '] was delivered to Client [' + key + ']');
                }
                if (value === 0) {
                    totalCorrect++;
                }
            });
        }

        console.log("Number of clients: " + Object.keys(this.clients).length);
        console.log("Number of publications: " + Object.keys(this.publications).length);
        console.log('[' + totalRecipients + '] publications delivered for [' + totalSubscriptions + '] subscriptions');
        console.log('[' + totalCorrect + '/' + totalSubscriptions + '] publications were correctly delivered');
        console.log('[' + totalErrors + '] publications were incorrectly delivered');
        console.log('[' + totalUndelivered + '] publications undelivered');
        console.log('[' + totalExtra + '] superfluous publications delivered');
    }

    prepareClientEvent(data) {
        switch (data.event) {
            case Client_Event.CLIENT_JOIN: {
                if (Object.keys(this.clients).includes(data.id)) {
                    const client = this.clients[data.id];
                    client.time.push(data.time);
                    client.pos = data.pos;
                    client.matcher = data.matcher;
                } else {
                    const client = {
                        id: data.id,
                        alias: data.alias,
                        pos: data.pos,
                        matcher: data.matcher,
                        time: [data.time],
                        leavetime: []
                    };
                    this.clients[client.id] = client;
                }
                break;
            }

            case Client_Event.CLIENT_MOVE: {
                const client = this.clients[data.id];
                client.pos = data.pos;
                break;
            }

            case Client_Event.CLIENT_LEAVE: {
                if (Object.keys(this.clients).includes(data.id)) {
                    const client = this.clients[data.id];
                    client.leavetime.push(data.time);
                }
                break;
            }

            case Client_Event.SUB_NEW:
            case Client_Event.SUB_UPDATE: {
                const sub = data.sub;
                this.subscriptions[sub.subID] = sub;
                break;
            }

            case Client_Event.SUB_DELETE: {
                delete this.subscriptions[data.subID];
                break;
            }

            case Client_Event.PUB: {
                this.publications[data.pub.pubID] = {
                    time: data.time,
                    pub: data.pub,
                    subscribers: [],
                    recipients: []
                };

                for (const subID in this.subscriptions) {
                    const sub = this.subscriptions[subID];
                    if (this.compareAoI(data.pub.aoi, sub.aoi) && (data.pub.channel == sub.channel)) {
                        this.publications[data.pub.pubID].subscribers.push(sub.clientID);
                    }
                }
                break;
            }

            case Client_Event.RECEIVE_PUB: {
                if (Object.keys(this.publications).includes(data.pub.pubID)) {
                    const pub = this.publications[data.pub.pubID];
                    pub.recipients.push(data.id);
                }
                break;
            }
        }
    }

    compareAoI(pub_aoi, sub_aoi) {
        const distance = Math.sqrt(
            (pub_aoi.center.x - sub_aoi.center.x) ** 2 +
            (pub_aoi.center.y - sub_aoi.center.y) ** 2
        );
        return distance < (pub_aoi.radius + sub_aoi.radius);
    }
}

// If this file is run directly
if (require.main === module) {
    const processor = new EventProcessor();
    const filename = process.argv[2] || "/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/visualiser/logs_and_events/Client_events.txt";
    processor.processFile(filename);
}

module.exports = EventProcessor; 