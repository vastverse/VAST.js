// imports
const matcher = require('../lib/matcher.js');

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
//        logDisplayLevel: 5,
//        eventDisplayLevel: 5,
}

m1 = new matcher(matcher_x, matcher_y, matcher_radius, options,
    function(id) {
	console.log("Matcher "+matcherAlias+" has successfully joined Voronoi Overlay Network and been assigned id "+id)
    }
);
            
