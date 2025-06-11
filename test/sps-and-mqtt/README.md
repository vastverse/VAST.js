# SPS and MQTT Simulator

This directory contains simulators for testing both MQTT and SPS (Spatial Publish/Subscribe) functionality in the VAST system.

## Directory Structure

```
sps-and-mqtt/
├── MQTT/                    # MQTT-specific simulator
│   └── mqtt-simulator_1.js  # Main MQTT simulator implementation
├── SPMQTT/                  # Combined SPS and MQTT simulator
│   ├── aedes-sps-mqtt-simulator.js    # Main SPS-MQTT simulator
│   └── aedes-mqtt-simulator_2.js      # Alternative MQTT implementation
├── logs/                    # Directory for simulation logs
├── node_generator.js        # Tool for generating node configurations
└── simulationScript.txt     # Example simulation script
```

## Components

### MQTT Simulator
The MQTT simulator (`mqtt-simulator_1.js`) implements a basic MQTT broker with:
- Client connection management
- Topic-based publish/subscribe
- QoS1 message delivery
- Area of Interest (AOI) tracking
- Event logging compatible with VAST system

### SPS-MQTT Simulator
The SPS-MQTT simulator combines spatial publish/subscribe with MQTT functionality:
- Spatial subscription management
- MQTT message routing
- AOI-based message delivery
- Matcher coordination
- Event logging

## Usage

1. **Running the MQTT Simulator**:
```bash
node MQTT/mqtt-simulator_1.js
```

2. **Running the SPS-MQTT Simulator**:
```bash
node SPMQTT/aedes-sps-mqtt-simulator.js
```

3. **Using the Node Generator**:
```bash
node node_generator.js
```

## Simulation Scripts

The `simulationScript.txt` file defines the simulation scenario with commands like:
- `newMatcher`: Create a new matcher node
- `newClient`: Create a new client
- `subscribe`: Subscribe to a topic with AOI
- `publish`: Publish a message to a topic
- `wait`: Add delay between operations
- `end`: End the simulation

## Logging

Simulation logs are stored in the `logs/` directory:
- `mqtt_client_events.txt`: Client event logs
- `mqtt_client_messages.txt`: Message delivery logs
- Individual client logs: `client_[ID].log`

## Event Types

The simulators log events compatible with the VAST system:
- `CLIENT_JOIN` (0): Client joins the system
- `CLIENT_CONNECT` (2): Client connects to broker
- `CLIENT_MIGRATE` (4): Client migrates between matchers
- `SUB_NEW` (6): New subscription
- `SUB_DELETE` (8): Subscription deletion
- `PUB` (9): Message publication
- `RECEIVE_PUB` (10): Message reception

## Dependencies

- aedes: MQTT broker implementation
- mqtt: MQTT client library
- fs: File system operations
- path: Path manipulation utilities

## Notes

- The simulators use QoS1 for reliable message delivery
- AOI radius is set to 10 units by default
- Matcher IDs are assigned numerically starting from 0
- Client positions are tracked in 2D space (x, y coordinates) 