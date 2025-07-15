const fs = require('fs');
const readline = require('readline');
const common = require('../../../lib/common');

class MQTTEventParser {
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
                    topic: event.sub.channel,
                    aoi: event.sub.aoi
                };
                break;
            case 9: // PUB
                this.publications[event.pub.pubID] = {
                    pub: event.pub,
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
        let totalCorrect = 0, totalErrors = 0, totalExtra = 0, totalUndelivered = 0;
        let totalSubscriptions = 0;
        let totalRecipients = 0;
        for (const pubID in this.publications) {
            const pub = this.publications[pubID];
            // Find all subscribers to the same topic (ignore AOI overlap for MQTT)
            const expectedRecipients = [];
            for (const subID in this.subscriptions) {
                const sub = this.subscriptions[subID];
                if (sub.topic === pub.pub.channel) {
                    expectedRecipients.push(sub.clientID);
                }
            }
            totalSubscriptions += expectedRecipients.length;
            totalRecipients += pub.recipients.length;
            const actualRecipients = pub.recipients;
            // Compare sets
            const expectedSet = new Set(expectedRecipients);
            const actualSet = new Set(actualRecipients);

            for (const client of expectedSet) {
                if (actualSet.has(client)) {
                    totalCorrect++;
                } else {
                    totalUndelivered++;
                    // console.log(`Publication [${pubID}] NOT delivered to expected client [${client}]`);
                }
            }
            for (const client of actualSet) {
                if (!expectedSet.has(client)) {
                    totalExtra++;
                    // console.log(`Publication [${pubID}] delivered to UNEXPECTED client [${client}]`);
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

    compareAoI(pub_aoi, sub_aoi) {
        if (!pub_aoi || !sub_aoi) return true; // fallback: deliver to all
        const dx = pub_aoi.center.x - sub_aoi.center.x;
        const dy = pub_aoi.center.y - sub_aoi.center.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < (pub_aoi.radius + sub_aoi.radius);
    }
}

// Usage example (uncomment to run directly):
if (require.main === module) {
    const parser = new MQTTEventParser();
    parser.processFile('/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/logs/mqtt_events/mqtt_client_events_no_broker.txt');
}

module.exports = MQTTEventParser; 