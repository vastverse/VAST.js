# VAST.js
This project developed P2P Spatial Publish and Subscribe built on the Voronoi Overlay Network (VON).
<p align="center">
👷👷 <strong>Please note that we're actively developing this library, the documentation may not provide full coverage.</strong> 👷👷
</p>
 
- [VAST.js](#vastjs)
- [Introduction to VAST.js](#introduction-to-vastjs)
    - [Basic Stricture](#basic-structure)
    - [Matchers](#matchers)
    - [Voronoi Overlay Network](#voronoi-overlay-network)
- [Dependancies](#dependancies)
- [Getting Started](#getting-started)

# Introduction to VAST.js
## Basic Structure
<img src="./docs/images/VAST_Layers.png" alt="drawing" width="400"/>

## Matchers
Clients establish connections to [matchers](./docs/matcher.md) based on their position in the environment. Matchers act as "spatial message brokers", i.e. they are responsible for handling subscription requests from their own clients and for matching publications to subscriptions.
Each matcher keeps a list of all subscriptions of its own clients as well as copies of "ovelapping" subscriptions for clients connected to other matchers.  
  
Matchers are not "aware" of each other and do not have direct connections, instead each matcher has an underlying [VON Peer](./docs/VON.md), which can be used to send any matcher-to-matcher packets with spatial forwarding functions in the VON peer. 

In this project, the term "VON Peer" is seldom used. Instead, we predominantly use the term "Matcher". Essentially, a "matcher" represents both a spatial publish/subscribe (pub/sub) system matcher and a VON Peer.

## Voronoi Overlay Network
The Voronoi Overlay Network (VON) is a dynamic, self-organising peer-to-peer network that establishes mutual awareness and a TCP socket between each peer and its neighbours in the virtual environment. Each peer maintains a localised Voronoi partition of its enclosing, AoI and boundary neighbours, which is shared between peers to facilitate neighbour discovery as peers join, leave and move around the VE. The VON has been extended to send any message to a point or area in the environment, and each VON peer will only receive the message once.
  
For more detail on the VON, see [VON Peer](./docs/VON.md)

# Dependancies
<!-- ## Worker Threads Module
The VON peer runs on a worker thread of the Matcher. Install in the VAST.js directory using:
```sh
npm install worker-threads
```  -->
## Node.js and NPM

In order to host matchers and clients node instances are used. Install Node.js and the NPM package manager:
```sh
sudo apt install nodejs
sudo apt install npm
```
## Socket.io and jQuery
Matchers use socket.io to establish a WebSocket connection with clients and other matchers and the live visualiser uses Jquery to manipulate HTML in order to give a visual representation of the VAST network.
Install in the VAST.js directory using:
```sh
npm install socket.io
npm install socket.io-client
npm install JQuery
```

# Getting Started

This project presents an implementation of a spatial publish-subscribe network. To facilitate a swift implimentation and comprehension of the Spatial pub/sub concept, we have developed a visualiser tool. It is highly advised to employ this visualiser and to examine the code located in the ./test directory. This will provide insight into the functioning of the network and be a guide on how to initialize matchers and clients effectively.

Further details about the visualiser can be found in the ./visualiser directory, or by clicking the following link: [Visualiser Instructions](./visualiser/README.md).

## Starting a gateway

A gateway is the first matcher creates a peer-to-peer, ad hoc network. The identity of the gateway is the only information that all matchers need to know before joining the VAST network. The following informaton regarding the gateway needs to be specified (and known to all matchers):

- Hostname (or IP address) of Gateway
- Gateway port (used to initially join the VAST network)
- Matcher port (used by gateway to exchange messages with other matchers in order to self-organize)
- Client port (used by clients to exchange messages with gateway)
- Matcher alias (a name to refer to the gateway)
- Gateway location (specified in coordinates <matcher_x, matcher_y>)

```js
// imports  
const matcher = require('./lib/matcher.js');  

// Gateway information  
GatewayHostname = '127.0.0.1'  
GatewayPort = 8000  
MatcherVONPort = 8001  
ClientListenPort = 20000  
matcherAlias = "GW"  
matcher_x = 500  
matcher_y = 500  
matcher_radius = 100    

const options = {  
        isGateway: true,  
        GW_host: GatewayHostname,  
        GW_port: GatewayPort,  
        VON_port: MatcherVONPort,  
        client_port: ClientListenPort,  
        alias: matcherAlias,  
}  

gw = new matcher(matcher_x, matcher_y, matcher_radius, options, function(id) {  
		console.log("Gateway "+matcherAlias+" has successfully joined Voronoi Overlay Network and been assigned id "+id)  
    }  
);  
```

Once the gateway has successfully been started the output of the log should be as follows:

> {"time":1691412362460,"msg":"Matcher[1]: useMQTT: false"}
> {"time":1691412362466,"msg":"Matcher[1]: VON peer joined successfully"}
> {"time":1691412362466,"msg":"Matcher[1]: listening on 20000"}
> Gateway GW has successfully joined Voronoi Overlay Network and been assigned id 1

## Connecting with a client

At least a single matcher needs to be running before a client can connect (if there is only one matcher in the VAST network it will also be the gateway). A VAST client needs the following information to connect to a matcher:

- Hostname (or IP address) of Gateway
- Client port (used by clients to exchange messages with matchers)
- Client location (specified as 2D coordinates <x,y>)
- Client area of interest (specified as radius <r>)

The example code below is the minimum needed to connect to a matcher
```js
// imports
const client = require('./lib/client.js');  

// Gateway information
GatewayHostname = "127.0.0.1"
GatewayClientListenPort = 20000
clientAlias = "C1"  

// Client information
client_x = 350
client_y = 350
client_radius = 20  

c = new client(GatewayHostname, GatewayClientListenPort, clientAlias, client_x, client_y, client_radius, function(id) {
	c.setAlias = clientAlias;
    let m = c.getMatcherID();
    console.log("Client "+clientAlias+" assigned to matcher with ID: " + m);
    });
```

If a client has successfully connected to a matcher the log of the matcher should have the following entries:

> {"time":1691412842678,"msg":"Matcher[1]: a new client has joined GW. Send MOVE request"}
> {"time":1691412842678,"msg":"Matcher[1]: move client[C1] to pos[350; 350]"}

the log of the client should look as follows:

> {"time":1691412937865,"msg":"Client[C1]: socket connected"}
> {"time":1691412937871,"msg":"Client[C1]: assigned to matcher[1]"}
> Client C1 assigned to matcher with ID: 1

## Subscribing to a spatial area (and channel)

Once a client has succesfully connected to a matcher, it can subscribe to receive messages published to a spatial area and channel. This is done by sending the matcher a SUBSCRIBE message. The following parameters need to be specified when subscribing

- Subscription location (specificed in coordinates <sub_x,sub_y>)
- Subscription area (specified as radius)
- Topic (or channel)

```js
// Subscription information
sub_x = 350
sub_y = 350
sub_radius = 20
channel = "channel1"

c.subscribe(sub_x, sub_y, sub_radius, channel);
```

If a client has successfully suscribed to an area the log of the matcher should have the following entries:

> {"time":1691413101038,"msg":"Matcher[1]: Received subscribe message from client[C1]"}
> {"time":1691413101039,"msg":"Matcher[1]: New Sub from Matcher[1]"}

and the log of the client should look as follows:

> {"time":1691413101037,"msg":"Client[C1]: subscribing to channel[channel1] at AoI[350; 350; 20]"}
> C1: added subscription <350, 350, 20, channel1
> {"time":1691413101039,"msg":"Client[C1]: added a subscription:"}
> {"time":1691413101040,"msg":{"hostID":1,"hostPos":> >< {"x":500,"y":500},"clientID":"C1","subID":"C1-Dfnrf","channel":"channel1","aoi":{"center":{"x":350,"y":350},"radius":20},"recipients":[],"heartbeat":1691413101038}}

## Publishing to a spatial area (and channel)

Once a client has succesfully connected to a matcher, it can also publish a message to a spatial area and channel. Any clients that have overlapping subscription areas (with matching channel) will receive a copy of the message. This is done by sending the matcher a PUBLISH message. The following parameters need to be specified when publishing a spatial message

- Publication location (specificed in coordinates <pub_x,pub_y>)
- Publication area (specified as radius)
- Topic (or channel) (specificed as text)
- Message (specified as text)

```js
// Publication information
pub_x = 350
pub_y = 350
pub_radius = 20
channel = "channel1"
message = "Spatial publication for client C1"

c.publish(pub_x, pub_y, pub_radius, message, channel);
```

If a client has successfully published the spatial message the log of the matcher should have the following entries:

> {"time":1691414289570,"msg":"Matcher[1]: Received Publication from Matcher[1]"}

and the log of the client should look as follows:

> {"time":1691414251033,"msg":"Client[C1]: publishing to channel[channel1] with payload: Spatial publication for client C1"}

## Moving a client's location

If a client is connected it can modify its location by sending the matcher a MOVE message. The following parameters need to be specified:

```ts
// Client new location 
client_new_x = 50
client_new_y = 50

c.move(client_new_x, client_new_y)
```

If a client has successfully changed its location the log of the matcher should have the following entries:

> {"time":1691415202914,"msg":"Matcher[1]: move client[C1] to pos[50; 50]"}

## Adding another matcher

The VAST library supports multiple matchers, that are interconnected and exchanges messages using the Voronoi Overlay Network (VON). Once a VAST network has been created by starting a gateway, additional matchers can join the VAST network by connecting to the VAST gateway. The following information needs to be specified:

- Hostname (or IP address) of Gateway
- Gateway port (used to initially join the VAST network)
- Matcher port (used by matcher to exchange messages with other matchers in order to self-organize)
- Client port (used by clients to exchange messages with matchers)
- Matcher alias (a name to refer to the matcher)
- Matcher location (specified in coordinates <matcher_x, matcher_y>)

The following example code can be used to add a matcher to a VAST network that has an existing gateway

```js
// imports
const matcher = require('./lib/matcher.js');

// Gateway information
GatewayHostname = '127.0.0.1'
GatewayPort = 8000

// Matcher information
MatcherVONPort = 8002
ClientListenPort = 20010
matcherAlias = "M1"
matcher_x = 100
matcher_y = 100
matcher_radius = 100

const options = {
        isGateway: false,
        GW_host: GatewayHostname,
        GW_port: GatewayPort,
        VON_port: MatcherVONPort,
        client_port: ClientListenPort,
        alias: matcherAlias,
}

m1 = new matcher(matcher_x, matcher_y, matcher_radius, options, function(id) {
	console.log("Matcher "+matcherAlias+" has successfully joined Voronoi Overlay Network and been assigned id "+id)
    });
```

When there are more than two matchers in the VAST network, a client will be connected to the closest matcher. 'Closest matchers' is defined to be the matcher whos spatial location is the shortest distance from the client's spatial location. A new client must always first connect to the gateway. If needed, the gateway will migrate the client connection to the matcher that is spatially closest to the client.





