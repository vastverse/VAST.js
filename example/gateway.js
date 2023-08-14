// imports
const matcher = require('../lib/matcher.js');

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
        logDisplayLevel: 5,
        eventDisplayLevel: 5,
}

gw = new matcher(matcher_x, matcher_y, matcher_radius, options,
    function(id) {
	console.log("Gateway "+matcherAlias+" has successfully joined Voronoi Overlay Network and been assigned id "+id)
    }
);
            
