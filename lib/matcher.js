// Matcher for 	SPS system.

const client = require('./client.js');
// const dataCapture = require('../test/dataCapture.js');
const { log: dataLog } = require('../test/dataCapture.js');

const LogCategory = {
    CLIENT_INBOUND: 'CLIENT_INBOUND', // From a vast Client
    CLIENT_OUTBOUND: 'CLIENT_OUTBOUND', // To a vast Client

    // PINGPONG CATAGORIES:
    // MATCHER_PING_IN: 'MATCHER_PING_IN',
    // MATCHER_PING_OUT: 'MATCHER_PING_OUT',
    // MATCHER_PONG_OUT: 'MATCHER_PONG_OUT',

    MATCHERBOUND_MATCHER_PING_IN: 'MATCHERBOUND_MATCHER_PING_IN', // This and PONG are equivalent, so not logging PONG
    PROXYBOUND_MATCHER_PING_OUT: 'PROXYBOUND_MATCHER_PING_OUT', // This and PONG are equivalent, so not logging PONG
    // PROXYBOUND_MATCHER_PONG_IN: 'PROXYBOUND_MATCHER_PONG_IN', // This and PONG are equivalent, so not logging PONG
    // MATCHERBOUND_MATCHER_PONG_OUT: 'MATCHERBOUND_MATCHER_PONG_OUT', // This and PONG are equivalent, so not logging PONG

  };

const { data } = require('jquery');


/*
TODO:
    - Fix _unsubscribe(subID);
    - Assign unique client IDs in distributed manner (so that multiple GWs may be used)
    - Implement mobile client subscriptions (follow client position)
    - Publication buffer / queue?
*/

//imports
require('./common.js');

// export the class with conditional check
if (typeof module !== "undefined")
	module.exports = matcher;

