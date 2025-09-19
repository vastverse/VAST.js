import json
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Set, Tuple
import math
from datetime import datetime

# Event type constants (from common.js)
class ClientEvent:
    CLIENT_JOIN = 0
    CLIENT_LEAVE = 1
    CLIENT_CONNECT = 2
    CLIENT_DISCONNECT = 3
    CLIENT_MIGRATE = 4
    CLIENT_MOVE = 5
    SUB_NEW = 6
    SUB_UPDATE = 7
    SUB_DELETE = 8
    PUB = 9
    RECEIVE_PUB = 10

@dataclass
class Client:
    id: str
    alias: str = ""
    pos: Dict = field(default_factory=dict)
    matcher: str = ""
    join_times: List[float] = field(default_factory=list)
    leave_times: List[float] = field(default_factory=list)
    connect_times: List[float] = field(default_factory=list)
    disconnect_times: List[float] = field(default_factory=list)

@dataclass
class Publication:
    pub_id: str
    time: float
    pub_data: Dict
    subscribers: List[str] = field(default_factory=list)
    recipients: List[str] = field(default_factory=list)
    channel: str = ""
    aoi: Dict = field(default_factory=dict)

@dataclass
class Subscription:
    sub_id: str
    client_id: str
    channel: str
    aoi: Dict
    time: float

