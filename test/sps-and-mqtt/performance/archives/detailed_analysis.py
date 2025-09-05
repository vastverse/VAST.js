#!/usr/bin/env python3
"""
Analyze publish/subscribe systems with accurate delivery tracking and AOI support.
Tracks expected vs actual recipients for each publication with proper AOI overlap checking.
"""

import json
import sys
import math
from pathlib import Path
from collections import defaultdict
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

# File paths for the three systems
FILES = {
    'SPS': '/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/SPS/logs_and_events/Client_events.txt',
    'MQTT': '/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/logs/mqtt_events/mqtt_client_events_no_broker.txt',
    'SPMQTT': '/Users/vo/Documents/vast_dev/vast_js_experiments/VAST.js/test/sps-and-mqtt/logs/spmqtt_events/spmqtt_client_events_no_broker.txt'
}

# Event codes
EVENT_CODES = {
    'SUB': 7,
    'UNSUB': 8,
    'PUB': 9,
    'RECEIVE_PUB': 10
}

class PubSubAnalyzer:
    def __init__(self, system_name, debug_mode=False):
        self.system_name = system_name
        self.debug_mode = debug_mode
        # Track subscriptions: client_id -> list of subscription dicts
        self.subscriptions = defaultdict(list)
        # Track publications: pubID -> {pub_time, publisher, channel, aoi, expected_recipients}
        self.publications = {}
        # Track actual deliveries: pubID -> list of (recipient, receive_time)
        self.actual_deliveries = defaultdict(list)
        # Statistics
        self.stats = {
            'total_pubs': 0,
            'total_expected_deliveries': 0,
            'correct_deliveries': 0,
            'undelivered': 0,
            'extra_deliveries': 0,
            'duplicate_deliveries': 0
        }
        # Latencies for correct deliveries
        self.latencies = []
        
    def circles_overlap(self, aoi1, aoi2):
        """Check if two circular AOIs overlap."""
        if not aoi1 or not aoi2:
            # If either AOI is None/empty, we can't determine overlap
            return False
            
        # Extract center coordinates and radius
        try:
            center1 = aoi1.get('center', {})
            center2 = aoi2.get('center', {})
            
            x1 = center1.get('x', 0)
            y1 = center1.get('y', 0)
            r1 = aoi1.get('radius', 0)
            
            x2 = center2.get('x', 0)
            y2 = center2.get('y', 0)
            r2 = aoi2.get('radius', 0)
            
            # Calculate distance between centers
            dx = x1 - x2
            dy = y1 - y2
            distance = math.sqrt(dx * dx + dy * dy)
            
            # Circles overlap if distance < sum of radii
            return distance < (r1 + r2)
            
        except (TypeError, ValueError) as e:
            if self.debug_mode:
                print(f"Warning: Invalid AOI format: {e}")
            return False
    
    def validate_aoi(self, aoi):
        """Validate AOI structure."""
        if not aoi:
            return True  # None/empty AOI is valid
        
        if not isinstance(aoi, dict):
            return False
        
        if 'center' not in aoi or 'radius' not in aoi:
            return False
        
        center = aoi.get('center')
        if not isinstance(center, dict) or 'x' not in center or 'y' not in center:
            return False
        
        try:
            float(center['x'])
            float(center['y'])
            float(aoi['radius'])
            return True
        except (TypeError, ValueError):
            return False
    
    def mqtt_topic_matches(self, pub_topic, sub_topic):
        """Check if MQTT publication topic matches subscription pattern."""
        # Handle multi-level wildcard '#'
        if sub_topic == '#':
            return True
        
        if sub_topic.endswith('/#'):
            # Check if pub_topic starts with the prefix before /#
            prefix = sub_topic[:-2]
            return pub_topic.startswith(prefix + '/') or pub_topic == prefix
        
        # Handle single-level wildcard '+'
        pub_parts = pub_topic.split('/')
        sub_parts = sub_topic.split('/')
        
        if len(pub_parts) != len(sub_parts):
            return False
        
        for pub_part, sub_part in zip(pub_parts, sub_parts):
            if sub_part != '+' and pub_part != sub_part:
                return False
        
        return True
    
    def matches_subscription(self, pub_channel, pub_aoi, sub_channel, sub_aoi):
        """Check if a publication matches a subscription based on channel and AOI."""
        # First check channel matching
        if self.system_name == 'MQTT':
            # MQTT topic matching with wildcards
            if not self.mqtt_topic_matches(pub_channel, sub_channel):
                return False
        else:
            # Exact channel match for SPS/SPMQTT
            if pub_channel != sub_channel:
                return False
        
        # Now check AOI matching (for SPS/SPMQTT)
        if self.system_name in ['SPS', 'SPMQTT']:
            # If both have AOIs, they must overlap
            if pub_aoi is not None and sub_aoi is not None:
                return self.circles_overlap(pub_aoi, sub_aoi)
            
            # If subscription has AOI but publication doesn't, no match
            elif sub_aoi is not None and pub_aoi is None:
                return False
            
            # If publication has AOI but subscription doesn't, 
            # subscription without AOI receives all messages on the channel
            elif pub_aoi is not None and sub_aoi is None:
                return True
            
            # Neither has AOI - match based on channel alone
            else:
                return True
        
        # For MQTT (no AOI support), channel match is sufficient
        return True
    
    def update_subscriptions(self, event):
        """Update subscription state based on SUB/UNSUB events."""
        client_id = event.get('id')
        event_time = event.get('time', 0)
        
        if event.get('event') == EVENT_CODES['SUB']:
            # Handle subscription
            sub_info = event.get('sub', {})
            channel = sub_info.get('channel') or sub_info.get('topic')
            aoi = sub_info.get('aoi')
            
            # Validate AOI if present
            if aoi and not self.validate_aoi(aoi):
                if self.debug_mode:
                    print(f"Warning: Invalid AOI in subscription from {client_id}: {aoi}")
                aoi = None
            
            if client_id and channel:
                # Store subscription with full details
                sub_entry = {
                    'channel': channel,
                    'aoi': aoi,
                    'time': event_time
                }
                
                # Remove any existing subscription to same channel
                self.subscriptions[client_id] = [
                    s for s in self.subscriptions[client_id] 
                    if s['channel'] != channel
                ]
                
                # Add new subscription
                self.subscriptions[client_id].append(sub_entry)
                
        elif event.get('event') == EVENT_CODES['UNSUB']:
            # Handle unsubscription
            unsub_info = event.get('unsub', {})
            channel = unsub_info.get('channel') or unsub_info.get('topic')
            
            if client_id and channel:
                # Remove matching subscription
                self.subscriptions[client_id] = [
                    s for s in self.subscriptions[client_id] 
                    if s['channel'] != channel
                ]
    
    def get_expected_recipients(self, pub_event):
        """Determine expected recipients for a publication based on current subscriptions."""
        pub_info = pub_event.get('pub', {})
        pub_channel = pub_info.get('channel') or pub_info.get('topic')
        pub_aoi = pub_info.get('aoi')
        publisher_id = pub_event.get('id')
        
        # Validate publication AOI
        if pub_aoi and not self.validate_aoi(pub_aoi):
            if self.debug_mode:
                print(f"Warning: Invalid AOI in publication from {publisher_id}: {pub_aoi}")
            pub_aoi = None
        
        expected = set()
        
        # Debug logging
        if self.debug_mode:
            print(f"\nPublication: channel={pub_channel}, aoi={pub_aoi}")
            print(f"Publisher: {publisher_id}")
        
        # Check all current subscriptions
        for subscriber_id, subs in self.subscriptions.items():
            # Don't deliver to self (publisher)
            if subscriber_id == publisher_id:
                continue
            
            # Check each subscription for this subscriber
            for sub in subs:
                sub_channel = sub['channel']
                sub_aoi = sub['aoi']
                
                if self.matches_subscription(pub_channel, pub_aoi, sub_channel, sub_aoi):
                    expected.add(subscriber_id)
                    
                    if self.debug_mode:
                        print(f"  Matched subscriber {subscriber_id}: channel={sub_channel}, aoi={sub_aoi}")
                    
                    break  # Only need to match once per subscriber
        
        return expected
    
    def analyze_file(self, file_path):
        """Parse log file and analyze delivery patterns."""
        try:
            with open(file_path, 'r') as f:
                # First pass: build subscription state and identify publications
                events = []
                for line in f:
                    try:
                        event = json.loads(line.strip())
                        events.append(event)
                    except json.JSONDecodeError:
                        continue
                
                # Sort events by time to ensure proper ordering
                events.sort(key=lambda x: x.get('time', 0))
                
                # Process events in chronological order
                for event in events:
                    event_code = event.get('event')
                    
                    # Update subscription state
                    if event_code in [EVENT_CODES['SUB'], EVENT_CODES['UNSUB']]:
                        self.update_subscriptions(event)
                    
                    # Handle publications
                    elif event_code == EVENT_CODES['PUB']:
                        pub_info = event.get('pub', {})
                        pub_id = pub_info.get('pubID')
                        
                        if pub_id:
                            # Get expected recipients based on current subscription state
                            expected_recipients = self.get_expected_recipients(event)
                            
                            self.publications[pub_id] = {
                                'pub_time': event.get('time'),
                                'publisher': event.get('id'),
                                'channel': pub_info.get('channel') or pub_info.get('topic'),
                                'aoi': pub_info.get('aoi'),
                                'expected_recipients': expected_recipients
                            }
                            
                            self.stats['total_pubs'] += 1
                            self.stats['total_expected_deliveries'] += len(expected_recipients)
                    
                    # Handle receives
                    elif event_code == EVENT_CODES['RECEIVE_PUB']:
                        pub_info = event.get('pub', {})
                        pub_id = pub_info.get('pubID')
                        recipient_id = event.get('id')
                        receive_time = event.get('time')
                        
                        if pub_id and recipient_id:
                            self.actual_deliveries[pub_id].append((recipient_id, receive_time))
        
        except FileNotFoundError:
            print(f"Warning: File not found: {file_path}")
            return
        
        # Analyze delivery success
        self.analyze_deliveries()
    
    def analyze_deliveries(self):
        """Compare expected vs actual deliveries for each publication."""
        for pub_id, pub_info in self.publications.items():
            expected = pub_info['expected_recipients']
            actual_list = self.actual_deliveries.get(pub_id, [])
            
            # Count deliveries per recipient
            actual_count = defaultdict(int)
            for recipient, receive_time in actual_list:
                actual_count[recipient] += 1
                
                # Calculate latency for correct deliveries
                if recipient in expected and actual_count[recipient] == 1:
                    latency = receive_time - pub_info['pub_time']
                    if latency >= 0:
                        self.latencies.append({
                            'system': self.system_name,
                            'latency_ms': latency,
                            'pub_id': pub_id
                        })
            
            # Analyze delivery patterns
            for recipient in expected:
                count = actual_count.get(recipient, 0)
                if count == 1:
                    self.stats['correct_deliveries'] += 1
                elif count == 0:
                    self.stats['undelivered'] += 1
                else:  # count > 1
                    self.stats['correct_deliveries'] += 1  # First delivery was correct
                    self.stats['duplicate_deliveries'] += (count - 1)
            
            # Check for extra deliveries (to unexpected recipients)
            for recipient, count in actual_count.items():
                if recipient not in expected:
                    self.stats['extra_deliveries'] += count
    
    def get_summary(self):
        """Generate summary statistics."""
        success_rate = 0
        if self.stats['total_expected_deliveries'] > 0:
            success_rate = (self.stats['correct_deliveries'] / 
                           self.stats['total_expected_deliveries']) * 100
        
        return {
            'system': self.system_name,
            'total_pubs': self.stats['total_pubs'],
            'expected_deliveries': self.stats['total_expected_deliveries'],
            'correct_deliveries': self.stats['correct_deliveries'],
            'undelivered': self.stats['undelivered'],
            'extra_deliveries': self.stats['extra_deliveries'],
            'duplicate_deliveries': self.stats['duplicate_deliveries'],
            'success_rate': success_rate,
            'latency_count': len(self.latencies)
        }
    
    def print_subscription_state(self):
        """Print current subscription state for debugging."""
        print(f"\nCurrent Subscription State for {self.system_name}:")
        for client_id, subs in self.subscriptions.items():
            print(f"  Client {client_id}:")
            for sub in subs:
                print(f"    Channel: {sub['channel']}, AOI: {sub['aoi']}")

