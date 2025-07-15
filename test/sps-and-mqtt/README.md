# SPS-and-MQTT

## Overview

This folder contains tools, scripts, and simulations for comparing and demonstrating the benefits of SPS-MQTT (Spatial Publish/Subscribe over MQTT), standard MQTT, and pure SPS (Spatial Publish/Subscribe).

**SPS-MQTT** extends the MQTT protocol by allowing clients to subscribe and publish based on spatial regions, enabling efficient, context-aware communication for applications like IoT, smart cities, and multiplayer games.

## Folder Structure

- **MQTT/**: Standard MQTT simulation scripts.
- **SPMQTT/**: SPS-MQTT (Spatial Publish/Subscribe over MQTT) simulation scripts.
- **SPS/**: Pure SPS (Spatial Publish/Subscribe) simulation scripts and logs.
- **parsers/**: Scripts for parsing and analyzing simulation logs.
- **simScripts/**: 
  - Example simulation scripts for different scenarios.
  - **Node generator scripts** (e.g., `generator.js`, `node_gen.js`, `interactiveGenerator.js`, `scriptGenerator.js`) for creating custom simulation scenarios.
- **logs_and_events/**: Output logs and event traces from simulations.
- **processMultipleFilesV2.js**: Batch processing and analysis of simulation results.
- **analyze_latency.js**: Tool for analyzing message latency.
- **README.md**: (You are here!)

## Key Scripts

- `MQTT/mqtt-simulator_1.js`: Runs a standard MQTT simulation.
- `SPMQTT/aedes-sps-mqtt-simulator.js`: Runs an SPS-MQTT simulation.
- `SPS/simulator.js`: Runs a pure SPS simulation.
- `SPS/logs_and_events/`: Contains logs and events from SPS simulations.
- `simScripts/`: 
  - Example simulation scenarios (e.g., grid, clusters, hotspots).
  - **Node generator scripts**:
    - `generator.js`, `node_gen.js`, `interactiveGenerator.js`, `scriptGenerator.js`: Generate node/client configurations and simulation scripts.
- `parsers/`: Tools for parsing and comparing event logs.
- `processMultipleFilesV2.js`: Aggregates and compares results from multiple simulation runs.

## How to Use

### 1. Install Dependencies

From the project root:

```bash
npm install
```

### 2. Generate Simulation Scripts

Use node generator scripts in `simScripts/` to create custom scenarios:

```bash
node simScripts/generator.js
node simScripts/node_gen.js
node simScripts/interactiveGenerator.js
node simScripts/scriptGenerator.js
```

### 3. Run a Simulation

**Standard MQTT:**
```bash
node MQTT/mqtt-simulator_1.js simScripts/example1_mixed.txt
```

**SPS-MQTT:**
```bash
node SPMQTT/aedes-sps-mqtt-simulator.js simScripts/example1_mixed.txt
```

**Pure SPS:**
```bash
node SPS/simulator.js simScripts/example1_mixed.txt
```

### 4. Analyze Results

Parse and compare logs:

```bash
node parsers/runAllParsers.js
node processMultipleFilesV2.js
```

### 5. Example Scenarios

Try different scripts in `simScripts/` to see how spatial filtering affects message delivery and bandwidth.

## Benefits of SPS-MQTT

- Reduces unnecessary message delivery by filtering based on spatial relevance.
- Scales better for large, dynamic networks (e.g., mobile clients, IoT).
- Enables context-aware applications (e.g., only notify users/devices in a specific area).

## Contributing

Feel free to add new scenarios, improve parsers, or enhance the simulations! 