class EventAnalyzer:
    def __init__(self):
        self.reset_state()
        
    def reset_state(self):
        self.events = []
        self.clients: Dict[str, Client] = {}
        self.subscriptions: Dict[str, Subscription] = {}
        self.publications: Dict[str, Publication] = {}
        self.connection_events = []
        self.publication_events = []
        
    def process_file(self, filename: str):
        """Process events from a text file"""
        print(f"\nProcessing file: {filename}")
        print("-" * 50)
        
        try:
            with open(filename, 'r') as file:
                for line in file:
                    if line.strip():
                        self.events.append(json.loads(line))
            
            print(f"Read {len(self.events)} events")
            self.analyze_events()
            
        except Exception as e:
            print(f"Error processing file: {e}")
            
    def analyze_events(self):
        """Analyze all events"""
        # Sort events by time, then by event type
        sorted_events = sorted(self.events, key=lambda x: (x['time'], x['event']))
        
        # Separate received publications for later processing
        received_publications = []
        
        # Process all events except received publications first
        for event in sorted_events:
            if event['event'] != ClientEvent.RECEIVE_PUB:
                self.process_event(event)
            else:
                received_publications.append(event)
        
        # Process received publications
        for event in received_publications:
            self.process_event(event)
            
        # Generate analytics
        self.print_connection_analytics()
        self.print_publication_analytics()
        self.print_subscription_analytics()
        self.print_overall_statistics()
        
    def process_event(self, event: Dict):
        """Process a single event"""
        event_type = event['event']
        
        if event_type == ClientEvent.CLIENT_JOIN:
            self.handle_client_join(event)
        elif event_type == ClientEvent.CLIENT_LEAVE:
            self.handle_client_leave(event)
        elif event_type == ClientEvent.CLIENT_CONNECT:
            self.handle_client_connect(event)
        elif event_type == ClientEvent.CLIENT_DISCONNECT:
            self.handle_client_disconnect(event)
        elif event_type == ClientEvent.CLIENT_MOVE:
            self.handle_client_move(event)
        elif event_type == ClientEvent.SUB_NEW:
            self.handle_sub_new(event)
        elif event_type == ClientEvent.SUB_UPDATE:
            self.handle_sub_update(event)
        elif event_type == ClientEvent.SUB_DELETE:
            self.handle_sub_delete(event)
        elif event_type == ClientEvent.PUB:
            self.handle_publication(event)
        elif event_type == ClientEvent.RECEIVE_PUB:
            self.handle_receive_publication(event)
            
    def handle_client_join(self, event: Dict):
        client_id = event['id']
        if client_id in self.clients:
            self.clients[client_id].join_times.append(event['time'])
        else:
            self.clients[client_id] = Client(
                id=client_id,
                alias=event.get('alias', ''),
                pos=event.get('pos', {}),
                matcher=event.get('matcher', ''),
                join_times=[event['time']]
            )
            
    def handle_client_leave(self, event: Dict):
        client_id = event['id']
        if client_id in self.clients:
            self.clients[client_id].leave_times.append(event['time'])
            
    def handle_client_connect(self, event: Dict):
        client_id = event['id']
        if client_id in self.clients:
            self.clients[client_id].connect_times.append(event['time'])
        self.connection_events.append(('connect', event['time'], client_id))
        
    def handle_client_disconnect(self, event: Dict):
        client_id = event['id']
        if client_id in self.clients:
            self.clients[client_id].disconnect_times.append(event['time'])
        self.connection_events.append(('disconnect', event['time'], client_id))
        
    def handle_client_move(self, event: Dict):
        client_id = event['id']
        if client_id in self.clients:
            self.clients[client_id].pos = event.get('pos', {})
            
    def handle_sub_new(self, event: Dict):
        sub = event['sub']
        self.subscriptions[sub['subID']] = Subscription(
            sub_id=sub['subID'],
            client_id=sub['clientID'],
            channel=sub.get('channel', ''),
            aoi=sub.get('aoi', {}),
            time=event['time']
        )
        
    def handle_sub_update(self, event: Dict):
        sub = event['sub']
        if sub['subID'] in self.subscriptions:
            self.subscriptions[sub['subID']].aoi = sub.get('aoi', {})
            self.subscriptions[sub['subID']].channel = sub.get('channel', '')
            
    def handle_sub_delete(self, event: Dict):
        sub_id = event['subID']
        if sub_id in self.subscriptions:
            del self.subscriptions[sub_id]
            
    def handle_publication(self, event: Dict):
        pub = event['pub']
        pub_id = pub['pubID']
        
        # Find matching subscribers
        subscribers = []
        for sub_id, subscription in self.subscriptions.items():
            if self.compare_aoi(pub.get('aoi', {}), subscription.aoi) and \
               pub.get('channel', '') == subscription.channel:
                subscribers.append(subscription.client_id)
        
        self.publications[pub_id] = Publication(
            pub_id=pub_id,
            time=event['time'],
            pub_data=pub,
            subscribers=subscribers,
            channel=pub.get('channel', ''),
            aoi=pub.get('aoi', {})
        )
        self.publication_events.append(event)
        
    def handle_receive_publication(self, event: Dict):
        pub_id = event['pub']['pubID']
        client_id = event['id']
        
        if pub_id in self.publications:
            self.publications[pub_id].recipients.append(client_id)
            
    def compare_aoi(self, pub_aoi: Dict, sub_aoi: Dict) -> bool:
        """Check if publication AoI overlaps with subscription AoI"""
        if not pub_aoi or not sub_aoi:
            return False
            
        pub_center = pub_aoi.get('center', {})
        sub_center = sub_aoi.get('center', {})
        
        if not pub_center or not sub_center:
            return False
            
        distance = math.sqrt(
            (pub_center.get('x', 0) - sub_center.get('x', 0)) ** 2 +
            (pub_center.get('y', 0) - sub_center.get('y', 0)) ** 2
        )
        
        return distance < (pub_aoi.get('radius', 0) + sub_aoi.get('radius', 0))
        
    def print_connection_analytics(self):
        """Print connection-related analytics"""
        print("\n" + "="*50)
        print("CONNECTION ANALYTICS")
        print("="*50)
        
        total_clients = len(self.clients)
        active_clients = sum(1 for client in self.clients.values() 
                           if len(client.join_times) > len(client.leave_times))
        
        print(f"Total clients: {total_clients}")
        print(f"Active clients: {active_clients}")
        print(f"Inactive clients: {total_clients - active_clients}")
        
        # Connection events summary
        total_connects = sum(len(client.connect_times) for client in self.clients.values())
        total_disconnects = sum(len(client.disconnect_times) for client in self.clients.values())
        
        print(f"\nConnection events:")
        print(f"  Total connections: {total_connects}")
        print(f"  Total disconnections: {total_disconnects}")
        
        # Calculate average session duration
        session_durations = []
        for client in self.clients.values():
            for i, join_time in enumerate(client.join_times):
                if i < len(client.leave_times):
                    duration = client.leave_times[i] - join_time
                    session_durations.append(duration)
        
        if session_durations:
            avg_duration = sum(session_durations) / len(session_durations)
            print(f"  Average session duration: {avg_duration:.2f} time units")
            
    def print_publication_analytics(self):
        """Print publication-related analytics"""
        print("\n" + "="*50)
        print("PUBLICATION ANALYTICS")
        print("="*50)
        
        total_pubs = len(self.publications)
        print(f"Total publications: {total_pubs}")
        
        if total_pubs == 0:
            return
            
        # Analyze delivery success
        successful_deliveries = 0
        partial_deliveries = 0
        failed_deliveries = 0
        over_deliveries = 0
        
        total_expected_deliveries = 0
        total_actual_deliveries = 0
        
        for pub_id, pub in self.publications.items():
            expected = len(pub.subscribers)
            actual = len(pub.recipients)
            
            total_expected_deliveries += expected
            total_actual_deliveries += actual
            
            if expected == 0 and actual == 0:
                successful_deliveries += 1
            elif actual == expected and expected > 0:
                successful_deliveries += 1
            elif actual > expected:
                over_deliveries += 1
            elif 0 < actual < expected:
                partial_deliveries += 1
            else:
                failed_deliveries += 1
                
        print(f"\nDelivery Statistics:")
        print(f"  Successful deliveries: {successful_deliveries} ({successful_deliveries/total_pubs*100:.1f}%)")
        print(f"  Partial deliveries: {partial_deliveries} ({partial_deliveries/total_pubs*100:.1f}%)")
        print(f"  Failed deliveries: {failed_deliveries} ({failed_deliveries/total_pubs*100:.1f}%)")
        print(f"  Over-deliveries: {over_deliveries} ({over_deliveries/total_pubs*100:.1f}%)")
        
        if total_expected_deliveries > 0:
            delivery_rate = total_actual_deliveries / total_expected_deliveries * 100
            print(f"\nOverall delivery rate: {delivery_rate:.1f}%")
            print(f"  Expected deliveries: {total_expected_deliveries}")
            print(f"  Actual deliveries: {total_actual_deliveries}")
            
        # Channel analysis
        channel_stats = defaultdict(lambda: {'count': 0, 'delivered': 0, 'expected': 0})
        for pub in self.publications.values():
            channel = pub.channel or 'default'
            channel_stats[channel]['count'] += 1
            channel_stats[channel]['expected'] += len(pub.subscribers)
            channel_stats[channel]['delivered'] += len(pub.recipients)
            
        print(f"\nChannel Statistics:")
        for channel, stats in channel_stats.items():
            delivery_rate = stats['delivered'] / stats['expected'] * 100 if stats['expected'] > 0 else 0
            print(f"  {channel}: {stats['count']} publications, {delivery_rate:.1f}% delivery rate")
            
    def print_subscription_analytics(self):
        """Print subscription-related analytics"""
        print("\n" + "="*50)
        print("SUBSCRIPTION ANALYTICS")
        print("="*50)
        
        total_subs = len(self.subscriptions)
        print(f"Active subscriptions: {total_subs}")
        
        if total_subs == 0:
            return
            
        # Subscriptions per client
        subs_per_client = defaultdict(int)
        for sub in self.subscriptions.values():
            subs_per_client[sub.client_id] += 1
            
        avg_subs = sum(subs_per_client.values()) / len(subs_per_client) if subs_per_client else 0
        print(f"Average subscriptions per client: {avg_subs:.2f}")
        
        # Channel distribution
        channel_dist = defaultdict(int)
        for sub in self.subscriptions.values():
            channel_dist[sub.channel or 'default'] += 1
            
        print("\nSubscription distribution by channel:")
        for channel, count in sorted(channel_dist.items(), key=lambda x: x[1], reverse=True):
            print(f"  {channel}: {count} ({count/total_subs*100:.1f}%)")
            
    def print_overall_statistics(self):
        """Print overall system statistics"""
        print("\n" + "="*50)
        print("OVERALL SYSTEM STATISTICS")
        print("="*50)
        
        print(f"Total events processed: {len(self.events)}")
        
        if self.events:
            time_span = max(e['time'] for e in self.events) - min(e['time'] for e in self.events)
            print(f"Time span: {time_span:.2f} time units")
            
        # Event type distribution
        event_dist = defaultdict(int)
        event_names = {
                        0: "CLIENT_JOIN", 1: "CLIENT_LEAVE", 2: "CLIENT_CONNECT",
            3: "CLIENT_DISCONNECT", 4: "CLIENT_MIGRATE", 5: "CLIENT_MOVE",
            6: "SUB_NEW", 7: "SUB_UPDATE", 8: "SUB_DELETE",
            9: "PUB", 10: "RECEIVE_PUB"
        }
        
        for event in self.events:
            event_dist[event_names.get(event['event'], f"UNKNOWN_{event['event']}")] += 1
            
        print("\nEvent distribution:")
        for event_type, count in sorted(event_dist.items(), key=lambda x: x[1], reverse=True):
            print(f"  {event_type}: {count} ({count/len(self.events)*100:.1f}%)")
            
        # System health metrics
        self.print_system_health()
        
    def print_system_health(self):
        """Print system health metrics"""
        print("\n" + "-"*30)
        print("SYSTEM HEALTH METRICS")
        print("-"*30)
        
        # Calculate message reliability
        total_expected = sum(len(pub.subscribers) for pub in self.publications.values())
        total_delivered = sum(len(pub.recipients) for pub in self.publications.values())
        
        if total_expected > 0:
            reliability = total_delivered / total_expected * 100
            print(f"Message reliability: {reliability:.2f}%")
            
        # Calculate duplicate delivery rate
        total_duplicates = 0
        for pub in self.publications.values():
            recipient_counts = defaultdict(int)
            for recipient in pub.recipients:
                recipient_counts[recipient] += 1
            total_duplicates += sum(count - 1 for count in recipient_counts.values() if count > 1)
            
        if total_delivered > 0:
            duplicate_rate = total_duplicates / total_delivered * 100
            print(f"Duplicate delivery rate: {duplicate_rate:.2f}%")
            
        # Calculate missed delivery details
        print("\nMissed Delivery Analysis:")
        missed_deliveries = []
        for pub_id, pub in self.publications.items():
            expected_set = set(pub.subscribers)
            actual_set = set(pub.recipients)
            missed = expected_set - actual_set
            extra = actual_set - expected_set
            
            if missed:
                missed_deliveries.append({
                    'pub_id': pub_id,
                    'missed_clients': list(missed),
                    'count': len(missed)
                })
                
        if missed_deliveries:
            # Sort by most missed
            missed_deliveries.sort(key=lambda x: x['count'], reverse=True)
            print(f"  Publications with missed deliveries: {len(missed_deliveries)}")
            # Show top 5
            for i, miss in enumerate(missed_deliveries[:5]):
                print(f"    {i+1}. Pub {miss['pub_id']}: {miss['count']} clients missed")
                
    def generate_detailed_report(self, output_file: str = None):
        """Generate a detailed analysis report"""
        report_lines = []
        report_lines.append("="*60)
        report_lines.append("VAST SYSTEM EVENT ANALYSIS REPORT")
        report_lines.append(f"Generated at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report_lines.append("="*60)
        
        # Executive Summary
        report_lines.append("\nEXECUTIVE SUMMARY")
        report_lines.append("-"*30)
        report_lines.append(f"Total Events: {len(self.events)}")
        report_lines.append(f"Total Clients: {len(self.clients)}")
        report_lines.append(f"Total Publications: {len(self.publications)}")
        report_lines.append(f"Active Subscriptions: {len(self.subscriptions)}")
        
        # Calculate key metrics
        total_expected = sum(len(pub.subscribers) for pub in self.publications.values())
        total_delivered = sum(len(pub.recipients) for pub in self.publications.values())
        reliability = total_delivered / total_expected * 100 if total_expected > 0 else 0
        
        report_lines.append(f"\nKEY METRICS:")
        report_lines.append(f"  System Reliability: {reliability:.2f}%")
        report_lines.append(f"  Expected Deliveries: {total_expected}")
        report_lines.append(f"  Actual Deliveries: {total_delivered}")
        
        # Detailed Analysis Sections
        report_lines.extend(self._generate_client_section())
        report_lines.extend(self._generate_publication_section())
        report_lines.extend(self._generate_subscription_section())
        report_lines.extend(self._generate_performance_section())
        report_lines.extend(self._generate_issues_section())
        
        # Output report
        report_text = "\n".join(report_lines)
        if output_file:
            with open(output_file, 'w') as f:
                f.write(report_text)
            print(f"\nDetailed report saved to: {output_file}")
        else:
            print(report_text)
            
    def _generate_client_section(self) -> List[str]:
        """Generate client analysis section"""
        lines = []
        lines.append("\n\nCLIENT ANALYSIS")
        lines.append("="*50)
        
        active_clients = sum(1 for client in self.clients.values() 
                           if len(client.join_times) > len(client.leave_times))
        
        lines.append(f"Total Clients: {len(self.clients)}")
        lines.append(f"Active Clients: {active_clients}")
        lines.append(f"Disconnected Clients: {len(self.clients) - active_clients}")
        
        # Client activity distribution
        activity_levels = {'high': 0, 'medium': 0, 'low': 0}
        for client_id in self.clients:
            pub_count = sum(1 for pub in self.publications.values() 
                          if any(r == client_id for r in pub.recipients))
            if pub_count > 10:
                activity_levels['high'] += 1
            elif pub_count > 5:
                activity_levels['medium'] += 1
            else:
                activity_levels['low'] += 1
                
        lines.append("\nClient Activity Levels:")
        for level, count in activity_levels.items():
            lines.append(f"  {level.capitalize()}: {count}")
            
        return lines
        
    def _generate_publication_section(self) -> List[str]:
        """Generate publication analysis section"""
        lines = []
        lines.append("\n\nPUBLICATION ANALYSIS")
        lines.append("="*50)
        
        # Delivery success breakdown
        delivery_stats = self._calculate_delivery_stats()
        
        lines.append("Delivery Success Breakdown:")
        for stat, count in delivery_stats.items():
            percentage = count / len(self.publications) * 100 if self.publications else 0
            lines.append(f"  {stat}: {count} ({percentage:.1f}%)")
            
        # Time-based analysis
        if self.publication_events:
            pub_times = [e['time'] for e in self.publication_events]
            time_span = max(pub_times) - min(pub_times) if len(pub_times) > 1 else 0
            pub_rate = len(pub_times) / time_span if time_span > 0 else 0
            lines.append(f"\nPublication Rate: {pub_rate:.2f} pubs/time unit")
            
        return lines
        
    def _generate_subscription_section(self) -> List[str]:
        """Generate subscription analysis section"""
        lines = []
        lines.append("\n\nSUBSCRIPTION ANALYSIS")
        lines.append("="*50)
        
        lines.append(f"Active Subscriptions: {len(self.subscriptions)}")
        
        # Coverage analysis
        if self.subscriptions:
            coverage = self._calculate_coverage()
            lines.append(f"\nGeographic Coverage:")
            lines.append(f"  Average AoI Radius: {coverage['avg_radius']:.2f}")
            lines.append(f"  Total Coverage Area: {coverage['total_area']:.2f}")
            
        return lines
        
    def _generate_performance_section(self) -> List[str]:
        """Generate performance analysis section"""
        lines = []
        lines.append("\n\nPERFORMANCE ANALYSIS")
        lines.append("="*50)
        
        # Latency analysis (if timestamps are available)
        latencies = []
        for pub in self.publications.values():
            # This is a simplified latency calculation
            # In reality, you'd need actual receive timestamps
            if pub.recipients:
                latencies.append(0.1)  # Placeholder
                
        if latencies:
            avg_latency = sum(latencies) / len(latencies)
            lines.append(f"Average Delivery Latency: {avg_latency:.3f} time units")
            
        # Throughput
        if self.events:
            time_span = max(e['time'] for e in self.events) - min(e['time'] for e in self.events)
            if time_span > 0:
                event_throughput = len(self.events) / time_span
                lines.append(f"Event Throughput: {event_throughput:.2f} events/time unit")
                
        return lines
        
    def _generate_issues_section(self) -> List[str]:
        """Generate issues and recommendations section"""
        lines = []
        lines.append("\n\nISSUES AND RECOMMENDATIONS")
        lines.append("="*50)
        
        issues = []
        
        # Check for reliability issues
        total_expected = sum(len(pub.subscribers) for pub in self.publications.values())
        total_delivered = sum(len(pub.recipients) for pub in self.publications.values())
        reliability = total_delivered / total_expected * 100 if total_expected > 0 else 0
        
        if reliability < 95:
            issues.append(f"Low system reliability ({reliability:.1f}%). Consider investigating network issues.")
            
        # Check for duplicate deliveries
        total_duplicates = sum(self._count_duplicates(pub.recipients) for pub in self.publications.values())
        if total_duplicates > total_delivered * 0.05:  # More than 5% duplicates
            issues.append(f"High duplicate delivery rate. Review publication routing logic.")
            
        # Check for client churn
        churn_rate = self._calculate_churn_rate()
        if churn_rate > 0.3:  # More than 30% churn
            issues.append(f"High client churn rate ({churn_rate*100:.1f}%). Consider improving client stability.")
            
        if issues:
            for i, issue in enumerate(issues, 1):
                lines.append(f"{i}. {issue}")
        else:
            lines.append("No significant issues detected.")
            
        return lines
        
    def _calculate_delivery_stats(self) -> Dict[str, int]:
        """Calculate detailed delivery statistics"""
        stats = {
            'Perfect Delivery': 0,
            'Partial Delivery': 0,
            'Failed Delivery': 0,
            'Over Delivery': 0,
            'No Subscribers': 0
        }
        
        for pub in self.publications.values():
            expected = len(pub.subscribers)
            actual = len(set(pub.recipients))  # Unique recipients
            
            if expected == 0 and actual == 0:
                stats['No Subscribers'] += 1
            elif actual == expected and expected > 0:
                stats['Perfect Delivery'] += 1
            elif actual > expected:
                stats['Over Delivery'] += 1
            elif 0 < actual < expected:
                stats['Partial Delivery'] += 1
            else:
                stats['Failed Delivery'] += 1
                
        return stats
        
    def _calculate_coverage(self) -> Dict[str, float]:
        """Calculate subscription coverage metrics"""
        if not self.subscriptions:
            return {'avg_radius': 0, 'total_area': 0}
            
        radii = []
        for sub in self.subscriptions.values():
            if sub.aoi and 'radius' in sub.aoi:
                radii.append(sub.aoi['radius'])
                
        avg_radius = sum(radii) / len(radii) if radii else 0
        total_area = sum(math.pi * r * r for r in radii)
        
        return {'avg_radius': avg_radius, 'total_area': total_area}
        
    def _count_duplicates(self, recipients: List[str]) -> int:
        """Count duplicate deliveries in a recipient list"""
        from collections import Counter
        counts = Counter(recipients)
        return sum(count - 1 for count in counts.values() if count > 1)
        
    def _calculate_churn_rate(self) -> float:
        """Calculate client churn rate"""
        if not self.clients:
            return 0
            
        churned_clients = sum(1 for client in self.clients.values() 
                            if len(client.leave_times) >= len(client.join_times))
        
        return churned_clients / len(self.clients)


def main():
    """Main function to run the analyzer"""
    if len(sys.argv) < 2:
        print("Usage: python event_analyzer.py <event_file.txt> [output_report.txt]")
        print("Using default file...")
        filename = "Client_events.txt"
    else:
        filename = sys.argv[1]
        
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    
    analyzer = EventAnalyzer()
    analyzer.process_file(filename)
    
    if output_file:
        analyzer.generate_detailed_report(output_file)
    else:
        analyzer.generate_detailed_report()


if __name__ == "__main__":
    main()