def create_delivery_analysis_plots(summaries, all_latencies):
    """Create visualization of delivery analysis."""
    fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(16, 12))
    
    systems = [s['system'] for s in summaries]
    colors = {'SPS': '#1f77b4', 'MQTT': '#ff7f0e', 'SPMQTT': '#2ca02c'}
    
    # 1. Delivery Success Rate
    success_rates = [s['success_rate'] for s in summaries]
    bars1 = ax1.bar(systems, success_rates, color=[colors[s] for s in systems], edgecolor='black')
    ax1.set_ylabel('Success Rate (%)')
    ax1.set_title('Delivery Success Rate by System')
    ax1.set_ylim(0, 105)
    ax1.grid(True, axis='y', alpha=0.3)
    
    # Add percentage labels
    for bar, rate in zip(bars1, success_rates):
        ax1.annotate(f'{rate:.1f}%',
                    xy=(bar.get_x() + bar.get_width() / 2, bar.get_height()),
                    xytext=(0, 3),
                    textcoords="offset points",
                    ha='center', va='bottom')
    
    # 2. Delivery Breakdown
    categories = ['Correct', 'Undelivered', 'Extra', 'Duplicate']
    x = np.arange(len(systems))
    width = 0.2
    
    for i, category in enumerate(categories):
        if category == 'Correct':
            values = [s['correct_deliveries'] for s in summaries]
            color = 'green'
        elif category == 'Undelivered':
            values = [s['undelivered'] for s in summaries]
            color = 'red'
        elif category == 'Extra':
            values = [s['extra_deliveries'] for s in summaries]
            color = 'orange'
        else:  # Duplicate
            values = [s['duplicate_deliveries'] for s in summaries]
            color = 'purple'
        
        ax2.bar(x + i*width - 1.5*width, values, width, label=category, color=color, alpha=0.7)
    
    ax2.set_xlabel('System')
    ax2.set_ylabel('Number of Deliveries')
    ax2.set_title('Delivery Breakdown by Category')
    ax2.set_xticks(x)
    ax2.set_xticklabels(systems)
    ax2.legend()
    ax2.grid(True, axis='y', alpha=0.3)
    
    # 3. Expected vs Actual Deliveries
    expected = [s['expected_deliveries'] for s in summaries]
    actual = [s['correct_deliveries'] + s['extra_deliveries'] + s['duplicate_deliveries'] for s in summaries]
    
    x = np.arange(len(systems))
    width = 0.35
    
    bars3 = ax3.bar(x - width/2, expected, width, label='Expected', color='lightblue', edgecolor='black')
    bars4 = ax3.bar(x + width/2, actual, width, label='Actual', color='lightgreen', edgecolor='black')
    
    ax3.set_xlabel('System')
    ax3.set_ylabel('Number of Deliveries')
    ax3.set_title('Expected vs Actual Deliveries')
    ax3.set_xticks(x)
    ax3.set_xticklabels(systems)
    ax3.legend()
    ax3.grid(True, axis='y', alpha=0.3)
    
    # Add value labels
    for bars in [bars3, bars4]:
        for bar in bars:
            height = bar.get_height()
            ax3.annotate(f'{int(height)}',
                        xy=(bar.get_x() + bar.get_width() / 2, height),
                        xytext=(0, 3),
                        textcoords="offset points",
                        ha='center', va='bottom', fontsize=8)
    
    # 4. Latency Distribution for Correct Deliveries
    if all_latencies:
        latency_df = pd.DataFrame(all_latencies)
        for system in systems:
            system_df = latency_df[latency_df['system'] == system]
            if len(system_df) > 0:
                ax4.hist(system_df['latency_ms'], bins=30, alpha=0.6, 
                        label=f'{system} (n={len(system_df)})', 
                        color=colors[system], edgecolor='black', linewidth=0.5)
        
        ax4.set_xlabel('Latency (ms)')
        ax4.set_ylabel('Frequency')
        ax4.set_title('Latency Distribution for Correct Deliveries')
        ax4.legend()
        ax4.grid(True, alpha=0.3)
    
    plt.suptitle('Delivery Analysis Comparison', fontsize=16)
    plt.tight_layout()
    plt.savefig('delivery_analysis.png', dpi=300, bbox_inches='tight')
    print("Saved delivery analysis to delivery_analysis.png")