function matcher(x, y, radius, opts, onJoin) {

    // Define default options
    let _default = {
        alias : 'Matcher',          // Used by the simulator to give each matcher a name other than it's ID.
        isGateway : false,          // Am i the gateway peer (for VON and for clients)
        GW_host : '127.0.0.1',
        GW_port : 8000,             // The port of the VON gateway peer that i initially connect to
        VON_port : 8001,            // listen for other VON peers on this port (will increment until open port is found)
        client_port : 20000,        // listen for client connections on this port (will incrementv until open port is found)
        useMQTT : false,            // use with modified aedes MQTT broker?
        clientDisconnectTime : 100, // timeout before subscriptions are assumed fully migrated between matchers
        subLifeTime : 60000,        // life without receiving heartbeat (1 min)

        // debug logs and events recording (for use in visualiser)
        logLayer : 'Matcher_logs',
        eventsLayer : 'Matcher_events',
        logFile : 'Matcher_logs',
        eventsFile : 'Matcher_events',
        logDirectory : 'logs_and_events',
        eventsDirectory : 'logs_and_events',
        logRecordLevel : 0,
        eventRecordLevel : 0,
        logDisplayLevel : 5,
        eventDisplayLevel : 5
    }

    // set modified options
    let _opts = _default;
    for (var option in opts){
        _opts[option] = opts[option];
    }

    // Assign alias, ID and GateWay address
    var _alias = _opts.alias;
    var _id = _opts.isGateway === true ? VAST.ID_GATEWAY : VAST.ID_UNASSIGNED;
    var _GWaddr = { host: _opts.GW_host, port: _opts.GW_port };

    // Assign my VON and client listening ports
    var _VON_port = _opts.isGateway === true ? _opts.GW_port : _opts.VON_port;
    var _client_port = _opts.client_port;

    // timeout for migrating subscriptions and KEEP ALIVE
    var _clientDisconnectTime = _opts.clientDisconnectTime;
    var _subLifeTimeout = _opts.subLifeTime;

    // Set up MQTT broker
    var _useMQTT = _opts.useMQTT;
    if (_useMQTT === true && typeof(_opts.broker) !== undefined) {
        //console.log(_opts.brokerPort);
        var _broker = this.broker = _opts.broker;
        var _brokerPort = this._brokerPort = _opts.brokerPort;
    }

    // Define AoI and Position
    var _x = x == null || x == undefined ? Math.random()*CONF.x_lim : x;
    var _y = y == null || y == undefined ? Math.random()*CONF.y_lim : y;
    var _radius = radius == undefined ? 1 : radius;
    var _pos = new VAST.pos(_x,_y);
    var _aoi  = new VAST.area(_pos, _radius);
    

    // Setup socket for client <--> matcher communication
	const _http = require('http').createServer();
	const _io = require('socket.io')(_http, {
		cors: {
			origin: "*"
		}
	});

    var _addr, _socketAddr;

    // set up log layers for debugging and for status updates
    let log = LOG.newLayer(_opts.logLayer, _opts.logFile, _opts.logDirectory, _opts.logDisplayLevel, _opts.logRecordLevel);
    let events = LOG.newLayer(_opts.eventsLayer, _opts.eventsFile, _opts.eventsDirectory, _opts.eventDisplayLevel, _opts.eventRecordLevel);

	// matches a socket to a connectionID
	var _socketID2clientID = this.socketID2clientID = {};
	var _clientID2socket =  this.clientID2socket = {}

	var _mqttID2clientID = this.mqttID2clientID = {};
	var _clientID2mqttID = this.clientID2mqttID = {};
	var _mqttMovePackets = this.mqttMovePackets = {}

	var _clientList = {};
	var _leavingClients = {};
	var _leavingClientDeleteFunction = {}
	var _pendingClients = {};

	var _connectionCount = 0;
	var _clientCount = 0;

	// list of subscriptions (clientID is primary key, subID is secondary key)
	var _subscriptions = {};
	var _migratingSubs = {};

	// convenient list of only subs hosted by me
	var _hostSubs = {};

	//log.debug('Matcher['+_id+']: useMQTT: '+_useMQTT);

	// Reference to self
	var _that = this;

	var _onJoin = onJoin;

	var _vonPeer = new VON.peer();

    // _id must remane private
    this.id = function(){
        return _id
    }

	var _init = function(callback){

        // initialise VON peer
        _vonPeer.init(_id, _addr.host, _addr.port, _that, function(addr){
            _addr = addr;

            _vonPeer.join(_GWaddr, _aoi, function(id){
                _id = id;
                log.debug('Matcher['+_id+']: VON peer joined successfully');

                _initListeners();
				_listen();
                // _checkSubscriptions(); // TODO: re-add after testing.
				
				if(typeof callback === 'function'){
					callback();
				}
				if (typeof _onJoin == 'function'){
                    _recordEvent(Matcher_Event.MATCHER_JOIN);
					onJoin(_id);
				}
            })
        })
	}

	// This function is called in VON peer when a message of type VON_Message.MATCHER_FORWARD is received
    // i.e. this packet comes from other matchers
    this.handlePacket = function(pack){
        var msg = pack.msg;
    
        switch (pack.type) {
    
            // Overlapping / distant publication is being received by relevant matchers
            case Matcher_Message.PUB: {
    
                // log.debug('Matcher['+_id+']: Received Publication from Matcher['+pack.sender+']', msg);
    
                var pub = msg;
                pub.recipients = pack.recipients;
                pub.chain = pack.chain;
    
                _sendPublication(pub, true);
                break;
            }
    
            // A distant / overlapping subscription received a publication. The publication is now being forwarded to me
            // because I am the host to the relevant client. (Unless the subscriptions are not yet migrated)
            case Matcher_Message.PUB_MATCHED: {
    
                // log.debug('Matcher['+_id+']: Matched Publication from Matcher['+pack.sender+']' + 'from Client['+pack.msg.clientID+']');
    
                var pub = msg;
    
                _sendPublication(pub, false);
                break;
            }
    
            // A new subscription is being added in my area.
            case Matcher_Message.SUB_NEW: {
                log.debug('Matcher[' + _id + ']: New Sub from Matcher[' + pack.sender + ']', msg);
                var sub = msg;
    
                // update recipients to the subscription
                sub.recipients = pack.recipients
    
                _addSubscription(sub, false);
                break;
            }
    
            case Matcher_Message.SUB_UPDATE: {
                var sub = msg;
                sub.recipients = pack.recipients;
                _updateSubscription(sub);
            }
            break;
    
            // A subscription was deleted
            case Matcher_Message.SUB_DELETE: {
                log.debug('Matcher[' + _id + ']: Sub deletion from Matcher[' + pack.sender + ']', msg);
                _deleteSubscription(msg);
            }
            break;
    
            // A client move request was received, the position is within my region
            case Matcher_Message.MOVE_CLIENT: {
    
                // The message is not from me, so the client is moving into my region
                // Respond with a MOVE_CLIENT_R message
                if (pack.sender !== _id && _pendingClients[msg.clientID] === undefined) {
    
                    log.debug('Matcher[' + _id + ']: Migrate client[' + msg.clientID + '] from matcher[' + pack.sender + '] for pos[' + pack.targetPos.x + '; ' + pack.targetPos.y + ']');
    
                    //Add client to my pending list
                    _pendingClients[msg.clientID] = {
                        id: msg.clientID,
                        pos: msg.clientPos,
                        matcherID: _id,
                        matcherPos: _pos
                    }
    
                    for (var subID in msg.clientSubs) {
                        msg.clientSubs[subID].hostID = _id;
                        _addSubscription(msg.clientSubs[subID], true);
                    }
    
                    let subs = _subscriptions[msg.clientID];
                    for (var subID in subs) {
                        subs[subID].changeHost(_id, _pos);
                    }
    
                    // send back my details so pending client can join
                    var new_msg = {
                        matcherID: _id,
                        matcherPos: _pos,
                        matcherAddr: _socketAddr,
                        brokerPort: _brokerPort,
                        clientID: msg.clientID,
                        pos: msg.pos
                    }
    
                    var new_pack = new VAST.pointPacket(Matcher_Message.MOVE_SUBS_R, new_msg, _id, _pos, pack.sourcePos);
                    // send back my details so pending client can join
                    _vonPeer.pointMessage(new_pack);
                }
    
            }
            break;
    
            // The new matcher for a client has received the subs. finalise client transfer
            case Matcher_Message.MOVE_SUBS_R: {
                log.debug('Matcher[' + _id + ']: MOVE_SUBS_R message');
    
                // I am still connected to the client
    
                let subs = _subscriptions[msg.clientID];
                for (var subID in subs) {
                    subs[subID].changeHost(msg.matcherID, msg.matcherPos);
                }
    
                if (_useMQTT == true) {
    
                    log.debug('Matcher[' + _id + ']: migrating client[' + msg.clientID + '] to matcher[' + msg.matcherID + ']');
    
                    var mqttID = _clientID2mqttID[msg.clientID];
                    // send the new matcher details to the client for transfer
                    var client_pack = {
                        matcherID: msg.matcherID,
                        matcherAddr: msg.matcherAddr,
                        brokerPort: msg.brokerPort,
                        matcherPos: msg.matcherPos,
                        clientID: msg.mqttID,
                    }
    
                    var client = _that.broker.clients[mqttID]
                    if (client) {
                        var packet = _mqttMovePackets[mqttID];
                        packet.topic = mqttID;
                        packet.payload = Buffer.from(JSON.stringify(client_pack));
                        client.publish(packet, client, _that.publishDone)
                    }
    
    
                } else {
    
                    if (_clientList[msg.clientID] !== undefined && _clientID2socket[msg.clientID] !== undefined) {
    
                        log.debug('Matcher[' + _id + ']: migrating client[' + msg.clientID + '] to matcher[' + msg.matcherID + ']');
    
                        // send the new matcher details to the client for transfer
                        var client_pack = {
                            matcherID: msg.matcherID,
                            matcherAddr: msg.matcherAddr,
                            matcherPos: msg.matcherPos,
                            clientID: msg.clientID,
                        }
                        _clientID2socket[msg.clientID].emit('assign_matcher', client_pack);
                    }
                }
                break;
            }
            break;
    
            case Matcher_Message.MOVE_SUBS: {
                //log.debug('Matcher['+_id+']: MOVE_SUBS message');
    
                // I am receiving the subscriptions for one of my pending clients
                let subs = msg.subs;
                for (var subID in subs) {
                    _addSubscription(subs[subID], true);
                }
    
                // send back my details so pending client can join
                var new_msg = {
                    matcherID: _id,
                    matcherPos: _pos,
                    matcherAddr: _socketAddr,
                    clientID: msg.clientID,
                    pos: msg.pos
                }
    
                var new_pack = new VAST.pointPacket(Matcher_Message.MOVE_SUBS_R, new_msg, _id, _pos, pack.sourcePos);
                _vonPeer.pointMessage(new_pack);
            }
            break;
    
            default: {
                log.debug('Matcher[' + _id + ']: received an unknown packet type from Matcher[' + pack.sender + ']', pack);
            }
        }
    }



	// this initialises the listener for socket events between the client and matcher
	var _initListeners = function(){

		// Client connections
		//--------------------
        _io.on('connection', function(socket){
                var info = JSON.parse(socket.handshake.query.myInfo)
                _connectionCount++;

                var clientID = info.clientID;

                // client is new and I am GW
                if (_id  == VAST.ID_GATEWAY && (clientID == 0 || info.matcherID == VAST.ID_UNASSIGNED)){
                    // assign a clientID to the new client
                    _clientCount++;
                    clientID = clientID == 0 ? info.hostname + '-' + _clientCount : clientID; // multiple clients on same host

                    // Add to client list
                    var client = _addClient(clientID, info.pos)

                    let client_pack = {
                        clientID : clientID,
                        matcherID : _id,
                        matcherPos : _pos,
                        matcherAddr : _socketAddr
                    }
                    _socketID2clientID[socket.id] = clientID;
                    _clientID2socket[clientID] = socket;
                    socket.emit('confirm_matcher', client_pack);

                    // record event
                    _recordEvent(Matcher_Event.CLIENT_JOIN, client);
                    log.debug('Matcher['+_id+']: a new client has joined GW. Send MOVE request');
                    _moveClient(clientID, info.pos.x, info.pos.y);
                }
                // client already has an ID and claims to be assigned to me and I am expecting them
                else if ((clientID !== -1 || undefined) && (info.matcherID == _id)
                && (_pendingClients[clientID] !== 'undefined')) {

                    // Add to my client list
                    var client = _addClient(clientID, info.pos);

                    let client_pack = {
                        clientID : clientID,
                        matcherID : _id,
                        matcherPos : _pos,
                        matcherAddr : _socketAddr
                    }
                    _socketID2clientID[socket.id] = clientID;
                    _clientID2socket[clientID] = socket;
                    socket.emit('confirm_matcher', client_pack);

                    // record event
                    _recordEvent(Matcher_Event.CLIENT_JOIN, client);

                        
                    log.debug('Matcher['+_id+']: Client['+clientID+'] has joined from pending list');

                    // remove from pending list
                    delete _pendingClients[clientID];

                    if  ( _leavingClientDeleteFunction[clientID] !== undefined) {
                        clearTimeout(_leavingClientDeleteFunction[clientID]);
                        delete _leavingClientDeleteFunction[clientID];
                    }
                }  
                        // TODO: handle clients on leaving list. Possible reconnection attempt from client
                        // client is new but I am not GW. kick them and return
                else {
                    socket.disconnect();
                    return;
                }

                // Map the client ID to its socket
                _socketID2clientID[socket.id] = clientID;
                _clientID2socket[clientID] = socket;

			// handle a disconnect
			socket.on('disconnect', function(){
				var clientID = _socketID2clientID[socket.id];

                // Add the client to a leaving list for graceful removal
                _clientLeave(clientID);
				log.warn('Matcher['+_id+'] disconnected from Client['+clientID+']. Added to leaving list.');

				return false;
			});

			// publish a message
			socket.on('publish', function(data) {

                if (data.payload.username.split("&")[1]) {
                    dataLog(data.payload.username.split("&")[1], LogCategory.CLIENT_INBOUND);
                }

                //console.log('I am publishing this message: ' + data.payload.username.split("&")[1])

				var clientID = _socketID2clientID[socket.id];
				_publish(clientID, data.x, data.y, data.radius, data.payload, data.channel, data.pubID);
			});

			// subscribe to an AOI
            // TODO: msg has a followClient field that should allow subscriptions to follow client, not implemented?
			socket.on('subscribe', function(msg) {
                var clientID = _socketID2clientID[socket.id];
                log.debug('Matcher['+_id+']: Received subscribe message from client['+clientID+'] with subscription ID ['+msg.subID+']');
                
                if (msg.hasOwnProperty('points')) { // polygon
                    _subscribe(clientID, msg.points, msg.channel, msg.subID, msg.followClient);
                } else { // circle
                    _subscribe(clientID, {x: msg.x, y: msg.y, radius: msg.radius}, msg.channel, msg.subID, msg.followClient);
                }
            });

			// unsubscribe
			socket.on('unsubscribe', function(subID){
				var clientID = _socketID2clientID[socket.id];
				log.debug('Matcher['+_id+']: Received unsubscribe message from client['+clientID+']');
				_unsubscribe(clientID, subID);
			});

			//move
			socket.on('move', function(msg){
				var clientID = _socketID2clientID[socket.id];
				if (clientID !== undefined) {
                    _moveClient(clientID, msg.x, msg.y);
                } else {
                        log.debug('Received move message from client that is connected, but not mapped to clientID');
                }
			});

            //PONG Client on PING
            socket.on('ping', function(data) {

                // console.log('I am receiving a ping from the client')



                // First we log the ping in the PING category
                if (data.payload.username.split("&")[1]) { // This contains the uniqueID
                    // console.log('I am logging the ping')
                    dataLog(data.payload.username.split("&")[0] + ',' + data.payload.username.split("&")[1], LogCategory.MATCHERBOUND_MATCHER_PING_IN);
                }
                // dataLog("test", LogCategory.MATCHERBOUND_MATCHER_PING_IN);

                // Prepare Pong
                var pongData = {};
                pongData.payload = data.payload;
                pongData.x = data.x;
                pongData.y = data.y;
                pongData.radius = data.radius;
                pongData.channel = data.channel;
                // console.log('I am receiving a ping from the client with data: ' + pongData)

                // Publish Ping to all subscriptions that overlap with correct channel
                // i.e. if serverBound ping will be sent all the way to serverProxys
                // if clientBound, ping will be sent all the way to clientproxys
                data.payload.username = data.payload.username.split("&")[0] + "&" + data.payload.username.split("&")[1] + "&PROXYPING";
                var clientID = _socketID2clientID[socket.id];
                _publish(clientID, data.x, data.y, data.radius, 
                    data.payload, data.channel);

                // Return Pong to client (vast_com) that sent the ping  
                // console.log('I am sending a pong to the client')
                pongData.payload.username = pongData.payload.username.split("&")[0] + "&" + pongData.payload.username.split("&")[1] + "&MATCHERPONG";
                var aoi = new VAST.area(new VAST.pos(pongData.x, pongData.y), pongData.radius);
                pub = new VAST.pub(_id, clientID, aoi, pongData.payload, pongData.channel);
                socket.emit('pong', pub);
            }) ;


            // socket.on('pong', function(msg) {
            //     // First we log the pong as a normal publication (Could consider to make a separate category for PINGs and PONGs)
            //     if (data.payload.username.split("&")[1]) { // This contains the uniqueID
            //         dataLog(data.payload.username.split("&")[1], LogCategory.CLIENT_INBOUND);
            //     }

                

            // });

		});
	}

    // record updates to results file
    var _recordEvent = function(event, msg){
        log.debug('Matcher['+_id+']: Amount of clients: ' + Object.keys(_clientList).length);
        switch (event){

            case Matcher_Event.MATCHER_JOIN :{
                var data = {
                    time : UTIL.getTimestamp(),
                    event : Matcher_Event.MATCHER_JOIN,
                    id : _id,
                    alias : _alias,
                    aoi: _aoi,
                    pos : _pos
                }

                events.printObject(data);
            }
            break;

            /*
            case Matcher_Event.MATCHER_MOVE :{
                var data = {
                    time : UTIL.getTimestamp(),
                    event : Matcher_Event.MATCHER_JOIN,
                    id : _id,
                    alias : _alias,
                    aoi: _aoi,
                    pos : _pos
                }

                events.printObject(data);
            }
            break;
            */

            case Matcher_Event.CLIENT_JOIN :{
                var data = {
                    time : UTIL.getTimestamp(),
                    event : Matcher_Event.CLIENT_JOIN,
                    id : _id,
                    alias : _alias,
                    client : msg
                }
                events.printObject(data);
            }
            break;

            
            case Matcher_Event.CLIENT_MOVE :{
                var data = {
                    time : UTIL.getTimestamp(),
                    event : Matcher_Event.CLIENT_MOVE,
                    id : _id,
                    alias : _alias,
                    client : msg.client
                }
                events.printObject(data);
            }
            break;

            case Matcher_Event.CLIENT_LEAVE :{
                var data = {
                    time : UTIL.getTimestamp(),
                    event : Matcher_Event.CLIENT_LEAVE,
                    id : _id,
                    alias : _alias,
                    client : msg.client
                }
                events.printObject(data);
            }
            break;

            case Matcher_Event.SUB_NEW :{
                var data = {
                    time : UTIL.getTimestamp(),
                    event : Matcher_Event.SUB_NEW,
                    id : _id,
                    alias : _alias,
                    sub : msg
                }
                events.printObject(data);
            }
            break;

            case Matcher_Event.SUB_UPDATE :{
                var data = {
                    time : UTIL.getTimestamp(),
                    event : Matcher_Event.SUB_UPDATE,
                    id : _id,
                    alias : _alias,
                    sub : msg
                }
                events.printObject(data);
            }
            break;

            case Matcher_Event.SUB_DELETE :{
                var data = {
                    time : UTIL.getTimestamp(),
                    event : Matcher_Event.SUB_DELETE,
                    id : _id,
                    alias : _alias,
                    sub : msg.sub
                }
                events.printObject(data);
            }
            break;

            case Matcher_Event.PUB :{
                var data = {
                    time : UTIL.getTimestamp(),
                    event : Matcher_Event.PUB,
                    id : _id,
                    alias : _alias,
                    pub : msg.pub
                }
                events.printObject(data);
            }
            break;
        }
    }

	var _listen = function () {
        log.debug('Matcher['+_id+']: listening on ' + _socketAddr.port);

        if (_http.listening) {
			return;
		}

		_http.on('error', (e) => {
			// address already in use
			if (e.code === 'EADDRINUSE') {
			    log.error('Matcher['+_id+']: Address in use, changing port...');
				_socketAddr.port++;
				_http.close();
                setTimeout(() => {
				_listen();
                }, 1000); // Adding a small delay before retrying
			}
			});

		_http.listen(_socketAddr.port);
	}

    // MOVING / MIGRATING CLIENTS
    // TODO: Better function names?

    // send a move client message over VON to new client position
    var _moveClient = this.move = function(clientID, x, y, packet) {
        // Creating new VAST.pos is pointless as functions will be lost when sent over socket
        let newpos = {
            x: x,
            y: y
        };
        var clientID = clientID;

        if (_useMQTT == true) {
            var mqttID = clientID;
            clientID = _mqttID2clientID[mqttID];
            _mqttMovePackets[mqttID] = packet;
        }
        log.debug('Matcher[' + _id + ']: move client[' + clientID + '] to pos[' + newpos.x + '; ' + newpos.y + ']');

        if (_clientList[clientID] === undefined) {
            // is leaving client?
            if (_leavingClients[clientID] !== undefined) {
                console.log('Matcher[' + _id + ']: received move client[' + clientID + '] from client that is currently leaving');
            } else if (_pendingClients[clientID] !== undefined) {
                console.log('Matcher[' + _id + ']: received move client[' + clientID + '] from client that is currently on pending list');
            }
            log.error('Matcher[' + _id + ']: client[' + clientID + '] does not exist on matcher: ' + _id);
            console.log('Client: ' + clientID + ' does not exist on matcher: ' + _id);
            return;
        }

        // I need to move the client subscriptions before I move the client, this is to ensure that the 
        let delta_x = -(_clientList[clientID].pos.x - newpos.x);
        let delta_y = -(_clientList[clientID].pos.y - newpos.y);
        // This is just testing for follow client subscriptions // TODO: Update!
        let subs = _subscriptions[clientID];
        for (var subID in subs){
            let sub = subs[subID];
            console.log('I am checking sub: ' + subID + ' for client: ' + clientID + ' with followClient: ' + sub.followClient);

            if (sub.followClient === true){
                console.log('I am following the client subscription')
                // Now we must move the sub to the new position
                // if (sub.aoi.isPolygon === false) {
                _moveSubscription(sub, new VAST.pos(delta_x,delta_y)); // TODO: I'am moving subs before I am moving the client, if the client is moving to a new matcher, the sub will be moved before the new matcher knows about the client
                // TODO: Check if moveSubscription is working correctly, specifically: Is sub removed if is is outside area of matcher.
                // };
                // _updateSubscription(sub); // This is called when I receive the von message published in movesubscription
            }
        }

        // update position of client object
        _clientList[clientID].pos = newpos;

        // give the new matcher an updated list (it must know it's the host)
        // let subs = _subscriptions[clientID];

        let move_msg = {
            matcherID: _id,
            matcherPos: _pos,
            clientID: clientID,
            clientPos: newpos,
            clientSubs: subs
        }

        //send the move client message over VON
        let pack = new VAST.pointPacket(Matcher_Message.MOVE_CLIENT, move_msg, _id, _pos, newpos);
        _vonPeer.pointMessage(pack);

        _recordEvent(Matcher_Event.CLIENT_MOVE, {
            client: _clientList[clientID]
        });

    }


    //
  var _addClient = this.addClient = function(clientID, clientPos) {
    // Add to client list
    let client = {
      id : clientID,
      pos : clientPos,
      matcherID : _id,
      matcherPos : _pos
    }
    _clientList[clientID] = client;
    return client;
  }


  var _addMQTTClient = function(mqttID, clientPos) {
    var clientID = hashcode(mqttID);

    _mqttID2clientID[mqttID] = clientID
    _clientID2mqttID[clientID] = mqttID
    _addClient(clientID, clientPos);
  }

	// Publications
	// when a new pub is sent by a client, send the pub over VON to relevant peers
	var _publish = this.publish = function(clientID, x, y, radius, payload, channel, pubID, done) {
		if (_useMQTT == true) {
			var mqttID = clientID
			_setPublishCallback(done)
			clientID = this.hashcode(mqttID)
		}

		var aoi = new VAST.area(new VAST.pos(x, y), radius);
		var pub = new VAST.pub(_id, clientID, pubID, aoi, payload, channel);
		var areaPacket = new VAST.areaPacket(Matcher_Message.PUB, pub, _id, _pos, aoi);
		_vonPeer.areaMessage(areaPacket);

		//inform GS
		_recordEvent(Matcher_Event.PUB, {pub : pub});
	}

	// after receiveing publication, check subs and sned to matching clients or
	// to the sub owner position
	// forwardFurther sets wether the mathcer should foward the publication to
	// externally matched subscriptions.

  var _sendPublication = this.sendPublication = function(publication, allowForwarding) {
		var pointPacket;
		var pub = new VAST.pub();
		pub.parse(publication);

		var clientSubs, sub;
		var matcherTargets = [];

		for (var clientID in _subscriptions) { // For all clients for all subscriptions (that I have) of client
			clientSubs = _subscriptions[clientID];
      //console.log("clientSubs:")
      //console.log(clientSubs);
			/* Allow clients to receive messages from themself?
			if(i == pub.clientID){
					continue;
			}
			*/

			for (var subID in clientSubs){
				sub = clientSubs[subID];

				if(sub.channel !== pub.channel){
					//Not on the right channel
					continue;
				}

  			// the publication is covered by one of my subscriptions
				if(sub.aoi.intersectsArea(pub.aoi)){

					// I am the host to this subscription, send pub on the subbed client's socket
					if(sub.hostID === _id){

						// TODO: build a queue for clients still connecting
						// for now, volatile emit for QoS = 0
						try {
                            // dataCapture.log(pub.channel, false)

                            if (pub.payload.username.split("&")[1]) {
                                if (pub.payload.username.split("&")[2] && pub.payload.username.split("&")[2].includes("&PROXYPING")) {
                                    dataLog(pub.payload.username.split("&")[0] + ',' + pub.payload.username.split("&")[1], LogCategory.PROXYBOUND_MATCHER_PING_OUT);
                                } else {
                                    dataLog(pub.payload.username.split("&")[1], LogCategory.CLIENT_OUTBOUND);
                                }
                            }

							if (_useMQTT == true) {
								var packet = JSON.parse(pub.payload)
								packet.payload = Buffer.from(packet.payload.data)

								var mqttID = _clientID2mqttID[sub.clientID]
								var client = _that.broker.clients[mqttID]
								if (client) {
									client.publish(packet, client, _that.publishDone)
								}
							} else {
							  //COUNTERHERE //TODO: Remove
                                //tempcounter += 1;console.log('I am sending this amount of publications to clients: ' + tempcounter)
								// _clientID2socket[sub.clientID].volatile.emit('publication', pub);
                                _clientID2socket[sub.clientID].emit('publication', pub); //remove volatile emit - this was causing issues with large amount of packets
							}

						}
						catch {
							log.error('Matcher['+_id+']: no socket for client[' + sub.clientID+'] <_sendPublication> with pubID: ' + pub.payload.username.split("&")[1]);
                            log.error('Error, and username: ' + pub.payload.username.split("&")[0] + ' and channel: ' + pub.channel);
                            // log.error('I have connection ')
                            
                            // log.error('error: ' + error.message);
                            // log.error(error.stack);
						}
					}

					// I am not the host, so I must forward the publication to the owner if I am
					// the nearest recipient to the host
					else {                        
						// only forward if the host to the matched sub has not yet received the publication
                        if (allowForwarding === true && pub.recipients.includes(sub.hostID) === false
                            && matcherTargets.includes(sub.hostID) === false){   
                            
                            matcherTargets.push(sub.hostID);
                            pointPacket = new VAST.pointPacket(Matcher_Message.PUB_MATCHED, pub, _id, _pos, sub.hostPos);

                            // All the nodes that have received the publication AND are recipints to the current sub;
                            // ie, everybody on this list will want to send a pub_matched event to the host matcher.
                            var checklist = pub.recipients.filter(function(elem){
                                return sub.recipients.includes(elem);
                            });

                            //all the pub recipients that also know of the sub

                            // set the checklist of the pointPacket
                            pointPacket.checklist = checklist;

                            // pointPacket.checklist = null;

                            // will only forward if I am closest to the host between all nodes in checklist
                            _vonPeer.pointMessage(pointPacket, pub.recipients);
                        }
					}
				}
			}
		}
	}

    // a helper function that checks all returns all subs in subList that match the publication 
    var _matchPublication = function(pub, subList){

        let sub;
        for (var subID in subList){
            sub = subList[subID];

            if(sub.channel !== pub.channel){
                //Not on the right channel
                continue;
            }

            // the publication is covered by one of my subscriptions
            if(sub.aoi.intersectsArea(pub.aoi)){

                // I am the host to this subscription, send pub on the subbed client's socket
                if(sub.hostID === _id){

                    // TODO: build a queue for clients still connecting
                    // for now, volatile emit for QoS = 0
                    try {

                        if (_useMQTT == true) {

                            var packet = JSON.parse(pub.payload)
                            packet.payload = Buffer.from(packet.payload.data)

                            //log.debug('Using MQTT to send spatial message to client with clientID '+sub.clientID)
                            //log.debug(clientID2mqttID)

                            var mqttID = _clientID2mqttID[sub.clientID]
                            var client = _that.broker.clients[mqttID]
                            //log.debug('Using MQTT to send spatial message to client with mqttID '+mqttID)
                            //log.debug(client)
                            if (client) {
                                //log.debug('Client is defined to sending message')
                                client.publish(packet, client, _that.publishDone)
                                //log.debug('Done sending message')
                            }
                        } else {
                            _clientID2socket[sub.clientID].emit('publication', pub);
                        }

                    }
                    catch {
                        log.error('Matcher['+_id+']: no socket for client[' + sub.clientID+']');
                    }
                }

                // I am not the host, so I must forward the publication to the owner if I am
                // the nearest recipient to the host
                else {

                    // Overide allow-forwarding if this sub is still being migrated (it has not yet reached it's true host)
                    flag = allowForwarding || (_migratingSubs.hasOwnProperty(sub.clientID) && _migratingSubs[sub.clientID].hasOwnProperty(sub.subID));
                    
                    
                    // only forward if the host to the matched sub has not yet received the publication
                    if (flag === true && pub.recipients.includes(sub.hostID) === false
                        && matcherTargets.includes(sub.hostID) === false){   
                        
                        matcherTargets.push(sub.hostID);
                        pointPacket = new VAST.pointPacket(Matcher_Message.PUB_MATCHED, pub, _id, _pos, sub.hostPos);

                        // All the nodes that have received the publication AND are recipints to the current sub;
                        // ie, everybody on this list will want to send a pub_matched event to the host matcher.
                        var checklist = pub.recipients.filter(function(elem){
                            return sub.recipients.includes(elem);
                        });

                        // set the checklist of the pointPacket
                        pointPacket.checklist = checklist;

                        // will only forward if I am closest to the host between all nodes in checklist
                        _vonPeer.pointMessage(pointPacket, pub.recipients);
                    }
                }
            }
        }
    }

    // This is called when i receive a publication in my region. i check our list of subs and send the pub to relevant clients
    // or other matchers if i are not the "host" to a subscription
    var _handlePublication = this.handlePublication = function(publication){
		var pointPacket;
		var pub = new VAST.pub();
		pub.parse(publication);

		var clientSubs, sub;
		var matcherTargets = [];

		for (var clientID in _subscriptions) {
			clientSubs = _subscriptions[clientID];

			/* Allow clients to receive messages from themself?
			if(i == pub.clientID){
					continue;
			}
			*/

			for (var subID in clientSubs){
				sub = clientSubs[subID];
                
                //Not on the right channel; no need to calculate overlap
				if(sub.channel !== pub.channel){
					continue;
				}

				// the publication intersects the current subscription
				if(sub.aoi.intersectsArea(pub.aoi)){

                    // I am the host
                    if(sub.hostID === _id){
                        
                        // Do I have a connection to this client?
                        if(_clientID2socket[clientID] != undefined){
                            _clientID2socket[sub.clientID].emit('publication', pub);
                            continue;
                        }

                        // are they a leaving client?
                        else if (_leavingClients[clientID != undefined]){
                            sub.hostID = _leavingClients[clientID].hostID;
                        }
                    }
                    // I am not the host, so I must forward the publication to the owner if I am
                    // the nearest recipient to the host
                    // only forward if the host to the matched sub has not yet received the publication
                    if (pub.recipients.includes(sub.hostID) === false && matcherTargets.includes(sub.hostID) === false){   
                        
                        matcherTargets.push(sub.hostID);
                        pointPacket = new VAST.pointPacket(Matcher_Message.PUB_MATCHED, pub, _id, _pos, sub.hostPos);

                        // All the nodes that have received the publication AND are recipints to the current sub;
                        // ie, everybody on this list will want to send a pub_matched event to the host matcher.
                        var checklist = pub.recipients.filter(function(elem){
                            return sub.recipients.includes(elem);
                        });

                        // set the checklist of the pointPacket
                        pointPacket.checklist = checklist;

                        // will only forward if I am closest to the host between all nodes in the checklist
                        _vonPeer.pointMessage(pointPacket, pub.recipients);
                    }
                    
                }

                /*
                try {
                    
                    if (_useMQTT == true) {
                        
                        var packet = JSON.parse(pub.payload)
                        packet.payload = Buffer.from(packet.payload.data)
                        
                        //log.debug('Using MQTT to send spatial message to client with clientID '+sub.clientID)
                        //log.debug(clientID2mqttID)
                        
                        var mqttID = _clientID2mqttID[sub.clientID]
                        var clientID = _that.broker.clients[mqttID]
                        //log.debug('Using MQTT to send spatial message to client with mqttID '+mqttID)
                        //log.debug(client)
                        if (clientID) {
                            //log.debug('Client is defined to sending message')
                            clientID.publish(packet, clientID, _that.publishDone)
                            //log.debug('Done sending message')
                        }
                    } 
                    
                    else {
                        // TODO: build a queue for clients still connecting
                        // for now, volatile emit for QoS = 0
                        _clientID2socket[sub.clientID].volatile.emit('publication', pub);
                    }

                }
                catch {
                    log.error('Matcher['+_id+']: no socket for client[' + sub.clientID+']');
                }
                */

			}
		}
	}


	// Called when client requests removing a subscription. Remove sub object with unique ID

	var _unsubscribe = this.unsubscribe = function(clientID, subID) {
		
        log.debug('Matcher['+_id+']: unsubscribe called for Sub['+subID+'] by Client['+clientID+']');
        
        var clientID = clientID;
		if (_useMQTT == true) {
			clientID = this.hashcode(clientID);
		}

		if (_subscriptions.hasOwnProperty(clientID) && _subscriptions[clientID][subID] !== undefined) {
            var sub = _subscriptions[clientID][subID];

            // delete the subscription for myself 
            // _deleteSub() will be called twice because of sub_delete message, but must be called here to delete distant subs.
            _deleteSubscription(sub);

            // send delete sub message to any other relevant matchers in the AoI
            var areaPacket = new VAST.areaPacket(Matcher_Message.SUB_DELETE, sub, _id, _pos, sub.aoi);
            _vonPeer.areaMessage(areaPacket);
        }

		if (_useMQTT == false) {
			_clientID2socket[clientID].emit('unsubscribe_r', sub);
			//socket.emit('unsubscribe_r', sub);
		}
	}

	// Subscription adding and maintenance

	// Called when client requests a new subscription. Creates new sub object with unique ID
    var _subscribe = this.subscribe = function(clientID, area, channel, subID, followClient) {
        console.log('Sub added!') //TODO: Remove
    
        var clientID = clientID
        if (_useMQTT == true) {
            var mqttID = clientID
            clientID = this.hashcode(clientID)
    
            this.mqttID2clientID[mqttID] = clientID
            this.clientID2mqttID[clientID] = mqttID

            /*log.debug("_mqttID2clientID:")
            //log.debug(this._mqttID2clientID)
            //log.debug("_clientID2mqttID: ")
            log.debug(this._clientID2mqttID)
            */
        }
    
        // create the new sub object
        var aoi;
        if (Array.isArray(area)) { // polygon
            aoi = new VAST.area(null, null, area);
        } else { // circle
            aoi = new VAST.area(new VAST.pos(area.x, area.y), area.radius);
        }
        // var subID = _generate_subID(clientID);
        var sub = new VAST.sub(_id, _pos, clientID, subID, channel, aoi);
        console.log('Subscribing to channel: ' + channel + ' with followClient: ' + followClient);
        if (followClient === 1) {
          sub.followClient = true;
        } else sub.followClient = false;
        // add the subscription to my list, and respond to client
        _addSubscription(sub, true);
    
        // record event
        _recordEvent(Matcher_Event.SUB_NEW, sub);
    
        if (_useMQTT == false) {
            try {
                _clientID2socket[clientID].emit('subscribe_r', sub);
            } catch {
                log.error("Matcher["+_id+"]: no socket for Client["+clientID+"] <_subscribe>, the sub has followClient: " + followClient);
            }
        }
    }
    

    var _updateSubscription = function(sub){ // TODO: Make sure I don't receive sub with sub.clientID = 0
        if (_subscriptions.hasOwnProperty(sub.clientID) && _subscriptions[sub.clientID].hasOwnProperty(sub.subID)){
            _subscriptions[sub.clientID][sub.subID].parse(sub);
            _subscriptions[sub.clientID][sub.subID].heartbeat = UTIL.getTimestamp();
        } else {
            _addSubscription(sub, false);
        }
    }

	var _addSubscription = function (sub, forward) { // TODO: Make sure I don't receive sub with sub.clientID = 0

		var new_sub = new VAST.sub();
		new_sub.parse(sub);
		new_sub.heartbeat = UTIL.getTimestamp();
		
		// will simply update if there is an existing sub

    // add sub to list
    var temp = _subscriptions[new_sub.clientID] || {};
    temp[new_sub.subID] = new_sub;
    _subscriptions[new_sub.clientID] = temp;

    if (forward === true){
      var areaPacket = new VAST.areaPacket(Matcher_Message.SUB_NEW, new_sub, _id, _pos, new_sub.aoi);
      _vonPeer.areaMessage(areaPacket);
    }
	}

    var _moveSubscription = function(sub, delta_pos){ // TODO: This is new, try and complete
        var sub = _subscriptions[sub.clientID][sub.subID];

        if (sub.aoi.isPolygon === false) {
          new_pos = {
            x: sub.aoi.center.x + delta_pos.x,
            y: sub.aoi.center.y + delta_pos.y
          };
          sub.aoi.center.parse(new_pos);
        } else if (sub.aoi.isPolygon === true) {
          for (var i = 0; i < sub.aoi.points.length; i++) {
            sub.aoi.points[i].x += delta_pos.x;
            sub.aoi.points[i].y += delta_pos.y;
          }
        }

        var areaPacket = new VAST.areaPacket(Matcher_Message.SUB_UPDATE, sub, _id, _pos, sub.aoi);
        _vonPeer.areaMessage(areaPacket);

        console.log('Sub moved to new position: ' + _subscriptions[sub.clientID][sub.subID].aoi.center.x + ' ' + _subscriptions[sub.clientID][sub.subID].aoi.center.y)

        _recordEvent(Matcher_Event.SUB_UPDATE, sub);
    }

	var _deleteSubscription = function(sub) {

		// check whether i actually have subs listed for this client
		if (_subscriptions.hasOwnProperty(sub.clientID)){

			// delete the subscription
			delete _subscriptions[sub.clientID][sub.subID];

			// if client list is empty, delete client reference
			if (Object.keys(_subscriptions[sub.clientID]).length == 0){
				delete _subscriptions[sub.clientID];
			}
        }

		_recordEvent(Matcher_Event.SUB_DELETE, {sub : sub});

		log.debug('Matcher['+_id+']: deleting subscription for matcher['+_id+'], subID: '+sub.subID);
		return true;
	}

    var _clientLeave = function(clientID){
        // move client to leaving list and delete from normal clients
        _leavingClients[clientID] = _clientList[clientID];

        // set timeout before I delete the client and it's subs
        _leavingClientDeleteFunction[clientID] = setTimeout(function(){
            _deleteClient(clientID);
        }, _clientDisconnectTime);
    }

	var _deleteClient = function(clientID){
        // ONLY remove subscriptions that are still hosted by me
        // TODO: KEEP ALIVE will delete them naturally by other matchers
        let subs = _subscriptions[clientID];
        for (var subID in subs){
            if (subs[subID].hostID === _id) {
                _deleteSubscription(subs[subID]);
            }
        }

        // notify visualiser
        if (_leavingClients[clientID] !== undefined)
		      _recordEvent(Matcher_Event.CLIENT_LEAVE, {client : _leavingClients[clientID]});

        try{
			delete _socketID2clientID[_clientID2socket[clientID].id];
		}
		catch{

		}
		delete _clientID2socket[clientID];
		delete _leavingClients[clientID];
        delete _leavingClientDeleteFunction[clientID];
        delete _clientList[clientID]; // Surely this is needed?

	}

    var _checkSubscriptions = function(){  // remove subscriptions after subLifeTimeout expiry
        for (var clientID in _subscriptions){
            for (var subID in _subscriptions[clientID]){
                let sub = _subscriptions[clientID][subID];

                // the sub must be removed
                if (UTIL.getTimestamp() - sub.heartbeat > _subLifeTimeout){
                    _deleteSubscription(sub);
                }
            }
        }

        setTimeout(_checkSubscriptions, 1000);
    }

	// Helper Functions

    var _setPublishCallback = this._setPublishCallback = function (publishDone) {
        this.publishDone = publishDone
    }


	var _generate_subID = function(clientID){
		//check the list of existing IDs for client to avoid duplicates
		var count = 0;
		var newID = clientID+'-'+_randomString(5);

		/*
		while(_client2subID[clientID].hasOwnProperty(newID) && count < 100){
			newID = 'M['+_id+']-C['+clientID+']-'+_randomString(5);
			count++;
		}
		*/
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

	//INIT
	// get local IP
	// set address and port for VON and client sockets
	// only call init when this is set
	UTIL.getIPAddress(function(localIP){
		
		_addr = {host: localIP, port : _VON_port};

		_socketAddr = {host: localIP, port: _client_port};

        _init();
	});

	var hashcode = this.hashcode = function(s) {
		return s.split("").reduce(function (a, b) {
			a = ((a << 5) - a) + b.charCodeAt(0);
			return a & a
		}, 0);
	}

	var mqttAuthenticate = this.mqttAuthenticate = function(client, username, password, callback) {
	  var info = JSON.parse(password);
    var clientPos = new VAST.pos(info.x,info.y);
	  _addMQTTClient(client.id, clientPos);
    callback(null, true);

  }

}



