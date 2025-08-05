#!/usr/bin/env python3
"""
Analyze and compare publish/subscribe systems: count messages and calculate latencies.
Compares SPS, MQTT, and SPMQTT systems.
"""

import json
import sys
from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

# File paths for the three systems
FILES = {
    'SPS': '/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/SPS/logs_and_events/Client_events.txt',
    'MQTT': '/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/logs/mqtt_events/mqtt_client_events_no_broker.txt',
    'SPMQTT': '/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/logs/spmqtt_events/spmqtt_client_events_no_broker.txt'
}

def analyze_log_file(file_path, system_name):
    """Parse log file and count events plus calculate latencies."""
    pub_events = {}
    pub_count = 0
    receive_count = 0
    latencies = []
    
    # Track unique publishers and receivers
    publishers = set()
    receivers = set()
    
    try:
        with open(file_path, 'r') as f:
            for line in f:
                try:
                    event = json.loads(line.strip())
                    
                    if event.get('event') == 9:  # PUB event
                        pub_count += 1
                        publishers.add(event.get('id', 'unknown'))
                        
                        if 'pub' in event and 'pubID' in event['pub']:
                            pub_id = event['pub']['pubID']
                            pub_events[pub_id] = event['time']
                    
                    elif event.get('event') == 10:  # RECEIVE_PUB event
                        receive_count += 1
                        receivers.add(event.get('id', 'unknown'))
                        
                        if 'pub' in event and 'pubID' in event['pub']:
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
        return {
            'system': system_name,
            'pub_count': 0,
            'receive_count': 0,
            'unique_publishers': 0,
            'unique_receivers': 0,
            'latencies': []
        }
    
    return {
        'system': system_name,
        'pub_count': pub_count,
        'receive_count': receive_count,
        'unique_publishers': len(publishers),
        'unique_receivers': len(receivers),
        'latencies': latencies
    }

def create_summary_table(results):
    """Create and display summary statistics."""
    summary_data = []
    
    for result in results:
        system = result['system']
        latencies = result['latencies']
        
        if latencies:
            latency_df = pd.DataFrame(latencies)
            latency_stats = {
                'mean': latency_df['latency_ms'].mean(),
                'median': latency_df['latency_ms'].median(),
                'min': latency_df['latency_ms'].min(),
                'max': latency_df['latency_ms'].max(),
                'std': latency_df['latency_ms'].std()
            }
        else:
            latency_stats = {
                'mean': 0,
                'median': 0,
                'min': 0,
                'max': 0,
                'std': 0
            }
        
        # Calculate delivery rate
        delivery_rate = (result['receive_count'] / result['pub_count'] * 100) if result['pub_count'] > 0 else 0
        
        summary_data.append({
            'System': system,
            'Published': result['pub_count'],
            'Received': result['receive_count'],
            'Delivery Rate (%)': f"{delivery_rate:.2f}",
            'Unique Publishers': result['unique_publishers'],
            'Unique Receivers': result['unique_receivers'],
            'Latency Mean (ms)': f"{latency_stats['mean']:.2f}",
            'Latency Median (ms)': f"{latency_stats['median']:.2f}",
            'Latency Min (ms)': f"{latency_stats['min']:.2f}",
            'Latency Max (ms)': f"{latency_stats['max']:.2f}"
        })
    
    return pd.DataFrame(summary_data)

def plot_message_counts(results):
    """Create bar charts comparing message counts."""
    systems = [r['system'] for r in results]
    pub_counts = [r['pub_count'] for r in results]
    receive_counts = [r['receive_count'] for r in results]
    
    # Set up the plot
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))
    
    # Plot 1: Published vs Received messages
    x = np.arange(len(systems))
    width = 0.35
    
    bars1 = ax1.bar(x - width/2, pub_counts, width, label='Published', color='skyblue', edgecolor='black')
    bars2 = ax1.bar(x + width/2, receive_counts, width, label='Received', color='lightgreen', edgecolor='black')
    
    ax1.set_xlabel('System')
    ax1.set_ylabel('Number of Messages')
    ax1.set_title('Published vs Received Messages by System')
    ax1.set_xticks(x)
    ax1.set_xticklabels(systems)
    ax1.legend()
    ax1.grid(True, axis='y', alpha=0.3)
    
    # Add value labels on bars
    for bars in [bars1, bars2]:
        for bar in bars:
            height = bar.get_height()
            ax1.annotate(f'{int(height)}',
                        xy=(bar.get_x() + bar.get_width() / 2, height),
                        xytext=(0, 3),
                        textcoords="offset points",
                        ha='center', va='bottom')
    
    # Plot 2: Delivery Rate
    delivery_rates = [(r['receive_count'] / r['pub_count'] * 100) if r['pub_count'] > 0 else 0 
                      for r in results]
    colors = ['#1f77b4', '#ff7f0e', '#2ca02c']
    bars3 = ax2.bar(systems, delivery_rates, color=colors, edgecolor='black')
    
    ax2.set_xlabel('System')
    ax2.set_ylabel('Delivery Rate (%)')
    ax2.set_title('Message Delivery Rate by System')
    ax2.set_ylim(0, 105)
    ax2.grid(True, axis='y', alpha=0.3)
    
    # Add percentage labels
    for bar, rate in zip(bars3, delivery_rates):
        ax2.annotate(f'{rate:.1f}%',
                    xy=(bar.get_x() + bar.get_width() / 2, bar.get_height()),
                    xytext=(0, 3),
                    textcoords="offset points",
                    ha='center', va='bottom')
    
    plt.tight_layout()
    plt.savefig('message_count_comparison.png', dpi=300, bbox_inches='tight')
    print("Saved message count comparison to message_count_comparison.png")