def create_detailed_report(summaries, all_latencies):
    """Create a detailed HTML report of the analysis."""
    html_content = """
    <html>
    <head>
        <title>Publish/Subscribe Delivery Analysis Report</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            h1 { color: #333; }
            h2 { color: #666; margin-top: 30px; }
            table { border-collapse: collapse; width: 100%; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .success { color: green; font-weight: bold; }
            .warning { color: orange; font-weight: bold; }
            .error { color: red; font-weight: bold; }
            .metric { margin: 10px 0; }
            .system-section { margin-bottom: 40px; border: 1px solid #ddd; padding: 20px; border-radius: 5px; }
        </style>
    </head>
    <body>
        <h1>Publish/Subscribe Systems Delivery Analysis Report</h1>
        <p>Generated on: """ + str(pd.Timestamp.now()) + """</p>
    """
    
    # Summary section
    html_content += "<h2>Executive Summary</h2>"
    html_content += "<table>"
    html_content += "<tr><th>System</th><th>Success Rate</th><th>Publications</th><th>Expected Deliveries</th><th>Correct Deliveries</th></tr>"
    
    for s in summaries:
        success_class = 'success' if s['success_rate'] >= 95 else 'warning' if s['success_rate'] >= 90 else 'error'
        html_content += f"""
        <tr>
            <td>{s['system']}</td>
            <td class="{success_class}">{s['success_rate']:.2f}%</td>
            <td>{s['total_pubs']}</td>
            <td>{s['expected_deliveries']}</td>
            <td>{s['correct_deliveries']}</td>
        </tr>
        """
    html_content += "</table>"
    
    # Detailed analysis per system
    html_content += "<h2>Detailed Analysis by System</h2>"
    
    for s in summaries:
        html_content += f"""
        <div class="system-section">
            <h3>{s['system']}</h3>
            <div class="metric"><strong>Total Publications:</strong> {s['total_pubs']}</div>
            <div class="metric"><strong>Expected Deliveries:</strong> {s['expected_deliveries']}</div>
            <div class="metric"><strong>Correct Deliveries:</strong> {s['correct_deliveries']} 
                ({s['success_rate']:.2f}%)</div>
            <div class="metric"><strong>Failed Deliveries:</strong> {s['undelivered']} 
                ({(s['undelivered']/s['expected_deliveries']*100 if s['expected_deliveries'] > 0 else 0):.2f}%)</div>
            <div class="metric"><strong>Extra Deliveries:</strong> {s['extra_deliveries']}</div>
            <div class="metric"><strong>Duplicate Deliveries:</strong> {s['duplicate_deliveries']}</div>
        """
        
        # Add latency statistics if available
        if all_latencies:
            latency_df = pd.DataFrame(all_latencies)
            system_latencies = latency_df[latency_df['system'] == s['system']]
            if len(system_latencies) > 0:
                html_content += f"""
                <h4>Latency Statistics (for correct deliveries)</h4>
                <div class="metric"><strong>Mean Latency:</strong> {system_latencies['latency_ms'].mean():.2f} ms</div>
                <div class="metric"><strong>Median Latency:</strong> {system_latencies['latency_ms'].median():.2f} ms</div>
                <div class="metric"><strong>95th Percentile:</strong> {system_latencies['latency_ms'].quantile(0.95):.2f} ms</div>
                <div class="metric"><strong>99th Percentile:</strong> {system_latencies['latency_ms'].quantile(0.99):.2f} ms</div>
                """
        
        html_content += "</div>"
    
    # Recommendations
    html_content += """
    <h2>Recommendations</h2>
    <ul>
    """
    
    best_system = max(summaries, key=lambda x: x['success_rate'])
    html_content += f"<li><strong>Highest Success Rate:</strong> {best_system['system']} ({best_system['success_rate']:.2f}%)</li>"
    
    for s in summaries:
        if s['undelivered'] > 0:
            html_content += f"<li>{s['system']} has {s['undelivered']} undelivered messages - investigate subscription matching logic</li>"
        if s['extra_deliveries'] > 0:
            html_content += f"<li>{s['system']} has {s['extra_deliveries']} extra deliveries - check subscription filtering</li>"
        if s['duplicate_deliveries'] > 0:
            html_content += f"<li>{s['system']} has {s['duplicate_deliveries']} duplicate deliveries - review deduplication mechanism</li>"
    
    html_content += """
    </ul>
    </body>
    </html>
    """
    
    # Save HTML report
    with open('delivery_analysis_report.html', 'w') as f:
        f.write(html_content)
    print("\nSaved detailed report to delivery_analysis_report.html")

