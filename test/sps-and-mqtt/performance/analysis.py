#!/usr/bin/env python3
"""
Compare publish/subscribe latencies from SPS, MQTT, and SPMQTT event log files.
Dynamic version that discovers log files automatically.
"""

import json
import sys
from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
import os
from collections import defaultdict

class LatencyAnalyzer:
    def __init__(self):
        # Get the parent directory (sps-and-mqtt)
        self.base_dir = Path(__file__).parent.parent
        self.logs_dir = self.base_dir / 'logs'
        
        # Color scheme for different systems
        self.colors = {
            'SPS': '#1f77b4',
            'MQTT': '#ff7f0e', 
            'SPMQTT': '#2ca02c',
            'mqtt_events': '#ff7f0e',
            'sps_events': '#1f77b4',
            'spmqtt_events': '#2ca02c'
        }
        
    def find_log_files(self):
        """Dynamically find all event log files."""
        log_files = {}
        
        if not self.logs_dir.exists():
            print(f"❌ Logs directory not found: {self.logs_dir}")
            return log_files
            
        print(f"🔍 Scanning for log files in: {self.logs_dir}")
        
        # Look for different types of log directories
        for item in self.logs_dir.iterdir():
            if item.is_dir():
                system_name = item.name
                print(f"  📁 Checking directory: {system_name}")
                
                # Find event files in this directory
                event_files = self.find_event_files_in_dir(item)
                if event_files:
                    log_files[system_name] = event_files
                    print(f"    ✅ Found {len(event_files)} event files")
                else:
                    print(f"    ❌ No event files found")
        
        # Also check for SPS logs in alternative locations
        sps_locations = [
            self.base_dir / 'SPS' / 'logs_and_events',
            self.base_dir / 'logs_and_events',
            self.base_dir / 'SPS'
        ]
        
        for sps_dir in sps_locations:
            if sps_dir.exists():
                print(f"  📁 Checking SPS directory: {sps_dir}")
                sps_files = self.find_event_files_in_dir(sps_dir)
                if sps_files:
                    log_files['SPS'] = sps_files
                    print(f"    ✅ Found {len(sps_files)} SPS event files")
                    break
        
        return log_files
    
    def find_event_files_in_dir(self, directory):
        """Find event files in a specific directory."""
        event_files = []
        
        # Common event file patterns
        patterns = [
            '*client_events*.txt',
            '*Client_events*.txt', 
            '*Simulator_logs*.txt',
            '*events*.txt',
            '*mqtt_client_events_no_broker*.txt',
            '*spmqtt_client_events_no_broker*.txt'
        ]
        
        # Search in the directory and subdirectories
        for pattern in patterns:
            for file_path in directory.rglob(pattern):
                if file_path.is_file() and file_path.stat().st_size > 0:
                    event_files.append(file_path)
        
        # Remove duplicates
        event_files = list(set(event_files))
        
        return event_files
    
    def parse_log_file(self, file_path, system_name):
        """Parse log file and calculate latencies."""
        pub_events = {}
        latencies = []
        
        print(f"  📄 Processing: {file_path.name}")
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                line_count = 0
                valid_events = 0
                
                for line in f:
                    line_count += 1
                    try:
                        event = json.loads(line.strip())
                        valid_events += 1
                        
                        if event.get('event') == 9 and 'pub' in event and 'pubID' in event['pub']:
                            # PUB event
                            pub_id = event['pub']['pubID']
                            pub_events[pub_id] = {
                                'time': event['time'],
                                'client': event.get('id', 'unknown'),
                                'channel': event['pub'].get('channel', 'unknown')
                            }
                        
                        elif event.get('event') == 10 and 'pub' in event and 'pubID' in event['pub']:
                            # RECEIVE_PUB event
                            pub_id = event['pub']['pubID']
                            if pub_id in pub_events:
                                receive_time = event['time']
                                pub_time = pub_events[pub_id]['time']
                                if receive_time >= pub_time:
                                    latency = receive_time - pub_time
                                    latencies.append({
                                        'system': system_name,
                                        'file': file_path.name,
                                        'pub_client': pub_events[pub_id]['client'],
                                        'receive_client': event.get('id', 'unknown'),
                                        'channel': event['pub'].get('channel', pub_events[pub_id]['channel']),
                                        'pub_time': pub_time,
                                        'receive_time': receive_time,
                                        'latency_ms': latency,
                                        'sequence': len(latencies),
                                        'rtt': event.get('pingpong', {}).get('pong', {}).get('rtt')
                                    })
                    
                    except json.JSONDecodeError:
                        continue
                    except Exception as e:
                        continue
                
                print(f"    📊 Lines: {line_count}, Valid events: {valid_events}, Latencies: {len(latencies)}")
        
        except FileNotFoundError:
            print(f"    ❌ File not found: {file_path}")
            return []
        except Exception as e:
            print(f"    ❌ Error processing file: {e}")
            return []
        
        return latencies
    
    def create_visualizations(self, df):
        """Create comprehensive visualizations."""
        # Set up the plot style
        plt.style.use('default')  # Use default instead of seaborn for better compatibility
        
        # Create figure with multiple subplots
        fig = plt.figure(figsize=(16, 12))
        
        systems = df['system'].unique()
        
        # 1. Latency Line Graph (by sequence)
        ax1 = plt.subplot(2, 2, 1)
        for system in systems:
            system_df = df[df['system'] == system].sort_values('sequence')
            if len(system_df) > 0:
                color = self.colors.get(system, np.random.rand(3,))
                ax1.plot(system_df['sequence'], system_df['latency_ms'], 
                        label=system, color=color, alpha=0.7, linewidth=1)
        ax1.set_xlabel('Message Sequence')
        ax1.set_ylabel('Latency (ms)')
        ax1.set_title('Latency by Message Sequence')
        ax1.legend()
        ax1.grid(True, alpha=0.3)
        
        # 2. Latency over Time
        ax2 = plt.subplot(2, 2, 2)
        for system in systems:
            system_df = df[df['system'] == system].sort_values('receive_time')
            if len(system_df) > 0:
                # Normalize time to start from 0
                min_time = system_df['receive_time'].min()
                normalized_time = (system_df['receive_time'] - min_time) / 1000  # Convert to seconds
                color = self.colors.get(system, np.random.rand(3,))
                ax2.plot(normalized_time, system_df['latency_ms'], 
                        label=system, color=color, alpha=0.7, linewidth=1)
        ax2.set_xlabel('Time (seconds from start)')
        ax2.set_ylabel('Latency (ms)')
        ax2.set_title('Latency over Time')
        ax2.legend()
        ax2.grid(True, alpha=0.3)
        
        # 3. Histogram Comparison
        ax3 = plt.subplot(2, 2, 3)
        for system in systems:
            system_df = df[df['system'] == system]
            if len(system_df) > 0:
                color = self.colors.get(system, np.random.rand(3,))
                ax3.hist(system_df['latency_ms'], bins=30, alpha=0.6, 
                        label=system, color=color, edgecolor='black', linewidth=0.5)
        ax3.set_xlabel('Latency (ms)')
        ax3.set_ylabel('Frequency')
        ax3.set_title('Latency Distribution')
        ax3.legend()
        ax3.grid(True, alpha=0.3)
        
        # 4. Box Plot Comparison
        ax4 = plt.subplot(2, 2, 4)
        data_to_plot = []
        labels = []
        colors_list = []
        for system in systems:
            system_df = df[df['system'] == system]
            if len(system_df) > 0:
                data_to_plot.append(system_df['latency_ms'].values)
                labels.append(system)
                colors_list.append(self.colors.get(system, np.random.rand(3,)))
        
        if data_to_plot:
            bp = ax4.boxplot(data_to_plot, labels=labels, patch_artist=True)
            for patch, color in zip(bp['boxes'], colors_list):
                patch.set_facecolor(color)
                patch.set_alpha(0.7)
        ax4.set_ylabel('Latency (ms)')
        ax4.set_title('Latency Distribution Comparison')
        ax4.grid(True, alpha=0.3)
        
        plt.suptitle('System Latency Comparison', fontsize=16)
        plt.tight_layout()
        
        # Save plot
        output_path = Path(__file__).parent / 'latency_comparison.png'
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        print(f"💾 Saved plot to: {output_path}")
        
        # Create detailed line graph
        self.create_detailed_line_graph(df)
        
        return fig
    
    def create_detailed_line_graph(self, df):
        """Create a detailed latency line graph with smoothing."""
        plt.figure(figsize=(14, 8))
        
        systems = df['system'].unique()
        
        for system in systems:
            system_df = df[df['system'] == system].sort_values('sequence')
            if len(system_df) > 0:
                color = self.colors.get(system, np.random.rand(3,))
                
                # Plot raw data with low alpha
                plt.plot(system_df['sequence'], system_df['latency_ms'], 
                        color=color, alpha=0.3, linewidth=0.5)
                
                # Add rolling average for smoother line
                if len(system_df) > 20:
                    window = min(50, len(system_df) // 10)
                    rolling_mean = system_df['latency_ms'].rolling(window=window, center=True).mean()
                    plt.plot(system_df['sequence'], rolling_mean, 
                            label=f'{system} (avg)', color=color, linewidth=2)
                else:
                    plt.plot(system_df['sequence'], system_df['latency_ms'], 
                            label=system, color=color, linewidth=2)
        
        plt.xlabel('Message Sequence')
        plt.ylabel('Latency (ms)')
        plt.title('Message Latency Comparison (with Rolling Average)')
        plt.legend()
        plt.grid(True, alpha=0.3)
        plt.tight_layout()
        
        output_path = Path(__file__).parent / 'latency_line_graph.png'
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        print(f"💾 Saved line graph to: {output_path}")
    
    def print_statistics(self, df):
        """Print comprehensive statistics."""
        print("\n📊 Latency Statistics (in milliseconds):")
        print("-" * 90)
        print(f"{'System':<15} {'Files':<6} {'Count':<8} {'Mean':<8} {'Median':<8} {'Std':<8} {'Min':<8} {'Max':<8} {'95%':<8}")
        print("-" * 90)
        
        systems = df['system'].unique()
        for system in sorted(systems):
            system_df = df[df['system'] == system]
            if len(system_df) > 0:
                files_count = system_df['file'].nunique()
                print(f"{system:<15} {files_count:<6} {len(system_df):<8} "
                      f"{system_df['latency_ms'].mean():<8.2f} "
                      f"{system_df['latency_ms'].median():<8.2f} "
                      f"{system_df['latency_ms'].std():<8.2f} "
                      f"{system_df['latency_ms'].min():<8.2f} "
                      f"{system_df['latency_ms'].max():<8.2f} "
                      f"{system_df['latency_ms'].quantile(0.95):<8.2f}")
        
        # Channel-wise statistics if available
        if 'channel' in df.columns and df['channel'].nunique() > 1:
            print("\n📡 Per-Channel Statistics:")
            print("-" * 90)
            for channel in sorted(df['channel'].unique()):
                if channel != 'unknown':
                    channel_df = df[df['channel'] == channel]
                    print(f"\n  Channel: {channel}")
                    for system in sorted(systems):
                        system_channel_df = channel_df[channel_df['system'] == system]
                        if len(system_channel_df) > 0:
                            print(f"    {system:<12}: {len(system_channel_df):<8} messages, "
                                  f"mean: {system_channel_df['latency_ms'].mean():<8.2f}ms")
        
        # RTT statistics if available
        rtt_data = df[df['rtt'].notna()]
        if len(rtt_data) > 0:
            print(f"\n🏓 RTT Statistics ({len(rtt_data)} samples):")
            print("-" * 60)
            for system in sorted(systems):
                system_rtt = rtt_data[rtt_data['system'] == system]
                if len(system_rtt) > 0:
                    print(f"  {system:<15}: mean {system_rtt['rtt'].mean():.2f}ms, "
                          f"min {system_rtt['rtt'].min():.2f}ms, "
                          f"max {system_rtt['rtt'].max():.2f}ms")
    
    def run(self):
        """Main execution function."""
        print("🚀 Latency Analysis Tool")
        print("=" * 50)
        
        # Find all log files
        log_files = self.find_log_files()
        
        if not log_files:
            print("❌ No log files found!")
            return
        
        print(f"\n✅ Found log files for {len(log_files)} systems:")
        for system, files in log_files.items():
            print(f"  {system}: {len(files)} files")
        
        # Process all files
        all_data = []
        
        for system_name, files in log_files.items():
            print(f"\n🔄 Processing {system_name}...")
            for file_path in files:
                latencies = self.parse_log_file(file_path, system_name)
                all_data.extend(latencies)
        
        if not all_data:
            print("❌ No latency data found!")
            return
        
        # Convert to DataFrame
        df = pd.DataFrame(all_data)
        print(f"\n✅ Total latency measurements: {len(df)}")
        
        # Create visualizations
        self.create_visualizations(df)
        
        # Print statistics
        self.print_statistics(df)
        
        # Save data to CSV
        csv_path = Path(__file__).parent / 'all_latencies.csv'
        df.to_csv(csv_path, index=False)
        print(f"\n💾 Saved all latency data to: {csv_path}")
        
        # Show plots
        try:
            plt.show()
        except Exception as e:
            print(f"⚠️  Could not display plots (running headless?): {e}")

def main():
    analyzer = LatencyAnalyzer()
    analyzer.run()

if __name__ == "__main__":
    main()