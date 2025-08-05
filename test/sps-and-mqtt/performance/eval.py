import json
import argparse
import sys
from collections import defaultdict
from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime

def parse_log_file(file_path):
    """
    Parse the log file and extract PUB and RECEIVE_PUB events.
    
    Returns:
        pub_events: dict mapping pubID to (time, clientID)
        receive_events: list of (time, clientID, pubID) tuples
    """
    pub_events = {}
    receive_events = []
    
    with open(file_path, 'r') as f:
        for line_num, line in enumerate(f, 1):
            try:
                event = json.loads(line.strip())
                
                # Check for required fields
                if 'event' not in event or 'time' not in event or 'id' not in event:
                    continue
                
                event_code = event['event']
                timestamp = event['time']
                client_id = event['id']
                
                # PUB event (code 9)
                if event_code == 9 and 'pub' in event and 'pubID' in event['pub']:
                    pub_id = event['pub']['pubID']
                    pub_events[pub_id] = (timestamp, client_id)
                
                # RECEIVE_PUB event (code 10)
                elif event_code == 10 and 'pub' in event and 'pubID' in event['pub']:
                    pub_id = event['pub']['pubID']
                    receive_events.append((timestamp, client_id, pub_id))
                    
            except json.JSONDecodeError as e:
                print(f"Warning: Failed to parse line {line_num}: {e}", file=sys.stderr)
            except Exception as e:
                print(f"Warning: Error processing line {line_num}: {e}", file=sys.stderr)
    
    return pub_events, receive_events

def calculate_latencies(pub_events, receive_events):
    """
    Calculate latencies between PUB and RECEIVE_PUB events.
    
    Returns:
        List of dictionaries containing latency information
    """
    latencies = []
    unmatched_receives = 0
    
    for receive_time, receive_client, pub_id in receive_events:
        if pub_id in pub_events:
            pub_time, pub_client = pub_events[pub_id]
            
            # Only calculate latency if receive happened after publish
            if receive_time >= pub_time:
                latency = receive_time - pub_time
                latencies.append({
                    'pubID': pub_id,
                    'pub_time': pub_time,
                    'receive_time': receive_time,
                    'latency_ms': latency,
                    'pub_client': pub_client,
                    'receive_client': receive_client
                })
            else:
                print(f"Warning: RECEIVE_PUB before PUB for pubID {pub_id}", file=sys.stderr)
        else:
            unmatched_receives += 1
    
    if unmatched_receives > 0:
        print(f"Warning: {unmatched_receives} RECEIVE_PUB events had no matching PUB event", file=sys.stderr)
    
    return latencies

def save_to_csv(latencies, output_path):
    """Save latency data to CSV file."""
    df = pd.DataFrame(latencies)
    df.to_csv(output_path, index=False)
    print(f"Saved {len(latencies)} latency measurements to {output_path}")