def test_aoi_overlap():
    """Test AOI overlap function."""
    analyzer = PubSubAnalyzer('SPS')
    
    # Test cases
    aoi1 = {"center": {"x": 0, "y": 0}, "radius": 10}
    aoi2 = {"center": {"x": 15, "y": 0}, "radius": 10}
    aoi3 = {"center": {"x": 25, "y": 0}, "radius": 10}
    
    # Should overlap (distance=15, sum of radii=20)
    assert analyzer.circles_overlap(aoi1, aoi2) == True
    
    # Should not overlap (distance=25, sum of radii=20)
    assert analyzer.circles_overlap(aoi1, aoi3) == False
    
    # Edge case: touching circles (distance=20, sum of radii=20)
    aoi4 = {"center": {"x": 20, "y": 0}, "radius": 10}
    assert analyzer.circles_overlap(aoi1, aoi4) == False
    
    # Test with negative coordinates
    aoi5 = {"center": {"x": -10, "y": -10}, "radius": 15}
    assert analyzer.circles_overlap(aoi1, aoi5) == True
    
    print("AOI overlap tests passed!")

def main():
    print("Analyzing publish/subscribe systems with accurate delivery tracking and AOI support...")
    print("=" * 70)
    
    # Run tests first
    print("\nRunning AOI overlap tests...")
    test_aoi_overlap()
    
    summaries = []
    all_latencies = []
    
    # Add debug flag from command line
    debug_mode = '--debug' in sys.argv
    
    for system, file_path in FILES.items():
        print(f"\nProcessing {system}...")
        analyzer = PubSubAnalyzer(system, debug_mode=debug_mode)
        analyzer.analyze_file(file_path)
        
        summary = analyzer.get_summary()
        summaries.append(summary)
        all_latencies.extend(analyzer.latencies)
        
        print(f"  Total publications: {summary['total_pubs']}")
        print(f"  Expected deliveries: {summary['expected_deliveries']}")
        print(f"  Correct deliveries: {summary['correct_deliveries']}")
        print(f"  Undelivered: {summary['undelivered']}")
        print(f"  Extra deliveries: {summary['extra_deliveries']}")
        print(f"  Duplicate deliveries: {summary['duplicate_deliveries']}")
        print(f"  Success rate: {summary['success_rate']:.2f}%")
        
        if debug_mode:
            analyzer.print_subscription_state()
    
    # Create summary table
    print("\n" + "=" * 100)
    print("DELIVERY ANALYSIS SUMMARY")
    print("=" * 100)
    
    summary_df = pd.DataFrame(summaries)
    # Reorder columns for better readability
    column_order = ['system', 'total_pubs', 'expected_deliveries', 'correct_deliveries', 
                    'undelivered', 'extra_deliveries', 'duplicate_deliveries', 'success_rate']
    summary_df = summary_df[column_order]
    
    # Format for display
    display_df = summary_df.copy()
    display_df['success_rate'] = display_df['success_rate'].apply(lambda x: f"{x:.2f}%")
    print(display_df.to_string(index=False))
    
    # Save summary to CSV
    summary_df.to_csv('delivery_analysis_summary.csv', index=False)
    print("\nSaved summary to delivery_analysis_summary.csv")
    
    # Calculate additional metrics
    print("\n" + "=" * 100)
    print("ADDITIONAL METRICS")
    print("=" * 100)
    
    for summary in summaries:
        system = summary['system']
        total_actual = (summary['correct_deliveries'] + 
                       summary['extra_deliveries'] + 
                       summary['duplicate_deliveries'])
        
        reliability = 0
        if summary['expected_deliveries'] > 0:
            reliability = (summary['correct_deliveries'] / summary['expected_deliveries']) * 100
        
        precision = 0
        if total_actual > 0:
            precision = (summary['correct_deliveries'] / total_actual) * 100
        
        print(f"\n{system}:")
        print(f"  Reliability (correct/expected): {reliability:.2f}%")
        print(f"  Precision (correct/total actual): {precision:.2f}%")
        print(f"  Average deliveries per publication: {summary['expected_deliveries']/summary['total_pubs']:.2f}" if summary['total_pubs'] > 0 else "  No publications")
    
    # Create visualizations
    print("\nGenerating visualizations...")
    create_delivery_analysis_plots(summaries, all_latencies)
    
    # Analyze latency statistics for correct deliveries
    if all_latencies:
        print("\n" + "=" * 100)
        print("LATENCY STATISTICS FOR CORRECT DELIVERIES")
        print("=" * 100)
        
        latency_df = pd.DataFrame(all_latencies)
        
        print(f"\n{'System':<10} {'Count':<8} {'Mean (ms)':<12} {'Median (ms)':<12} {'95% (ms)':<10} {'99% (ms)':<10}")
        print("-" * 70)
        
        for system in ['SPS', 'MQTT', 'SPMQTT']:
            system_df = latency_df[latency_df['system'] == system]
            if len(system_df) > 0:
                print(f"{system:<10} {len(system_df):<8} "
                      f"{system_df['latency_ms'].mean():<12.2f} "
                      f"{system_df['latency_ms'].median():<12.2f} "
                      f"{system_df['latency_ms'].quantile(0.95):<10.2f} "
                      f"{system_df['latency_ms'].quantile(0.99):<10.2f}")
        
        # Save latency data
        latency_df.to_csv('correct_delivery_latencies.csv', index=False)
        print("\nSaved latency data to correct_delivery_latencies.csv")
        
        # Create latency comparison plots
        create_latency_comparison_plots(latency_df)
    
    # Create detailed delivery report
    create_detailed_report(summaries, all_latencies)
    
    # Print AOI analysis if SPS or SPMQTT
    print_aoi_analysis(summaries)
    
    plt.show()