def plot_latency_comparison(all_latencies):
    """Create latency comparison plots."""
    if not all_latencies:
        print("No latency data to plot")
        return
    
    df = pd.DataFrame(all_latencies)
    
    # Set up the plot style
    plt.style.use('seaborn-v0_8-darkgrid')
    colors = {'SPS': '#1f77b4', 'MQTT': '#ff7f0e', 'SPMQTT': '#2ca02c'}
    
    # Create figure with multiple subplots
    fig = plt.figure(figsize=(16, 10))
    
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
    
    # 2. Latency Distribution Histogram
    ax2 = plt.subplot(2, 2, 2)
    for system in ['SPS', 'MQTT', 'SPMQTT']:
        system_df = df[df['system'] == system]
        if len(system_df) > 0:
            ax2.hist(system_df['latency_ms'], bins=30, alpha=0.6, 
                    label=system, color=colors[system], edgecolor='black', linewidth=0.5)
    ax2.set_xlabel('Latency (ms)')
    ax2.set_ylabel('Frequency')
    ax2.set_title('Latency Distribution')
    ax2.legend()
    ax2.grid(True, alpha=0.3)
    
    # 3. Box Plot Comparison
    ax3 = plt.subplot(2, 2, 3)
    data_to_plot = []
    labels = []
    for system in ['SPS', 'MQTT', 'SPMQTT']:
        system_df = df[df['system'] == system]
        if len(system_df) > 0:
            data_to_plot.append(system_df['latency_ms'].values)
            labels.append(system)
    
    if data_to_plot:
        bp = ax3.boxplot(data_to_plot, labels=labels, patch_artist=True)
        for patch, label in zip(bp['boxes'], labels):
            patch.set_facecolor(colors[label])
            patch.set_alpha(0.7)
    ax3.set_ylabel('Latency (ms)')
    ax3.set_title('Latency Distribution Comparison')
    ax3.grid(True, alpha=0.3)
    
    # 4. CDF Comparison
    ax4 = plt.subplot(2, 2, 4)
    for system in ['SPS', 'MQTT', 'SPMQTT']:
        system_df = df[df['system'] == system]
        if len(system_df) > 0:
            sorted_latencies = sorted(system_df['latency_ms'])
            y = np.arange(1, len(sorted_latencies) + 1) / len(sorted_latencies)
            ax4.plot(sorted_latencies, y, label=system, color=colors[system], linewidth=2)
    ax4.set_xlabel('Latency (ms)')
    ax4.set_ylabel('Cumulative Probability')
    ax4.set_title('Cumulative Distribution Function')
    ax4.legend()
    ax4.grid(True, alpha=0.3)
    
    plt.suptitle('Latency Analysis Comparison', fontsize=16)
    plt.tight_layout()
    plt.savefig('latency_analysis.png', dpi=300, bbox_inches='tight')
    print("Saved latency analysis to latency_analysis.png")

def main():
    print("Analyzing publish/subscribe systems...")
    print("=" * 70)
    
    # Analyze each system
    results = []
    all_latencies = []
    
    for system, file_path in FILES.items():
        print(f"\nProcessing {system}...")
        result = analyze_log_file(file_path, system)
        results.append(result)
        all_latencies.extend(result['latencies'])
        
        print(f"  Published messages: {result['pub_count']}")
        print(f"  Received messages: {result['receive_count']}")
        print(f"  Unique publishers: {result['unique_publishers']}")
        print(f"  Unique receivers: {result['unique_receivers']}")
        print(f"  Latency measurements: {len(result['latencies'])}")
    
    # Create and display summary table
    print("\n" + "=" * 70)
    print("SUMMARY TABLE")
    print("=" * 70)
    summary_df = create_summary_table(results)
    print(summary_df.to_string(index=False))
    
    # Save summary to CSV
    summary_df.to_csv('system_comparison_summary.csv', index=False)
    print("\nSaved summary table to system_comparison_summary.csv")
    
    # Create visualizations
    print("\nGenerating visualizations...")
    plot_message_counts(results)
    plot_latency_comparison(all_latencies)
    
    # Save detailed latency data
    if all_latencies:
        latency_df = pd.DataFrame(all_latencies)
        latency_df.to_csv('all_latencies_detailed.csv', index=False)
        print("Saved detailed latency data to all_latencies_detailed.csv")
    
    plt.show()

if __name__ == "__main__":
    main()