def plot_latencies(latencies, output_prefix):
    """Create various plots to visualize latency distribution."""
    if not latencies:
        print("No latencies to plot!")
        return
    
    df = pd.DataFrame(latencies)
    
    # Create a figure with subplots
    fig, axes = plt.subplots(2, 2, figsize=(15, 12))
    fig.suptitle('Publish/Subscribe Latency Analysis', fontsize=16)
    
    # 1. Histogram of latencies
    ax1 = axes[0, 0]
    ax1.hist(df['latency_ms'], bins=50, edgecolor='black', alpha=0.7)
    ax1.set_xlabel('Latency (ms)')
    ax1.set_ylabel('Frequency')
    ax1.set_title('Latency Distribution (Histogram)')
    ax1.grid(True, alpha=0.3)
    
    # 2. Time series of latencies
    ax2 = axes[0, 1]
    df_sorted = df.sort_values('receive_time')
    ax2.plot(df_sorted['receive_time'], df_sorted['latency_ms'], 'b-', alpha=0.6, linewidth=1)
    ax2.set_xlabel('Receive Time (ms)')
    ax2.set_ylabel('Latency (ms)')
    ax2.set_title('Latency Over Time')
    ax2.grid(True, alpha=0.3)
    
    # 3. Box plot of latencies
    ax3 = axes[1, 0]
    ax3.boxplot(df['latency_ms'], vert=True)
    ax3.set_ylabel('Latency (ms)')
    ax3.set_title('Latency Box Plot')
    ax3.grid(True, alpha=0.3)
    
    # 4. CDF of latencies
    ax4 = axes[1, 1]
    sorted_latencies = sorted(df['latency_ms'])
    y = [i/len(sorted_latencies) for i in range(len(sorted_latencies))]
    ax4.plot(sorted_latencies, y, 'g-', linewidth=2)
    ax4.set_xlabel('Latency (ms)')
    ax4.set_ylabel('Cumulative Probability')
    ax4.set_title('Cumulative Distribution Function')
    ax4.grid(True, alpha=0.3)
    
    # Add statistics text
    stats_text = f"""
    Statistics:
    Count: {len(df)}
    Mean: {df['latency_ms'].mean():.2f} ms
    Median: {df['latency_ms'].median():.2f} ms
    Std Dev: {df['latency_ms'].std():.2f} ms
    Min: {df['latency_ms'].min():.2f} ms
    Max: {df['latency_ms'].max():.2f} ms
    95th percentile: {df['latency_ms'].quantile(0.95):.2f} ms
    99th percentile: {df['latency_ms'].quantile(0.99):.2f} ms
    """
    
    fig.text(0.02, 0.02, stats_text, fontsize=10, verticalalignment='bottom',
             bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))
    
    plt.tight_layout()
    
    # Save the plot
    plot_path = f"{output_prefix}_latency_analysis.png"
    plt.savefig(plot_path, dpi=300, bbox_inches='tight')
    print(f"Saved plot to {plot_path}")
    
    # Also create a simple histogram for quick viewing
    plt.figure(figsize=(10, 6))
    plt.hist(df['latency_ms'], bins=50, edgecolor='black', alpha=0.7)
    plt.xlabel('Latency (ms)')
    plt.ylabel('Frequency')
    plt.title('Message Latency Distribution')
    plt.grid(True, alpha=0.3)
    
    # Add mean and median lines
    mean_latency = df['latency_ms'].mean()
    median_latency = df['latency_ms'].median()
    plt.axvline(mean_latency, color='red', linestyle='--', label=f'Mean: {mean_latency:.2f} ms')
    plt.axvline(median_latency, color='green', linestyle='--', label=f'Median: {median_latency:.2f} ms')
    plt.legend()
    
    simple_plot_path = f"{output_prefix}_latency_histogram.png"
    plt.savefig(simple_plot_path, dpi=300, bbox_inches='tight')
    print(f"Saved histogram to {simple_plot_path}")
    
    plt.show()

def main():
    parser = argparse.ArgumentParser(description='Analyze publish/subscribe latencies from event logs')
    parser.add_argument('logfile', help='Path to the log file')
    parser.add_argument('-o', '--output', help='Output prefix for CSV and plots (default: based on input filename)')
    parser.add_argument('--csv-only', action='store_true', help='Only output CSV, no plots')
    parser.add_argument('--plot-only', action='store_true', help='Only create plots, no CSV')
    
    args = parser.parse_args()
    
    # Determine output prefix
    if args.output:
        output_prefix = args.output
    else:
        # Use input filename without extension as prefix
        output_prefix = Path(args.logfile).stem
    
    # Check if file exists
    if not Path(args.logfile).exists():
        print(f"Error: File '{args.logfile}' not found!", file=sys.stderr)
        sys.exit(1)
    
    print(f"Processing log file: {args.logfile}")
    
    # Parse the log file
    pub_events, receive_events = parse_log_file(args.logfile)
    print(f"Found {len(pub_events)} PUB events and {len(receive_events)} RECEIVE_PUB events")
    
    # Calculate latencies
    latencies = calculate_latencies(pub_events, receive_events)
    print(f"Calculated {len(latencies)} latencies")
    
    if not latencies:
        print("No latencies could be calculated. Check if there are matching PUB/RECEIVE_PUB pairs.")
        sys.exit(1)
    
    # Output results
    if not args.plot_only:
        csv_path = f"{output_prefix}_latencies.csv"
        save_to_csv(latencies, csv_path)
    
    if not args.csv_only:
        plot_latencies(latencies, output_prefix)
    
    # Print summary statistics
    df = pd.DataFrame(latencies)
    print("\nSummary Statistics:")
    print(f"  Mean latency: {df['latency_ms'].mean():.2f} ms")
    print(f"  Median latency: {df['latency_ms'].median():.2f} ms")
    print(f"  Min latency: {df['latency_ms'].min():.2f} ms")
    print(f"  Max latency: {df['latency_ms'].max():.2f} ms")
    print(f"  95th percentile: {df['latency_ms'].quantile(0.95):.2f} ms")
    print(f"  99th percentile: {df['latency_ms'].quantile(0.99):.2f} ms")

if __name__ == "__main__":
    main()