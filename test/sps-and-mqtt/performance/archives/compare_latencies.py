#!/usr/bin/env python3
"""
Compare publish/subscribe latencies from SPS, MQTT, and SPMQTT event log files.
"""

import json
import sys
from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

# File paths for the three systems
FILES = {
    'SPS': '/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/logs/spmqtt_events/sim_test_uniform_1754981343348/spmqtt_client_events_no_broker.txt',
    'MQTT': '/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/logs/mqtt_events/sim_test_uniform_1754981095726/mqtt_client_events_no_broker.txt',
    'SPMQTT': '/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/logs/spmqtt_events/sim_test_uniform_1754981343348/spmqtt_client_events_no_broker.txt'
}

def parse_log_file(file_path, system_name):
    """Parse log file and calculate latencies."""
    pub_events = {}
    latencies = []
    
    try:
        with open(file_path, 'r') as f:
            for line in f:
                try:
                    event = json.loads(line.strip())
                    
                    if event.get('event') == 9 and 'pub' in event and 'pubID' in event['pub']:
                        # PUB event
                        pub_id = event['pub']['pubID']
                        pub_events[pub_id] = event['time']
                    
                    elif event.get('event') == 10 and 'pub' in event and 'pubID' in event['pub']:
                        # RECEIVE_PUB event
                        pub_id = event['pub']['pubID']
                        if pub_id in pub_events:
                            receive_time = event['time']
                            pub_time = pub_events[pub_id]
                            if receive_time >= pub_time:
                                latency = receive_time - pub_time
                                latencies.append({
                                    'system': system_name,
                                    'pub_time': pub_time,
                                    'receive_time': receive_time,
                                    'latency_ms': latency,
                                    'sequence': len(latencies)
                                })
                
                except json.JSONDecodeError:
                    continue
                except Exception as e:
                    continue
    
    except FileNotFoundError:
        print(f"Warning: File not found for {system_name}: {file_path}")
        return []
    
    return latencies

