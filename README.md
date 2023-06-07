# VAST.js
This project is centered around constructing a Peer-to-Peer (P2P) Spatial Publish and Subscribe system, which is fundamentally grounded on the Voronoi Overlay Network (VON) infrastructure. 

<p align="center">
👷👷 <strong>**Please note that we're actively developing this software, and as such, the documentation may not provide comprehensive coverage.**</strong> 👷👷
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

<br/><br/>

## Voronoi Overlay Network
The Voronoi Overlay Network (VON) is a dynamic, self-organising peer-to-peer network that establishes mutual awareness and a TCP socket between each peer and its neighbours in the virtual environment. Each peer maintains a localised Voronoi partition of its enclosing, AoI and boundary neighbours, which is shared between peers to facilitate neighbour discovery as peers join, leave and move around the VE. The VON has been extended to send any message to a point or area in the environment, and each VON peer will only receive the message once.
  
For more detail on the VON, see [VON Peer](./docs/VON.md)

<br/><br/>

# Dependancies
<!-- ## Worker Threads Module
The VON peer runs on a worker thread of the Matcher. Install in the VAST.js directory using:
```sh
npm install worker-threads
```  -->

<!-- <br/><br/> -->
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

##

<!-- <br/><br/> -->

<br/><br/>

# Getting Started

This project presents an implementation of a spatial publish-subscribe network. To facilitate a swift implimentation and comprehension of the Spatial pub/sub concept, we have developed a visualiser tool. It is highly advised to employ this visualiser and to examine the code located in the ./test directory. This will provide insight into the functioning of the network and be a guide on how to initialize matchers and clients effectively.

Further details about the visualiser can be found in the ./visualiser directory, or by clicking the following link: [Visualiser Instructions](./visualiser/README.md).