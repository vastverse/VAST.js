// imports
const client = require('../lib/client.js');

// Gateway information
GatewayHostname = "127.0.0.1"
GatewayClientListenPort = 20000

// Client information
clientAlias = "C1"
client_x = 300
client_y = 300
client_radius = 20

c = new client(GatewayHostname, GatewayClientListenPort, clientAlias, client_x, client_y, client_radius, 
		function(id) {
                    c.setAlias = clientAlias;
                    let m = c.getMatcherID();
                    console.log("Client "+clientAlias+" assigned to matcher with ID: " + m);			
                });
            
