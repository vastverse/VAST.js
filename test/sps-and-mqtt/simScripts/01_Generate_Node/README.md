 # 01_Generate_Node

This folder contains scripts and configuration files for generating and running simulation scenarios for the VAST.js project, specifically for SPS (Spatial Publish/Subscribe) and MQTT systems.

## File Overview

- **SPSGen.js**  
  Generates node configurations and simulation scripts for the SPS system based on parameters defined in `config.txt` and `constants.js`.  
  _Usage:_  
  ```bash
  node SPSGen.js
  ```

- **MQTTGenfromSPS.js**  
  Converts SPS-generated simulation scripts into MQTT-compatible scripts, enabling direct comparison between SPS and MQTT scenarios.  
  _Usage:_  
  ```bash
  node MQTTGenfromSPS.js
  ```

- **run_simulations.js**  
  Automates the execution of generated simulation scripts. Can be used to run multiple simulations in batch mode or with varying parameters.  
  _Usage:_  
  ```bash
  node run_simulations.js
  ```

- **constants.js**  
  Contains shared constants and default parameters (such as node counts, area size, etc.) used by the generation scripts.  
  _Edit this file_ to change default simulation values.

- **config.txt**  
  A simple configuration file specifying parameters for node/script generation (e.g., number of nodes, area size, etc.).  
  _Edit this file_ to customize your simulation setup.

## Typical Workflow

1. **Set Parameters:**  
   Edit `config.txt` and/or `constants.js` to define your simulation scenario.

2. **Generate SPS Simulation Script:**  
   ```bash
   node SPSGen.js
   ```

3. **Convert to MQTT Simulation Script (optional):**  
   ```bash
   node MQTTGenfromSPS.js
   ```

4. **Run Simulations:**  
   ```bash
   node run_simulations.js
   ```

## Notes

- Generated simulation scripts and outputs will be saved in the locations specified within the scripts.
- These tools are designed to streamline the process of creating and running large-scale simulation scenarios for both SPS and MQTT systems.

