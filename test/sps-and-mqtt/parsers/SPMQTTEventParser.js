const fs = require('fs');
const readline = require('readline');
const common = require('../../../lib/common');

function parseChannel(channelStr) {
    // channelStr is like: sp: <{"x":500,"y":500,"radius":300,"channel":"channel1"}>
    const match = channelStr.match(/sp: <(.+)>/);
    if (!match) return null;
    try {
        return JSON.parse(match[1]);
    } catch {
        return null;
    }
}

function aoiOverlap(a, b) {
    const dx = a.center.x - b.center.x;
    const dy = a.center.y - b.center.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < (a.radius + b.radius);
}

class SPMQTTEventParser {
    constructor() {
        this.resetState();
    }

    resetState() {
        this.clients = {};
        this.subscriptions = {};
        this.publications = {};
    }

    async processFile(filename) {
        this.resetState();
        const fileStream = fs.createReadStream(filename);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        for await (const line of rl) {
            if (!line.trim()) continue;
            const event = JSON.parse(line);
            this.processEvent(event);
        }

        this.analyze();
    }

    processEvent(event) {
        switch (event.event) {
            case 0: // CLIENT_JOIN
                this.clients[event.id] = { pos: event.pos, alias: event.alias };
                break;
            case 6: // SUB_NEW
                this.subscriptions[event.sub.subID] = {
                    clientID: event.sub.clientID,
                    channel: event.sub.channel,
                    channelObj: parseChannel(event.sub.channel),
                    aoi: event.sub.aoi
                };
                break;
            case 9: // PUB
                this.publications[event.pub.pubID] = {
                    pub: event.pub,
                    channel: event.pub.channel,
                    channelObj: parseChannel(event.pub.channel),
                    recipients: []
                };
                break;
            case 10: // RECEIVE_PUB
                if (this.publications[event.pub.pubID]) {
                    this.publications[event.pub.pubID].recipients.push(event.id);
                }
                break;
        }
    }

    analyze() {
        let totalCorrect = 0, totalExtra = 0, totalUndelivered = 0, totalSubscriptions = 0, totalRecipients = 0;
        for (const pubID in this.publications) {
            const pub = this.publications[pubID];
            const expectedRecipients = [];
            for (const subID in this.subscriptions) {
                const sub = this.subscriptions[subID];
                // Match by base channel and AOI overlap
                if (
                    sub.channelObj && pub.channelObj &&
                    sub.channelObj.channel === pub.channelObj.channel &&
                    aoiOverlap(pub.pub.aoi, sub.aoi)
                ) {
                    expectedRecipients.push(sub.clientID);
                }
            }
            totalSubscriptions += expectedRecipients.length;
            totalRecipients += pub.recipients.length;
            const actualRecipients = pub.recipients;
            const expectedSet = new Set(expectedRecipients);
            const actualSet = new Set(actualRecipients);

            for (const client of expectedSet) {
                if (actualSet.has(client)) {
                    totalCorrect++;
                } else {
                    totalUndelivered++;
                    console.log(`Publication [${pubID}] NOT delivered to expected client [${client}]`);
                }
            }
            for (const client of actualSet) {
                if (!expectedSet.has(client)) {
                    totalExtra++;
                    console.log(`Publication [${pubID}] delivered to UNEXPECTED client [${client}]`);
                }
            }
        }
        console.log('Number of clients: ' + Object.keys(this.clients).length);
        console.log('Number of publications: ' + Object.keys(this.publications).length);
        console.log('[' + totalRecipients + '] publications delivered for [' + totalSubscriptions + '] subscriptions');
        console.log('[' + totalCorrect + '/' + totalSubscriptions + '] publications were correctly delivered');
        console.log('[' + (totalUndelivered + totalExtra) + '] publications were incorrectly delivered');
        console.log('[' + totalUndelivered + '] publications undelivered');
        console.log('[' + totalExtra + '] superfluous publications delivered');
    }
}

// Usage example (uncomment to run directly):
if (require.main === module) {
    const parser = new SPMQTTEventParser();
    parser.processFile('./logs/spmqtt_events/spmqtt_client_events_no_broker.txt');
}
module.exports = SPMQTTEventParser; 