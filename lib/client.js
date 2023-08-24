
require('./common');
const crypto = require('crypto')

var Client_Message = {
    PING :  0,
    PONG :  1,
    MSG:    2
}

function client(host, port, id, x, y, radius, onMatcherAssigned, socket = null) {

  // debug logs and events recording (for use in visualiser)
  const logLayer = 'Client_logs';
  const eventsLayer = 'Client_events';
  const logFile = 'Client_logs';
  const eventsFile = 'Client_events';
  const logDirectory = 'logs_and_events';
  const eventsDirectory = 'logs_and_events';
  const logRecordLevel = 5;
  const eventRecordLevel = 5;
  const logDisplayLevel = 0;
  const eventDisplayLevel = 0;

  var log = LOG.newLayer(logLayer, logFile, logDirectory, logDisplayLevel, logRecordLevel);
  var events = LOG.newLayer(eventsLayer, eventsFile, eventsDirectory, eventDisplayLevel, eventRecordLevel);

  if (socket != null) var _socket = socket;

    const io = require('socket.io-client');
    const crypto = require('crypto');
    var _io;

    var _id = id || 0;
    var _hostname = UTIL.getHostname();
	  var _GWaddr = { host: host, port: port };
    var _matcherID = VAST.ID_UNASSIGNED;
    var _matcherAddr;
    var _onMatcherAssigned = onMatcherAssigned;
    var _subscriptions = {};
    var _subcriptionToSubIDs = {};

    var _x = x == null || x == undefined ? Math.random()*1000 : x;
    var _y = y == null || y==undefined ? Math.random()*1000 : y;
    var _radius = radius == null || radius == undefined ? 16 : radius;
	  var _pos = new VAST.pos(_x,_y);

    var _pubCount = 0;

    const EventsEmitter = require('events');
    const eventsEmitter = this.eventsEmitter = new EventsEmitter();

    // Performance Measurement - unused
    /*
    const PING_TIMEOUT = 10000; // 10s
    var PONGS = {};     // record of responses
    var PINGS = [];     // array of pings we have received

    var numPINGs = 0;
    var numPONGs = 0;

    // Only record PINGS and PONGS (messages between clients)
    var bytesSent = 0;      // bytes
    var bytesReceived = 0;  // bytess
    var msgsSent = 0;       // messages sent  
    var msgsReceived = 0;   // messages received
    */

    // stuff used by simulator/visualiser 2022/02/14
    var _alias = 'unnamed_client';
    this.getMatcherID = function(){
        return _matcherID;
    }

    this.setAlias = function(alias){
        _alias = alias; 
    }

    this.getAlias = function(){
        return _alias;
    }

    // Create socket connection with given host, port
    var _connect = this.connect = function(host, port) {

        if (_io !== undefined) {
            _io.close();
        }
        _io = io.connect('http://'+host+':'+port);
        
        // initialise event listeners
        _io.on('connect', function() {
            log.debug('Client['+_id+']: socket connected')
            if (_matcherID == VAST.ID_UNASSIGNED) {
              _recordEvent(Client_Event.CLIENT_JOIN, {pos: _pos, radius: _radius, matcherID: _matcherID});
            }

            _recordEvent(Client_Event.CLIENT_CONNECT, {pos: _pos, radius: _radius, matcherID: _matcherID});
        });

        _io.on('error', function(error) {
            log.debug('Client[' + _id + ']: socket error - ' + error);
          });
          
          _io.on('connect_error', function(error) {
            log.debug('Client[' + _id + ']: socket connect error - ' + error);
          });
          
          _io.on('connect_timeout', function(timeout) {
            log.debug('Client[' + _id + ']: socket connect timeout - ' + timeout);
          });

        // Matcher requesting our info
        _io.on('request_info', function(info){
            var myInfo = {
                matcherID : _matcherID,
                matcherAddr : _matcherAddr,
                hostname : _hostname,
                clientID : _id,
                pos : _pos
            }
            _io.emit('client_info', myInfo);
        });

        // GW Matcher assigning an ID and host matcher
        _io.on('assign_matcher', function(pack){

          var newMatcher = (_matcherAddr !== pack.matcherAddr);
          _matcherID = pack.matcherID;
          _matcherAddr = pack.matcherAddr;
          _matcherPos = pack.matcherPos;
          _id = pack.clientID;

          log.debug('Client['+_id+']: being migrated to Matcher['+pack.matcherID+']');
          if (newMatcher)
            _connect(_matcherAddr.host, _matcherAddr.port);
        });

        // We are connected to our assigned matcher, so we are "properly" initialised
        _io.on('confirm_matcher', function(pack){
            _matcherID = pack.matcherID
            _matcherAddr = pack.matcherAddr;
            _matcherPos = pack.matcherPos;
            _id = pack.clientID;

            log.debug('Client['+_id+']: assigned to matcher['+_matcherID+']');

            if (typeof _onMatcherAssigned == 'function'){
                _onMatcherAssigned(_id);
            }

            _recordEvent(Client_Event.CLIENT_MIGRATE, {pos: _pos, radius: _radius, matcherID: _matcherID});

        });


        // Matcher confirming / updating subscription
        _io.on('subscribe_r', function(sub){
            var sub = sub;
            log.debug('Client['+_id+']: added a subscription:');
            log.debug(sub);
            _subscriptions[sub.subID] = sub;
            var aoi = new VAST.area(new VAST.pos(sub.x, sub.y), sub.radius);
            var subscription = {aoi: aoi, channel: sub.channel};
            _subcriptionToSubIDs[subscription] =  sub.subID;
            _recordEvent(Client_Event.SUB_NEW, sub)
        });


        // Matcher confirming subscription deletion
        _io.on('unsubscribe_r', function(sub){
            try { //TODO: Figure out why this subID does not exist sometimes
                var sub = sub;
                log.debug('Client['+_id+']: removed subID: ' + sub.subID); //TODO: Readd this!
                delete _subscriptions[sub.subID];
                var aoi = new VAST.area(new VAST.pos(sub.x, sub.y), sub.radius);
                var subscription = {aoi: aoi, channel: channel};
                delete _subcriptionToSubIDs[subscription];

            } catch (error) {
                console.log("subID could not be found for some reason, but the client still has: " + _subscriptions.length + " subs!")
            }
            
        });


        _io.on('publication', function(pub){
            _handlePublication(pub);
            _recordEvent(Client_Event.RECEIVE_PUB, {pub: pub});
        })


        _io.on('disconnect', function(){
            log.debug('Client['+_id+']: disconnected from matcher['+_matcherID+']');
            _disconnect();
        })
    }


    var _move = this.move = function(x, y) {
        if (_io.id !== undefined) {
          var oldpos = {x: _x, y: _y};
          _pos.parse({x: x, y: y});
          _io.emit('move', _pos);
          _recordEvent(Client_Event.CLIENT_MOVE, {oldpos: oldpos});
        }
    }


    // A static subscription (does not move with client)
    var _subscribe = this.subscribe = function(x, y, radius, channel) {
        log.debug('Client['+_id+']: subscribing to channel['+channel+'] at AoI['+x+'; '+y+'; '+radius+']');
        var subID = _generate_subID(_id);
        var msg = {
            subID: subID,
            x : x,
            y : y,
            followClient : 0,
            radius : radius,
            channel : channel
        };
        _io.emit('subscribe', msg);
    }


    // A mobile subscription (AoI around client on channel)
    var _subscribeMobile = this.subscribeMobile = function(radius, channel){
        var msg = {
            x : _pos.x,
            y : _pos.y,
            followClient : 1,
            radius : radius,
            channel : channel
        };
        _io.emit('subscribe', msg);
        _recordEvent(Client_Event.SUB_NEW, {sub: msg})
    }

    var _publish = this.publish = function(x, y, radius, payload, channel) {
        log.debug('Client['+_id+']: publishing to channel['+channel+'] with payload: '+ payload);
        _pubCount++;

        var pack = {
            pubID : _id + '-' + _pubCount,
            x : x,
            y : y,
            radius : radius,
            payload : payload,
            channel : channel
        };
        // _io.volatile.emit('publish', pack);
        _io.emit('publish', pack); // Removed volatile
        _recordEvent(Client_Event.PUB, {pub: pack})

        //msgsSent += 1;
        //bytesSent += UTIL.sizeof(pack);
    }

    /*
    var _sendPING = this.sendPING = function(x, y, radius, bytes, channel){
        
        numPINGs += 1;
        bytes = parseInt(bytes) || 64;

        var time = UTIL.getTimestamp();

        var payload = {
            type : Client_Message.PING,
            sourcePos : _pos,
            radius : radius,
            pinger : _id,
            pingID : _id + '-' + numPINGs,
            sendTime : time,
            bytes : crypto.randomBytes(bytes)
        }

        // preallocate the response storage
        PONGS[payload.pingID] = {
            sendTime : payload.sendTime,
            ids : [],
            totLat : 0,
            minLat : 0,
            maxLat : 0,
            avgLat : 0
        }

        _publish(x, y, radius, payload, channel);

    }
    */

    var _unsubscribe = this.unsubscribe = function(x, y, radius, channel) {

      var aoi = new VAST.area(new VAST.pos(x, y), radius);
      var subscription = {aoi: aoi, channel: channel};
      var subID = _subcriptionToSubIDs[subscription];
      _io.emit('unsubscribe', subID);
      _recordEvent(Client_Event.SUB_DELETE, {sub: subID})
    }


   /*var _unsubscribe = this.unsubscribe = function(subID) {
        _io.emit('unsubscribe', subID);
        _recordEvent(Client_Event.SUB_DELETE, {sub: subID})
    }*/


    var _clearSubscriptions = this.clearSubscriptions = function() {
        for (var key in _subscriptions){
            var sub = _subscriptions[key];
            _unsubscribe(sub.x, sub.y, sub.radius, sub.channel);
//            _unsubscribe(key);
        }
    }


    var _disconnect = this.disconnect = function() {
        _recordEvent(Client_Event.CLIENT_DISCONNECT)
        _subscriptions = {};
        _subcriptionToSubIDs = {};
        _io.close();
    }


    var publicationcounter = 0; //TODO: Remove
    var _handlePublication = function(pub){
        var type = pub.payload.type;

        /*
        bytesReceived += UTIL.sizeof(pub);
        msgsReceived += 1;
        */

        switch (type) {
        
            default :{
                log.debug('Client['+_id+']: received publication from Client['+pub.clientID+'] with payload: '+pub.payload);
                //_recordEvent(Client_Event.RECEIVE_PUB, pub)
                // console.log('Received Pub!')
                //send message to proxy - hopefully through the vast_com.js script

                publicationcounter = publicationcounter +1;
                //console.log('I received :' + publicationcounter);

		            eventsEmitter.emit('publication',pub)
		            if (_socket != null) {
                  try {
                      _socket.emit('publication', pub)
                  } catch {
                      console.log("Could not forward received publication to remote socket")
                  }
                }
            }

            /*
            // received a PING, respond with PONG targeted at source
            case Client_Message.PING:{
                //log.debug('received PING from client: ' + pub.payload.pinger);

                var pingID = pub.payload.pingID;
                if (PINGS.includes(pingID)){
                    var dup = {
                        type : 'PING',
                        sendTime : pub.payload.sendTime,
                        pingID : pub.payload.pingID,
                        fromID : pub.payload.pinger
                    }
                    recDuplicates.write(dup, 'client-' + _id + '-duplicates');
                    log.debug('Client['+_id+']: Duplicate PING from: ' + pub.payload.pinger);
                    break;
                }

                //PINGS.push(pingID);

                var x = pub.payload.sourcePos.x;
                var y = pub.payload.sourcePos.y;
                var radius = 0.1; // ~ point publication for PONG's
                var payload = {
                    type : Client_Message.PONG,
                    sourcePos : _pos,
                    radius : pub.payload.radius,
                    pinger : pub.payload.pinger,
                    sendTime : pub.payload.sendTime,
                    pingID : pingID,
                    bytes : pub.payload.bytes
                }

                _publish(x, y, radius, payload, payload.pinger);
            }
            break;

            // received a response for our PING
            case Client_Message.PONG:{

                //log.debug('received PONG from client: ' + pub.clientID);
                var now = UTIL.getTimestamp();
                var sendTime = pub.payload.sendTime;
                var lat =  (now - sendTime)/2;

                // discard if this is not a response to our PING (spatial messages might overlap with our subs)
                // also discard if it is too late
                if (pub.payload.pinger !== _id || now - sendTime > PING_TIMEOUT){
                    break;
                }

                var pingID = pub.payload.pingID;
                var fromID = pub.clientID;

                var pong = PONGS[pingID];

                if(pong.ids.includes(fromID)){
                    var dup = {
                        type : 'PONG',
                        sendTime : sendTime,
                        pingID : pingID,
                        fromID : fromID
                    }
                    recDuplicates.write(dup, 'client-' + _id + '-duplicates');
                    log.debug('Client['+_id+']: received a duplicate PONG from: ' + fromID);
                } else {
                    log.debug('Client['+_id+']: PONG from ' + fromID);
                }

                pong.ids.push(fromID);

                // first response
                if(pong.ids.length === 1){
                    pong.minLat = lat;
                    pong.maxLat = lat;
                }else{
                    pong.minLat = lat < pong.minLat ? lat : pong.minLat;
                    pong.maxLat = lat > pong.maxLat ? lat : pong.maxLat;
                }

                pong.totLat += lat;
                pong.avgLat = pong.totLat / pong.ids.length;

                // add this pong to the list
                PONGS[pingID] = pong; 

                numPONGs += 1;
            }
            break;
            */
        }
    }
    _connect(_GWaddr.host, _GWaddr.port);

  // record updates to results file
  var _recordEvent = function(event, msg){
    //console.log(msg)
    switch (event){

      case Client_Event.CLIENT_JOIN :{
        var data = {
          time : UTIL.getTimestamp(),
          event : Client_Event.CLIENT_JOIN,
          id : _id,
          alias : _alias,
          pos: msg.pos,
          matcher : _matcherID
        }
        events.printObject(data);
        break
      }

      case Client_Event.CLIENT_CONNECT :{
        var data = {
          time : UTIL.getTimestamp(),
          event : Client_Event.CLIENT_CONNECT,
          id : _id,
          alias : _alias,
          pos: msg.pos,
          matcher : _matcherID
        }
        events.printObject(data);
        break
      }


      case Client_Event.CLIENT_MIGRATE :{
        var data = {
          time : UTIL.getTimestamp(),
          event : Client_Event.CLIENT_MIGRATE,
          id : _id,
          alias : _alias,
          pos: msg.pos,
          matcher : _matcherID
        }
        events.printObject(data);
        break
      }

      case Client_Event.CLIENT_MOVE :{
        var data = {
          time : UTIL.getTimestamp(),
          event : Client_Event.CLIENT_MOVE,
          id : _id,
          alias : _alias,
          pos: _pos,
          oldpos: msg.oldpos,
          matcher : _matcherID
        }
        events.printObject(data);
        break;
      }

      case Client_Event.CLIENT_LEAVE :{
        var data = {
          time : UTIL.getTimestamp(),
          event : Client_Event.CLIENT_LEAVE,
          id : _id,
          alias : _alias,
          matcher : _matcherID
        }
        events.printObject(data);
        break;
      }

      case Client_Event.SUB_NEW :{
        var data = {
          time : UTIL.getTimestamp(),
          event : Client_Event.SUB_NEW,
          id : _id,
          alias : _alias,
          matcher: _matcherID,
          sub : msg
        }
        events.printObject(data);
        break;
      }

      case Client_Event.SUB_DELETE :{
        var data = {
          time : UTIL.getTimestamp(),
          event : Client_Event.SUB_DELETE,
          id : _id,
          alias : _alias,
          matcher: _matcherID,
          subID : msg.sub
        }
        events.printObject(data);
        break;
      }


      case Client_Event.PUB :{
        var aoi = new VAST.area(new VAST.pos(msg.pub.x, msg.pub.y), msg.pub.radius);
        var pub = {
          pubID: msg.pub.pubID,
          aoi: aoi,
          channel: msg.pub.channel,
          payload: msg.pub.payload
        }

        var data = {
          time : UTIL.getTimestamp(),
          event : Client_Event.PUB,
          id : _id,
          alias : _alias,
          matcher: _matcherID,
          pub : pub
        }
        events.printObject(data);
        break;
      }


      case Client_Event.RECEIVE_PUB :{
        var data = {
          time : UTIL.getTimestamp(),
          event : Client_Event.RECEIVE_PUB,
          id : _id,
          alias : _alias,
          matcher: _matcherID,
          pub : msg.pub
        }
        events.printObject(data);
        break;
      }
    }
  }


  process.on('exit', function() {
    console.log("Exiting client");
    _clearSubscriptions();
    _recordEvent(Client_Event.CLIENT_LEAVE, {pos: _pos, radius: _radius, matcherID: _matcherID});
    process.exit();
  });


  /*process.on('SIGTERM', function() {
    //console.log("Exiting client");
    //_recordEvent(Client_Event.CLIENT_LEAVE, {pos: _pos, radius: _radius, matcherID: _matcherID});
    process.exit();
  });*/


  process.on('SIGINT', function() {
    //console.log("Exiting client");
    //_recordEvent(Client_Event.CLIENT_LEAVE, {pos: _pos, radius: _radius, matcherID: _matcherID});
    process.exit();
  });


  process.on('SIGHUP', function() {
    //console.log("Exiting client");
    //_recordEvent(Client_Event.CLIENT_LEAVE, {pos: _pos, radius: _radius, matcherID: _matcherID});
    process.exit();
  });


  var _generate_subID = function(clientID) {
    //check the list of existing IDs for client to avoid duplicates
    var count = 0;
    var newID = clientID+'-'+_randomString(5);
    return newID;
  }


  var _randomString = function(length) {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() *
        charactersLength));
    }
    return result;
  }

}


if (typeof module !== "undefined"){
    module.exports = client;
}

