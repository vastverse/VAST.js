const matcher = require('../lib/matcher.js');
require('dotenv').config()
var x = parseFloat(process.argv[2]) || Math.random()*1000;
var y = parseFloat(process.argv[3]) || Math.random()*1000;
var radius = parseFloat(process.argv[4]) || 100;

var M;
// find gateway address before instantiating matcher
// console.log(process.env.COMPUTER_NAME)
UTIL.lookupIP("127.0.0.1", function(addr){

    M = new matcher(x, y, radius, 
        {
            isGateway: true, 
            GW_host: "localhost", 
            GW_port: 8000,
            VON_port: 8001,
            client_port: 20000,
            alias: 1,
            //logLayer: 'Matcher_' + opts.alias,
            //logFile: 'Matcher_' + opts.alias,
            logDisplayLevel : 3,
            logRecordLevel : 4,
            eventDisplayLevel : 0,
            eventRecordLevel : 5
        },
        function(id){
            // matcherIDs2alias[id] = 1;
            console.log('Matcher: ' +1 + ' created with ID: ' + id);
        }
    );

});
