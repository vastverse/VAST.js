//importing data from text file
var fs = require('fs');
require('../lib/common');

const readline = require('readline');


var filename = process.argv[2] || "./simulator/example_script.txt";
if (filename.length > 4 && filename.slice(-4) != ".txt") {
	error("Please Provide A Text File");
}

var events = [];
var clients = {};
var subscriptions = {};
var publications = {};

const fileStream = fs.createReadStream(filename);

const rl = readline.createInterface({
	  input: fileStream,
	  crlfDelay: Infinity
});


rl.on('line', (line) => {
		events.push(JSON.parse(line));
});


rl.on('close', () => {
		console.log('Finished reading the file.');
		console.log('Read '+events.length+' events');

    function compare(a,b) {
      var result = a.time - b.time;
      if (result === 0) {
        result = a.event - b.event;
      }
      return result;
    }

		var sortedEvents = events.slice().sort(compare);
    var receivedPublications = [];

    // prepare all events that occured between last time step and now
    // but first ignore received publications
		for (var idx in sortedEvents) {
		    var currentEvent = sortedEvents[idx];
		    if (currentEvent.event !== Client_Event.RECEIVE_PUB) {
          prepareClientEvent(currentEvent);
        } else {
          receivedPublications.push(currentEvent);
        }
		}

    // Now evaluated all received publications
    for (var idx in receivedPublications) {
      var currentEvent = receivedPublications[idx];
      prepareClientEvent(currentEvent);
		}

		var totalSubscriptions = 0;
    var totalRecipients = 0;
    var totalErrors = 0;
    var totalCorrect = 0;
		var totalExtra = 0;
		var totalUndelivered = 0;

    for (var pubID in publications) {
      pub = publications[pubID];
      totalSubscriptions += pub.subscribers.length;
      totalRecipients += pub.recipients.length;
      
      var uniqSubscribers = new Set(pub.subscribers);
      var uniqRecipients = new Set(pub.recipients);
      var uniqCombined = Array.from(uniqSubscribers).concat(Array.from(uniqRecipients));
      var combinedSubscribers = new Map();
      var combinedRecipients = new Map();

      uniqCombined.forEach(obj => {
       combinedSubscribers.set(obj, 0);
       combinedRecipients.set(obj, 0);
      });


      for (var idx in pub.recipients) {
        recipientID = pub.recipients[idx];
        const count = pub.recipients.reduce((counter, obj) => obj === recipientID ? counter += 1 : counter, 0);
        //console.log('recipientID ['+recipientID+'] and count ['+count+']');
        combinedRecipients.set(recipientID, count);
      }

      for (var idx in pub.subscribers) {
        subscriberID = pub.subscribers[idx];
        const count = pub.subscribers.reduce((counter, obj) => obj === subscriberID ? counter += 1 : counter, 0);
        //console.log('subscriberID ['+subscriberID+'] and count ['+count+']');
        combinedSubscribers.set(subscriberID, count);
      }

      var uniqCombinedComparison = new Map()
      uniqCombined.forEach(obj => {
        const value = combinedRecipients.get(obj) - combinedSubscribers.get(obj);
        uniqCombinedComparison.set(obj, value);
      });

      uniqCombinedComparison.forEach((value, key) => {
        totalErrors += Math.abs(value);
        if (value > 0) {
          totalExtra += value;
          console.log('Too many copies of publication ['+pubID+'] was delivered to Client ['+key+']');
        }
        if (value < 0) {
          totalUndelivered += Math.abs(value);
          console.log('Not enough copies of publication ['+pubID+'] was delivered to Client ['+key+']');
        }
        if (value === 0) {
          totalCorrect++;
        }
      });
    }

    console.log("Number of clients: "+Object.keys(clients).length);
    console.log("Number of publications: "+Object.keys(publications).length);
    console.log('['+totalRecipients+'] publications delivered for ['+totalSubscriptions+'] subscriptions');
    console.log('['+totalCorrect+'/'+totalSubscriptions+'] publications were correctly delivered');
    console.log('['+totalErrors+'] publications were incorrectly delivered');
    console.log('['+totalUndelivered+'] publications undelivered');
    console.log('['+totalExtra+'] superfluous publications delivered');
});


var prepareClientEvent = function(data) {
  //console.log(data)
  switch (data.event) {
    case Client_Event.CLIENT_JOIN: {
      //console.log("CLIENT_JOIN")
      if (Object.keys(clients).includes(data.id)) {
        var client = clients[data.id];
        client.time.push(data.time);
        client.pos = data.pos;
        client.matcher = data.matcher;
      } else {
        var client = {
          id : data.id,
          alias : data.alias,
          pos: data.pos,
          matcher: data.matcher,
          time: [data.time],
          leavetime: []
        }
        clients[client.id] = client;
      }
      break;
    }


    case Client_Event.CLIENT_MOVE : {
      var client = clients[data.id];
      client.pos = data.pos;
      break;
    }

    case Client_Event.CLIENT_LEAVE: {
      //console.log("CLIENT_LEAVE")
      if (Object.keys(clients).includes(data.id)) {
        var client = clients[data.id];
        client.leavetime.push(data.time);
      }
      break;
    }

    // TODO: fix for update / delete differences
    case Client_Event.SUB_NEW : {
     // console.log("SUB_NEW");
      var sub = data.sub;
      subscriptions[sub.subID] = data.sub;
      break;
    }
    case Client_Event.SUB_UPDATE : {
//      console.log("SUB_UPDATE");
      var sub = data.sub;
      subscriptions[sub.subID] = sub;
      break;
    }

    case Client_Event.SUB_DELETE: {
  //    console.log("SUB_DELETE");
      delete subscriptions[data.subID];
      break;
    }

    case Client_Event.PUB : {
  //    console.log("PUB")
      publications[data.pub.pubID] = ({time: data.time, pub: data.pub});
      subscribers = [];
      recipients = [];
      for (var subID in subscriptions) {
        sub = subscriptions[subID]
        if (compareAoI(data.pub.aoi, sub.aoi) && (data.pub.channel == sub.channel)) {
          //console.log('Client ['+sub.clientID+'] should receive publication ['+data.pub.pubID+']');
          subscribers.push(sub.clientID);
        }
      }
      publications[data.pub.pubID].subscribers = subscribers;
      publications[data.pub.pubID].recipients = recipients;
      //console.log(publications[data.pub.pubID]);
      break;
    }

    case Client_Event.RECEIVE_PUB : {
//      console.log("RECEIVE_PUB")
      if (Object.keys(publications).includes(data.pub.pubID)) {
        pub = publications[data.pub.pubID];
        //console.log('Client ['+data.id+']  received publication ['+data.pub.pubID+']');
        pub.recipients.push(data.id);
      }
      break;
    }
  }
}


var compareAoI = function(pub_aoi, sub_aoi) {
  var distance = Math.sqrt((pub_aoi.center.x - sub_aoi.center.x)**2 + (pub_aoi.center.y - sub_aoi.center.y)**2);
  if (distance < (pub_aoi.radius + sub_aoi.radius)) {
    return true
  }
  return false
}