# Simulator and Live Testing Visualization - Readme

This Readme file explains how to simulate a vast network, start dummy clients and matchers, and visualize them using the provided tools.
## Configuration 
1. In `lib/common.js`, set the following variables as desired:

```javascript

global.VISUALISE_DEBUG_LOGS = true;
global.VISUALISER_IP = '146.232.104.193:1111';
```



The visualizer IP should be the IP of the machine used to visualize all the clients and matchers. 
2. Change directory (cd) into the `test` folder and run `log_watcher.js` on the visualizer machine using this command:

```bash

node log_watcher.js
```

 
3. Open `simulator/visualiser.html`, set the time step duration to 105ms, and observe that the terminal running the `log_watcher.js` node instances establishes a connection with the visualizer.
## Starting Nodes
### Option 1: Manually Start Nodes

Refer to the documentation in `start_matcher.js` and `new_client.js` to manually start matchers and clients. Remember that the first matcher should be a gateway matcher.
#### Matcher Example

```bash

node start_matcher.js 1 500 600 true 192.168.1.10 8000 8001 20000 150
```



`start_matcher.js` initializes a matcher with the given parameters. You can provide the alias, coordinates, gateway flags, and other settings for the matcher. More details can be found in the `start_matcher.js` file.
#### Client Example

```bash

node new_client.js 1 192.168.1.10 20000 500 600 10
```



`new_client.js` initializes a client with the given parameters. You can provide the alias, gateway host, gateway port, and coordinates for the client. More details can be found in the `new_client.js` file.

The `client.js` file also has commands to create subscriptions and publications, as well as a command to move the client. Use the `help` command to find more information about these commands.
### Option 2: Start Multiple Nodes for Testing

Use the `start_many_matchers.sh` bash script to start multiple matchers on the visualizer machine for testing, with the first one being the gateway matcher.
## Post-Testing Commands

After testing, you can use the following commands to view the nodes still running on the visualizer and to kill these nodes:

```bash

pgrep -a -f "node start_matcher.js"
pkill -f "node start_matcher.js"
```