def create_latency_comparison_plots(latency_df):
    """Create additional latency comparison visualizations."""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))
    
    colors = {'SPS': '#1f77b4', 'MQTT': '#ff7f0e', 'SPMQTT': '#2ca02c'}
    
    # 1. CDF of latencies
    ax1.set_title('Cumulative Distribution Function of Latencies')
    for system in ['SPS', 'MQTT', 'SPMQTT']:
        system_df = latency_df[latency_df['system'] == system]
        if len(system_df) > 0:
            sorted_latencies = sorted(system_df['latency_ms'])
            y = np.arange(1, len(sorted_latencies) + 1) / len(sorted_latencies)
            ax1.plot(sorted_latencies, y, label=system, color=colors[system], linewidth=2)
    
    ax1.set_xlabel('Latency (ms)')
    ax1.set_ylabel('Cumulative Probability')
    ax1.legend()
    ax1.grid(True, alpha=0.3)
    
    # 2. Percentile comparison
    ax2.set_title('Latency Percentile Comparison')
    percentiles = [50, 75, 90, 95, 99]
    x = np.arange(len(percentiles))
    width = 0.25
    
    for i, system in enumerate(['SPS', 'MQTT', 'SPMQTT']):
        system_df = latency_df[latency_df['system'] == system]
        if len(system_df) > 0:
            values = [system_df['latency_ms'].quantile(p/100) for p in percentiles]
            ax2.bar(x + i*width - width, values, width, label=system, color=colors[system])
    
    ax2.set_xlabel('Percentile')
    ax2.set_ylabel('Latency (ms)')
    ax2.set_xticks(x)
    ax2.set_xticklabels([f'{p}th' for p in percentiles])
    ax2.legend()
    ax2.grid(True, alpha=0.3, axis='y')
    
    plt.tight_layout()
    plt.savefig('latency_percentile_comparison.png', dpi=300, bbox_inches='tight')
    print("Saved latency percentile comparison to latency_percentile_comparison.png")

