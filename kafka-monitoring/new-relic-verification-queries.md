# New Relic Kafka Monitoring Verification Queries

## Quick Verification Queries

Run these queries in New Relic Query Builder to verify data collection:

### 1. Check Broker Metrics
```sql
FROM KafkaBrokerSample 
SELECT count(*) 
WHERE clusterName = 'kafka-k8s-cluster' 
SINCE 10 minutes ago
```

### 2. List All Topics Being Monitored
```sql
FROM KafkaTopicSample 
SELECT uniqueCount(topic) as 'Total Topics', latest(topic) 
WHERE clusterName = 'kafka-k8s-cluster' 
FACET topic 
SINCE 10 minutes ago
```

### 3. Consumer Group Lag Overview
```sql
FROM KafkaConsumerSample 
SELECT sum(consumer.lag) as 'Total Lag', average(consumer.lag) as 'Avg Lag' 
WHERE clusterName = 'kafka-k8s-cluster' 
FACET consumerGroup 
SINCE 10 minutes ago
```

### 4. Message Throughput
```sql
FROM KafkaBrokerSample 
SELECT rate(sum(net.messagesInPerSecond), 1 minute) as 'Messages/min' 
WHERE clusterName = 'kafka-k8s-cluster' 
TIMESERIES 1 minute 
SINCE 30 minutes ago
```

### 5. Top Topics by Activity
```sql
FROM KafkaTopicSample 
SELECT sum(topic.messagesInPerSecond) as 'Messages/sec' 
WHERE clusterName = 'kafka-k8s-cluster' 
FACET topic 
LIMIT 20 
SINCE 5 minutes ago
```

### 6. JMX Metrics Health
```sql
FROM KafkaBrokerSample 
SELECT latest(consumer.totalJvmMemoryUsedBytes)/1024/1024 as 'JVM MB', 
       latest(request.handlerIdlePercent) as 'Handler Idle %',
       latest(net.underReplicatedPartitions) as 'Under-replicated' 
WHERE clusterName = 'kafka-k8s-cluster' 
SINCE 5 minutes ago
```

### 7. Consumer Performance
```sql
FROM KafkaConsumerSample 
SELECT average(consumer.messagesConsumedPerSecond) as 'Msg/sec',
       max(consumer.lag) as 'Max Lag',
       uniqueCount(memberId) as 'Members' 
WHERE clusterName = 'kafka-k8s-cluster' 
FACET consumerGroup 
SINCE 10 minutes ago
```

### 8. Share Group Metrics (when available)
```sql
FROM QueueSample 
SELECT count(*), 
       average(queue.size) as 'Avg Queue Size',
       max(oldest.message.age.seconds) as 'Max Age (sec)' 
WHERE provider = 'kafka' 
FACET share.group.name 
SINCE 10 minutes ago
```

## Dashboard Import Instructions

1. **Navigate to Dashboards**
   - Log into New Relic One
   - Click on "Dashboards" in the main navigation

2. **Import Dashboard**
   - Click "Import dashboard" button
   - Copy the contents of `new-relic-dashboard.json`
   - Paste into the import dialog
   - Update the `accountId` in each query to your New Relic account ID
   - Click "Import"

3. **Customize Dashboard**
   - Adjust time ranges as needed
   - Add alerts for critical metrics
   - Customize widget layouts

## Troubleshooting Missing Data

If metrics are missing:

1. **Check nri-kafka status**:
```bash
kubectl logs -l app=newrelic-infrastructure -n kafka-monitoring | grep -E "kafka|error|ERROR"
```

2. **Verify Kafka connectivity**:
```bash
kubectl exec -it daemonset/newrelic-infrastructure -n kafka-monitoring -- \
  /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
  -zookeeper_hosts '[{"host":"zookeeper.kafka-monitoring.svc.cluster.local","port":2181}]' \
  -pretty
```

3. **Check discovery**:
```bash
kubectl exec kafka-0 -n kafka-monitoring -- \
  kafka-broker-api-versions --bootstrap-server localhost:9092
```

## Key Metrics to Monitor

1. **Broker Health**
   - Under-replicated partitions (should be 0)
   - Offline partitions (should be 0)
   - Active controller count (should be 1)

2. **Performance**
   - Messages in/out per second
   - Request handler idle percentage (>70% is healthy)
   - Request latencies (produce, fetch, metadata)

3. **Consumer Health**
   - Consumer lag (monitor trends)
   - Message consumption rate
   - Consumer group membership changes

4. **Resource Usage**
   - JVM heap usage
   - Disk usage percentage
   - Network I/O rates

## Alert Recommendations

Create alerts for:
- Under-replicated partitions > 0
- Consumer lag > 10000 (adjust based on your SLA)
- Disk usage > 80%
- Request handler idle < 30%
- No data received for > 5 minutes