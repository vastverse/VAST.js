# Performance Evaluation Variables

Based on your logistics pub/sub system, here are the key variables you can evaluate:

## 1. **Delivery Performance**

- **Delivery Rate**: `(messages_received / messages_expected) × 100%`
- **Message Latency**: `time_received - time_published` (per message)
- **Average Latency**: Mean of all message latencies
- **Max Latency**: Worst-case delivery time
- **Min Latency**: Best-case delivery time
- **Latency Variance/StdDev**: Consistency of delivery times

## 2. **Reliability Metrics**

- **Undelivered Messages**: Messages expected but never received
- **Duplicate Messages**: Same message received multiple times by same client
- **Missing Messages**: Publications with zero recipients when recipients expected
- **Orphaned Subscriptions**: Subscriptions with no matching publications
- **False Positives**: Messages delivered to clients outside AoI

## 3. **Network Efficiency**

- **Hops per Message**: Number of matcher relays per publication
- **Total Messages in Network**: Count of all delivery events
- **Messages per Publication**: Average recipients per pub
- **Redundant Deliveries**: Extra copies beyond what's needed
- **Channel Utilization**: % of subscribed channels that received publications

## 4. **Spatial/AoI Metrics**

- **AoI Coverage**: % of geographic area with active subscriptions
- **AoI Overlap Rate**: How many subscription AoIs overlap
- **Distance-based Delivery**: Group metrics by distance from publisher
- **Regional Imbalance**: Variance in message counts across regions (NW, NE, SW, SE)

## 5. **Temporal Metrics**

- **Message Arrival Timeline**: Sequence of arrivals (to detect ordering issues)
- **Burst Handling**: How system handles many messages in short time window
- **Sustained Rate**: Messages/second over time periods
- **Peak Traffic**: Maximum concurrent messages

## 6. **System Health**

- **Matcher Load**: Messages processed per matcher
- **Client Load**: Messages sent/received per client
- **Channel Popularity**: Which channels have most subscribers
- **Subscriber Churn**: Subscriptions created/deleted over time

## 7. **Routing & Gateway Metrics**

- **Gateway Traffic**: % of messages relayed through gateway
- **Direct Delivery Rate**: % delivered without gateway hop
- **Multi-hop Chains**: Distribution of chain lengths [2], [2,1], [2,1,3], etc.
- **Routing Efficiency**: Optimal vs actual hops

## 8. **Data Quality**

- **Malformed Events**: Parse errors, invalid JSON
- **Missing Fields**: Events missing required data
- **Type Mismatches**: Wrong data types (e.g., string instead of number)
- **Timestamp Validation**: Out-of-order events, negative latencies

## 9. **Role-Based Metrics** (for your logistics model)

```
Warehouses (WH*):
  - Inventory publication rate
  - Response time to requests
  - Message loss on inventory topics

Trucks (TR*):
  - Location update frequency
  - Delivery confirmation rate
  - Route update responsiveness

Customers (CS*):
  - Request fulfillment rate
  - Confirmation receipt rate
  - Information freshness
```

## 10. **Anomaly Detection**

- **Subscribers with 0 messages**: Should have received something
- **Publishers with 0 subscribers**: Messages published to empty set
- **Isolated clients**: Clients never receiving/sending
- **Timeout violations**: Messages taking abnormally long
- **Chain breaks**: Publications not forwarded correctly

---

## Recommended Priority Metrics

**Must-Have (Core Functionality):**
1. Delivery Rate
2. Message Latency (avg, min, max)
3. Undelivered Messages
4. Duplicate Messages

**Should-Have (Quality):**
5. Latency Variance
6. False Positives (wrong recipients)
7. Hops per Message
8. Channel Utilization

**Nice-to-Have (Insights):**
9. Regional imbalance
10. Role-based metrics
11. Matcher/Client load distribution
12. Temporal patterns

---

**Which of these would you like to prioritize in your evaluator?** Or would you like a specific framework to calculate them?