def print_aoi_analysis(summaries):
    """Analyze AOI-specific delivery patterns for SPS and SPMQTT."""
    print("\n" + "=" * 100)
    print("AOI-SPECIFIC ANALYSIS (SPS and SPMQTT)")
    print("=" * 100)
    
    for summary in summaries:
        if summary['system'] in ['SPS', 'SPMQTT']:
            print(f"\n{summary['system']}:")
            print("  Note: AOI matching is active for this system")
            print("  Publications with AOI constraints will only be delivered to")
            print("  subscribers whose AOI overlaps with the publication AOI")
            
            # Calculate AOI impact
            if summary['expected_deliveries'] > 0:
                non_delivery_rate = (summary['undelivered'] / summary['expected_deliveries']) * 100
                if non_delivery_rate > 5:
                    print(f"  WARNING: {non_delivery_rate:.1f}% non-delivery rate may indicate AOI mismatches")

def create_aoi_test_visualization():
    """Create a visualization showing AOI overlap examples."""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))
    
    # Example 1: Overlapping AOIs
    ax1.set_title('Overlapping AOIs (Message Delivered)')
    ax1.set_xlim(-30, 30)
    ax1.set_ylim(-30, 30)
    ax1.set_aspect('equal')
    
    # Publisher AOI
    pub_circle = plt.Circle((0, 0), 10, color='blue', alpha=0.3, label='Publisher AOI')
    ax1.add_patch(pub_circle)
    
    # Subscriber AOI (overlapping)
    sub_circle = plt.Circle((15, 0), 10, color='green', alpha=0.3, label='Subscriber AOI')
    ax1.add_patch(sub_circle)
    
    ax1.plot(0, 0, 'bo', markersize=8, label='Publisher')
    ax1.plot(15, 0, 'go', markersize=8, label='Subscriber')
    ax1.legend()
    ax1.grid(True, alpha=0.3)
    
    # Example 2: Non-overlapping AOIs
    ax2.set_title('Non-overlapping AOIs (Message NOT Delivered)')
    ax2.set_xlim(-30, 50)
    ax2.set_ylim(-30, 30)
    ax2.set_aspect('equal')
    
    # Publisher AOI
    pub_circle2 = plt.Circle((0, 0), 10, color='blue', alpha=0.3, label='Publisher AOI')
    ax2.add_patch(pub_circle2)
    
    # Subscriber AOI (not overlapping)
    sub_circle2 = plt.Circle((30, 0), 10, color='red', alpha=0.3, label='Subscriber AOI')
    ax2.add_patch(sub_circle2)
    
    ax2.plot(0, 0, 'bo', markersize=8, label='Publisher')
    ax2.plot(30, 0, 'ro', markersize=8, label='Subscriber')
    ax2.legend()
    ax2.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig('aoi_overlap_examples.png', dpi=300, bbox_inches='tight')
    print("\nSaved AOI overlap examples to aoi_overlap_examples.png")

if __name__ == "__main__":
    # Add command line argument parsing
    import argparse
    parser = argparse.ArgumentParser(description='Analyze publish/subscribe system logs with AOI support')
    parser.add_argument('--debug', action='store_true', help='Enable debug output')
    parser.add_argument('--test-aoi', action='store_true', help='Create AOI test visualization')
    args = parser.parse_args()
    
    if args.test_aoi:
        create_aoi_test_visualization()
        plt.show()
    else:
        # Run main analysis
        main()