# Visualiser Guide

The Visualiser utility serves as a valuable tool for understanding and interpreting the operations of our spatial publish-subscribe network. This guide will provide detailed steps on how to utilize the Visualiser effectively.

There are two modes in which you can use the Visualiser: the Static Simulator mode and the Live Watcher/Visualiser mode.
## Static Simulator

To use the simulator, you'll need to author a script that follows the syntax illustrated in the `./visualiser/example_script.txt` file.

Once your script is ready, feed it to the `simulator.js` script 

```sh
    node simulator.js filename
```
This will generate logs and events in a 'logs_and_events' folder. These logs and event files can then be uploaded to the `visualiser.html` file (open this file in a web browser). You can then set a custom time step, and step through the logs per time-step to understand the network's operations.
## Live Watcher/Visualiser

The live visualiser functions slightly differently. While it still relies on the `visualiser.html` file, you'll need to enable the live watcher switch and follow these instructions:
### Configuration 
1. Modify the variables in `lib/common.js` as per your requirements:

```javascript

global.VISUALISE_DEBUG_LOGS = true;
global.VISUALISER_IP = '127.0.0.1:1111';
```



The Visualiser IP should represent the IP address of the machine used for visualising the clients and matchers. 

2. Navigate to the `test` folder and execute `log_watcher.js` (listens on port 1111) on the visualiser machine using the following command:

```bash

node log_watcher.js
```

 
3. Open `simulator/visualiser.html` (flip switch to live watcher) and ensure that the terminal running the `log_watcher.js` node instances establishes a connection with the visualiser.

### Starting Nodes

There are two methods for starting nodes:
#### Option 1: Manually Start Nodes

Please consult the documentation in `start_matcher.js` and `new_client.js` to manually initiate matchers and clients. Note that the first matcher should be a gateway matcher.

Note: These script files are found in the ./test directory.
##### Matcher Example

```bash

node start_matcher.js 1 500 600 true 192.168.1.10 8000 8001 20000 150
```



`start_matcher.js` launches a matcher with the specified parameters. You can supply the alias, coordinates, gateway flags, and other settings for the matcher. The `start_matcher.js` file provides more details.
##### Client Example

```bash

node new_client.js 1 192.168.1.10 20000 500 600 10
```



`new_client.js` initializes a client with the given parameters. You can supply the alias, gateway host, gateway port, and coordinates for the client. The `new_client.js` file provides additional details.

The `client.js` file also includes commands to create subscriptions and publications, as well as a command to relocate the client. Use the `help` command for more information about these commands.
#### Option 2: Start Multiple Nodes for Testing

You can use the `start_many_matchers.sh` bash script to initiate multiple matchers on the visualiser machine for testing, with the first one functioning as the gateway matcher.
### Post-Testing Commands

After completing your tests, you can use the following commands to view the nodes still running on the visualiser and to terminate these nodes:

```bash

pgrep -a -f "node start_matcher.js"
pkill -f "node start_matcher.js"
```



We hope this guide provides all the necessary details to use the Visualiser efficiently and effectively. Happy testing!
