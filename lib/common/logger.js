/*
    logger for vast.js  
    
    To use, create a new layer (layers may be reused / shared) and call the 
    debug, sys, etc. functions. 

    TODO:
        - closeLayer()
        - layer protections? write streams overwrite old files...
        - potentially .csv functionality. Not a priority 


    Record Levels:
        0: No recording to a file. The logger does not write any logs to a file.
        1: Error logs only. The logger writes only error logs to a file.
        2: Warning and error logs. The logger writes warning and error logs to a file.
        3: Debug, warning, and error logs. The logger writes debug, warning, and error logs to a file.
        4: System, debug, warning, and error logs. The logger writes system, debug, warning, and error logs to a file.

    Display Levels:
        0: No logs displayed. The logger does not print any logs to the console.
        1: Only error logs displayed. The logger prints only error logs to the console.
        2: Warning and error logs displayed. The logger prints warning and error logs to the console.
        3: Debug, warning, and error logs displayed. The logger prints debug, warning, and error logs to the console.
        4: System, debug, warning, and error logs displayed. The logger prints system, debug, warning, and error logs to the console.

*/

let fs = require('fs');
const axios = require('axios');

function logger() {

    // Structures for logger layers, recording streams
    let _layers = [];
    let _streams = [];

    // color control codes 
    let _green = '\x1b[32m';
    let _red = '\x1b[31m';
    let _white = '\x1b[m';
    let _yellow = '\x1b[33m';

    let _ERR = _red;
    let _ERREND = _white
    let _WARN = _yellow;

    // convert obj to msg
    let _convert = function (obj) {	    
        return (typeof obj === 'object' ? JSON.stringify(obj) : obj);
    }    
    
    // get current time
    let _curr_time = function () {
        var currDate = new Date();
        return currDate.getTime();
        //return '-' + currDate.getHours() + ':' + currDate.getMinutes() + '- '; 
    }

    // add a new layer
    // TODO: add extensions? currently defaults to .txt in record.js
    // TODO: merge layername and filename. No real need for both if its 1-to-1 relationship. Asking for bugsss..
    this.newLayer = function (layername, filename, directory, displayLevel, recordLevel){
        var path = directory+'/'+filename;

        // check if the layer already exists
        if (_layers.hasOwnProperty(layername)){
            //_layers[layername].warn('Logging layer "' + layername + '" already exists.');
        }

        // create the new layer
        else {

            // Check if an open write stream exists for this file.
            // only create if recordLevel > 0
            if (!_streams.hasOwnProperty(path) && recordLevel > 0){
                _streams[path] = new stream(filename, directory);
            }

            _layers[layername] = new layer(layername, displayLevel, recordLevel, _streams[path]);
        } 

        // return reference to layer
        return _layers[layername];
    }

    let layer = function(layername, displayLevel, recordLevel, stream){
        let _layername = layername;
        let _displayLevel = typeof(displayLevel) == 'number' ? displayLevel : 1; // by default, display errors only 
        let _recordLevel = typeof(displayLevel) == 'number' ? recordLevel : 0;  // by default, do not write to a file
        let _stream = stream;

        // SET LEVELS WILL BREAK IF RECORDLEVEL = 0 set to > 1
        // Do not reimplement unless ablsolutely neccessary
        /*
        this.setLevels = function(displayLevel, recordLevel){
            _displayLevel = displayLevel;
            _recordLevel = recordLevel;
        }
        */

        this.close = function(){
            delete _layers[_layername];
        }

        // going to be used for printing "event" or "state" type objects to a results file

        this.printObject = function(obj){    
            var obj = JSON.stringify(obj);
            
            if (_displayLevel >= 1)
                // console.log(obj);

            if (_recordLevel >= 1)
                _stream.writeLine(obj);
        }
        

        this.sys = function (msg) {
            //msg = _curr_time()() + _convert(msg);
            msg = _convert({time: _curr_time(), msg: msg});    
            if (_displayLevel >= 4)
                console.log(msg);

            if (_recordLevel >= 4)
                _stream.writeLine(msg);
        }
        
        this.debug = function (msg) {
            msg = _convert({time: _curr_time(), msg: msg});    
            if (_displayLevel >= 3)
                console.log(msg);

            if (_recordLevel >= 3)
                _stream.writeLine(msg);
        }
    
        this.warn = function (msg) {
            msg = _convert({time: _curr_time(), msg: msg});    
            if (_displayLevel >= 2)
                console.log(_WARN + msg + _ERREND);

            if (_recordLevel >= 2)
            _stream.writeLine(msg);
        }
    
        this.error = function (msg) {
            msg = _convert({time: _curr_time(), msg: msg});    
            if (_displayLevel >= 1)
                console.log(_ERR + msg + _ERREND);

            if (_recordLevel >= 1)
            _stream.writeLine(msg);
        }
        
        this.stack = function () {
            var e = new Error('dummy');
            var stack = e.stack.replace(/^[^\(]+?[\n$]/gm, '')
                .replace(/^\s+at\s+/gm, '')
                .replace(/^Object.<anonymous>\s*\(/gm, '{anonymous}()@')
                .split('\n');
            console.log(stack);                
        }
    }
}

let stream = function(filename, directory, extension) {
    let _filename = filename;
    let _directory = directory;
    let _extension = extension || '.txt';
    let _path = process.cwd();
    let _stream;
    
    async function sendDebugInfoToRemoteServer(data) {
        let parsedData = typeof data === 'string' ? JSON.parse(data) : data; // I want to send an message with the amount of clients connected to matcher to visualiser

        if (data.includes('event')|| (parsedData.msg && parsedData.msg.includes('clients'))) { //TODO: This is so that we don't overload the HTTP, could remove
            try {
                await axios.post('http://' + VISUALISER_IP +'/log', {
                    logData: data,
                    filename: _filename,
                    directory: _directory,
                    extension: _extension
                });
            } catch (err) {
                console.error('Error sending log data to remote server:', err.message);
            }
        }
    }

    let _init = function(){
        if (!fs.existsSync(_path+'/'+_directory)) {
            console.log("creating directory " + _path+'/'+_directory)            
            fs.mkdirSync(_path+'/'+_directory, { recursive: true}, (error) => {
                if (!error)
                    console.log("Directory created in here")
            });
        }
    
        try {
            if (VISUALISE_DEBUG_LOGS) {
                _stream = {
                    write: sendDebugInfoToRemoteServer
                };
            } else _stream = fs.createWriteStream(_path+'/'+_directory+'/'+_filename+_extension, { flags: 'a' });
        } 
        catch (e) {
            if (VISUALISE_DEBUG_LOGS) {
                _stream = {
                    write: sendDebugInfoToRemoteServer
                };
            } else {
                console.log("Cannot find directory. Create it");
                fs.mkdirSync(_path+'/'+_directory);
                _stream = fs.createWriteStream(_path+'/'+_directory+'/'+_filename+_extension, { flags: 'a' });    
            }
        }
    }

    this.writeLine = function(data) {     
        // only stringify if not already a string. (Avoid double quotations)
        data = typeof data === 'object' ? JSON.stringify(data) + '\n' : data + '\n';
        try {
            _stream.write(data);
        } catch (e) {
            console.log('Cannot write to ' + _path + '/' + _directory + '/' + _filename + _extension);
            console.log('error:', e);
        }
    }

    this.close = function(){
        _stream.end();
    }

    _init();
}

if (typeof module !== 'undefined'){
	module.exports = logger;
}