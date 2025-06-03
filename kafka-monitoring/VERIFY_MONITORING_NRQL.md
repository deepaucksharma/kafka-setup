# NRQL Queries to Verify Kafka Monitoring Mechanisms

## 🔍 Mechanism 1: nri-kafka (Traditional Kafka Metrics)

### 1.1 Verify nri-kafka is reporting
```sql
-- Check if nri-kafka integration is running
FROM SystemSample 
SELECT uniqueCount(entityName) 
WHERE entityName LIKE '%kafka%' 
FACET nr.integrationName 
SINCE 30 minutes ago
```

### 1.2 Check KafkaBrokerSample events
```sql
-- Broker-level metrics from nri-kafka
FROM KafkaBrokerSample 
SELECT count(*), latest(broker.bytesInPerSecond), latest(broker.bytesOutPerSecond) 
WHERE clusterName = 'kafka-k8s-cluster' 
FACET entityName 
SINCE 10 minutes ago
```

### 1.3 Check KafkaTopicSample events
```sql
-- Topic-level metrics from nri-kafka
FROM KafkaTopicSample 
SELECT count(*), uniqueCount(topic), latest(topic.partitions) 
WHERE clusterName = 'kafka-k8s-cluster' 
FACET topic 
SINCE 10 minutes ago
```

### 1.4 Check KafkaConsumerSample events
```sql
-- Consumer group metrics (traditional offset lag)
FROM KafkaConsumerSample 
SELECT count(*), latest(consumer.lag), latest(consumer.offset) 
WHERE clusterName = 'kafka-k8s-cluster' 
FACET consumerGroup, topic 
SINCE 10 minutes ago
```

### 1.5 Verify all nri-kafka event types
```sql
-- Summary of all Kafka event types
FROM KafkaBrokerSample, KafkaTopicSample, KafkaConsumerSample, KafkaOffsetSample, KafkaPartitionSample 
SELECT count(*) 
FACET eventType 
SINCE 30 minutes ago
```

## 🔍 Mechanism 2: Custom OHI (Share Group QueueSample Events)

### 2.1 Verify OHI is sending QueueSample events
```sql
-- Check if QueueSample events are being created
FROM QueueSample 
SELECT count(*), uniqueCount(entityName) 
WHERE provider = 'kafka' 
FACET entityName 
SINCE 30 minutes ago
```

### 2.2 Share Group specific metrics
```sql
-- Share Group metrics from Custom OHI
FROM QueueSample 
SELECT 
  latest(queue.size) as 'Unacked Messages',
  latest(oldest.message.age.seconds) as 'Oldest Unacked (sec)',
  latest(messages.acknowledged) as 'Acknowledged',
  latest(messages.released) as 'Released',
  latest(messages.rejected) as 'Rejected'
WHERE provider = 'kafka' 
FACET share.group.name, queue.name 
SINCE 30 minutes ago
```

### 2.3 Per-partition view
```sql
-- Partition-level Share Group metrics
FROM QueueSample 
SELECT latest(queue.size), latest(partition.id) 
WHERE provider = 'kafka' AND partition.id IS NOT NULL 
FACET queue.name, partition.id 
SINCE 30 minutes ago
```

### 2.4 Topic-level aggregates
```sql
-- Topic aggregates (no partition in queue.name)
FROM QueueSample 
SELECT 
  latest(queue.size) as 'Total Unacked',
  latest(partition.count) as 'Partitions',
  rate(sum(messages.acknowledged), 1 minute) as 'ACK Rate/min'
WHERE provider = 'kafka' AND partition.id IS NULL 
FACET topic.name 
SINCE 30 minutes ago
```

## 🔍 Bonus: nri-flex Prometheus Metrics (if configured)

### 3.1 Check Prometheus metrics via nri-flex
```sql
-- Share Group metrics scraped by nri-flex
FROM Metric 
SELECT count(*), uniqueCount(metricName) 
WHERE metricName LIKE 'kafka_sharegroup%' 
FACET metricName 
SINCE 30 minutes ago
```

### 3.2 Detailed Share Group metrics
```sql
-- All Share Group Prometheus metrics
FROM Metric 
SELECT 
  latest(kafka_sharegroup_records_unacked) as 'Unacked',
  latest(kafka_sharegroup_oldest_unacked_ms) as 'Oldest MS',
  latest(kafka_sharegroup_records_acknowledged) as 'Acked'
WHERE cluster = 'kafka-k8s-cluster' 
FACET group, topic, partition 
SINCE 30 minutes ago
```

## 📊 Combined Verification Query

### All-in-one verification
```sql
-- Verify both mechanisms are reporting
SELECT 
  filter(count(*), WHERE eventType = 'KafkaBrokerSample') as 'nri-kafka Broker Events',
  filter(count(*), WHERE eventType = 'KafkaTopicSample') as 'nri-kafka Topic Events',
  filter(count(*), WHERE eventType = 'QueueSample' AND provider = 'kafka') as 'OHI Queue Events',
  filter(uniqueCount(metricName), WHERE metricName LIKE 'kafka%') as 'Kafka Metrics Count'
FROM KafkaBrokerSample, KafkaTopicSample, QueueSample, Metric 
SINCE 30 minutes ago
```

## 🚨 Troubleshooting Queries

### Check integration errors
```sql
-- Look for integration errors
FROM IntegrationError 
SELECT count(*), latest(message) 
WHERE message LIKE '%kafka%' OR entityName LIKE '%kafka%' 
FACET entityName, message 
SINCE 1 hour ago
```

### Check if infrastructure agent is reporting
```sql
-- Verify New Relic Infrastructure agent
FROM SystemSample 
SELECT count(*), latest(timestamp) 
WHERE hostname LIKE '%kafka-monitoring%' 
FACET hostname 
SINCE 10 minutes ago
```

### Debug missing data
```sql
-- Check for any Kafka-related data
SELECT count(*) 
FROM Log, Metric, KafkaBrokerSample, KafkaTopicSample, QueueSample 
WHERE 
  message LIKE '%kafka%' OR 
  metricName LIKE '%kafka%' OR 
  provider = 'kafka' OR 
  clusterName = 'kafka-k8s-cluster'
FACET eventType 
SINCE 1 hour ago
```

## 🎯 Expected Results

When both mechanisms are working correctly, you should see:

1. **nri-kafka**: 
   - KafkaBrokerSample events (broker metrics)
   - KafkaTopicSample events (topic metrics)
   - KafkaConsumerSample events (consumer lag)

2. **Custom OHI**:
   - QueueSample events with provider='kafka'
   - Share Group attributes (share.group.name)
   - Queue metrics (queue.size, oldest.message.age.seconds)

3. **Optional nri-flex**:
   - Metric events with kafka_sharegroup_* names
   - Prometheus-scraped metrics

## 💡 Quick Health Check

Run this single query to verify both mechanisms:

```sql
FROM KafkaBrokerSample, QueueSample 
SELECT 
  filter(count(*), WHERE eventType = 'KafkaBrokerSample') as 'nri-kafka Working',
  filter(count(*), WHERE eventType = 'QueueSample' AND provider = 'kafka') as 'Custom OHI Working'
SINCE 5 minutes ago
```

If both values are > 0, both monitoring mechanisms are successfully sending data!