def main():
    # Collect all latencies
    all_data = []
    
    for system, file_path in FILES.items():
        print(f"Processing {system}...")
        latencies = parse_log_file(file_path, system)
        print(f"  Found {len(latencies)} latency measurements")
        all_data.extend(latencies)
    
    if not all_data:
        print("No latency data found!")
        return
    
    # Convert to DataFrame
    df = pd.DataFrame(all_data)
    
    # Set up the plot style
    plt.style.use('seaborn-v0_8-darkgrid')
    colors = {'SPS': '#1f77b4', 'MQTT': '#ff7f0e', 'SPMQTT': '#2ca02c'}
    
    # Create figure with multiple subplots
    fig = plt.figure(figsize=(16, 12))
    
    # 1. Latency Line Graph (by sequence)
    ax1 = plt.subplot(2, 2, 1)
    for system in ['SPS', 'MQTT', 'SPMQTT']:
        system_df = df[df['system'] == system]
        if len(system_df) > 0:
            ax1.plot(system_df['sequence'], system_df['latency_ms'], 
                    label=system, color=colors[system], alpha=0.7, linewidth=1)
    ax1.set_xlabel('Message Sequence')
    ax1.set_ylabel('Latency (ms)')
    ax1.set_title('Latency by Message Sequence')
    ax1.legend()
    ax1.grid(True, alpha=0.3)
    
    # 2. Latency over Time
    ax2 = plt.subplot(2, 2, 2)
    for system in ['SPS', 'MQTT', 'SPMQTT']:
        system_df = df[df['system'] == system].sort_values('receive_time')
        if len(system_df) > 0:
            # Normalize time to start from 0
            min_time = system_df['receive_time'].min()
            normalized_time = (system_df['receive_time'] - min_time) / 1000  # Convert to seconds
            ax2.plot(normalized_time, system_df['latency_ms'], 
                    label=system, color=colors[system], alpha=0.7, linewidth=1)
    ax2.set_xlabel('Time (seconds from start)')
    ax2.set_ylabel('Latency (ms)')
    ax2.set_title('Latency over Time')
    ax2.legend()
    ax2.grid(True, alpha=0.3)
    
    # 3. Histogram Comparison
    ax3 = plt.subplot(2, 2, 3)
    for system in ['SPS', 'MQTT', 'SPMQTT']:
        system_df = df[df['system'] == system]
        if len(system_df) > 0:
            ax3.hist(system_df['latency_ms'], bins=50, alpha=0.6, 
                    label=system, color=colors[system], edgecolor='black', linewidth=0.5)
    ax3.set_xlabel('Latency (ms)')
    ax3.set_ylabel('Frequency')
    ax3.set_title('Latency Distribution')
    ax3.legend()
    ax3.grid(True, alpha=0.3)
    
    # 4. Box Plot Comparison
    ax4 = plt.subplot(2, 2, 4)
    data_to_plot = []
    labels = []
    for system in ['SPS', 'MQTT', 'SPMQTT']:
        system_df = df[df['system'] == system]
        if len(system_df) > 0:
            data_to_plot.append(system_df['latency_ms'].values)
            labels.append(system)
    
    bp = ax4.boxplot(data_to_plot, labels=labels, patch_artist=True)
    for patch, label in zip(bp['boxes'], labels):
        patch.set_facecolor(colors[label])
        patch.set_alpha(0.7)
    ax4.set_ylabel('Latency (ms)')
    ax4.set_title('Latency Distribution Comparison')
    ax4.grid(True, alpha=0.3)
    
    plt.suptitle('SPS vs MQTT vs SPMQTT Latency Comparison', fontsize=16)
    plt.tight_layout()
    plt.savefig('latency_comparison.png', dpi=300, bbox_inches='tight')
    print("Saved plot to latency_comparison.png")
    
    # Create a detailed latency line graph with smoothing
    plt.figure(figsize=(14, 8))
    
    for system in ['SPS', 'MQTT', 'SPMQTT']:
        system_df = df[df['system'] == system].sort_values('sequence')
        if len(system_df) > 0:
            # Plot raw data with low alpha
            plt.plot(system_df['sequence'], system_df['latency_ms'], 
                    color=colors[system], alpha=0.3, linewidth=0.5)
            
            # Add rolling average for smoother line
            if len(system_df) > 20:
                window = min(50, len(system_df) // 10)
                rolling_mean = system_df['latency_ms'].rolling(window=window, center=True).mean()
                plt.plot(system_df['sequence'], rolling_mean, 
                        label=f'{system} (avg)', color=colors[system], linewidth=2)
            else:
                plt.plot(system_df['sequence'], system_df['latency_ms'], 
                        label=system, color=colors[system], linewidth=2)
    
    plt.xlabel('Message Sequence')
    plt.ylabel('Latency (ms)')
    plt.title('Message Latency Comparison (with Rolling Average)')
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig('latency_line_graph.png', dpi=300, bbox_inches='tight')
    print("Saved line graph to latency_line_graph.png")
    
    # Print statistics
    print("\nLatency Statistics (in milliseconds):")
    print("-" * 70)
    print(f"{'System':<10} {'Count':<8} {'Mean':<8} {'Median':<8} {'Std':<8} {'Min':<8} {'Max':<8} {'95%':<8}")
    print("-" * 70)
    
    for system in ['SPS', 'MQTT', 'SPMQTT']:
        system_df = df[df['system'] == system]
        if len(system_df) > 0:
            print(f"{system:<10} {len(system_df):<8} "
                  f"{system_df['latency_ms'].mean():<8.2f} "
                  f"{system_df['latency_ms'].median():<8.2f} "
                  f"{system_df['latency_ms'].std():<8.2f} "
                  f"{system_df['latency_ms'].min():<8.2f} "
                  f"{system_df['latency_ms'].max():<8.2f} "
                  f"{system_df['latency_ms'].quantile(0.95):<8.2f}")
    
    # Save data to CSV
    df.to_csv('all_latencies.csv', index=False)
    print("\nSaved all latency data to all_latencies.csv")
    
    plt.show()

if __name__ == "__main__":
    main()