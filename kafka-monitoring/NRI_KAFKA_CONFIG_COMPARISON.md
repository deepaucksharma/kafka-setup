# NRI-Kafka Configuration Comparison

## Side-by-Side Comparison

| Feature | Current Config | Optimized Config | Benefit |
|---------|---------------|------------------|---------|
| **Discovery** | Zookeeper (deprecated) | Bootstrap Servers | Future-proof, no Zookeeper dependency |
| **Topics Monitored** | 2 hardcoded topics | ALL topics or regex patterns | Monitors all 20+ simulator topics |
| **Consumer Groups** | Not configured | ALL groups monitored | Tracks lag for all consumer patterns |
| **Collection Instances** | Single instance | Dual instances (broker + consumer) | Optimized collection frequencies |
| **JMX Metrics** | Basic | Comprehensive with allowlist | Rich broker and topic metrics |
| **Timeouts** | Default (10s) | 30s configurable | Handles larger clusters |
| **Performance** | Default settings | Tuned connection pools | Better resource utilization |

## Detailed Comparison

### 1. Topic Coverage

**Current:**
```yaml
TOPIC_LIST: '["test-topic", "share-group-topic"]'
```
❌ Only 2 topics out of 20+ created by simulator

**Optimized:**
```yaml
TOPIC_MODE: all
# Or use patterns:
TOPIC_MODE: regex
TOPIC_REGEX: '.*'
```
✅ Monitors all topics automatically

### 2. Consumer Group Monitoring

**Current:**
```yaml
# No consumer group configuration
```
❌ Missing consumer lag metrics

**Optimized:**
```yaml
COLLECT_CONSUMER_GROUP_DATA: true
CONSUMER_GROUP_MODE: all
```
✅ Monitors all consumer groups including:
- fast-processors
- slow-analytics
- batch-etl-job
- unstable-service
- distributed-workers
- payment-processor
- order-fulfillment
- notification-service

### 3. Discovery Method

**Current:**
```yaml
AUTODISCOVER_STRATEGY: zookeeper
ZOOKEEPER_HOSTS: '[{"host": "zookeeper", "port": 2181}]'
```
⚠️ Zookeeper is being removed from Kafka

**Optimized:**
```yaml
AUTODISCOVER_STRATEGY: bootstrap
BOOTSTRAP_SERVERS: kafka-0.kafka:9092
```
✅ Native Kafka discovery

### 4. Monitoring Frequency

**Current:**
```yaml
interval: 30s
```
Single interval for all metrics

**Optimized:**
```yaml
# Broker metrics
interval: 30s

# Consumer lag metrics (separate instance)
interval: 15s
```
✅ More frequent consumer lag updates

### 5. JMX Metrics

**Current:**
```yaml
JMX_HOST: kafka-0.kafka
JMX_PORT: 9999
```
Basic JMX connection only

**Optimized:**
```yaml
JMX_HOST: kafka-0.kafka
JMX_PORT: 9999
MAX_JMX_CONNECTIONS: 10
THREAD_POOL_SIZE: 10

# Plus metrics allowlist:
- kafka.broker:type=BrokerTopicMetrics,name=MessagesInPerSec,topic=*
- kafka.broker:type=BrokerTopicMetrics,name=BytesInPerSec,topic=*
- kafka.broker:type=BrokerTopicMetrics,name=BytesOutPerSec,topic=*
- kafka.consumer:type=consumer-fetch-manager-metrics,client-id=*
- kafka.producer:type=producer-metrics,client-id=*
- kafka.server:type=ReplicaManager,name=UnderReplicatedPartitions
- kafka.network:type=RequestMetrics,name=TotalTimeMs,request=*
```
✅ Comprehensive JMX metrics collection

## Metrics Coverage Improvement

### Topics Monitored

| Current | Optimized |
|---------|-----------|
| test-topic | ✅ All standard-p* topics (1,3,5,10,20 partitions) |
| share-group-topic | ✅ All share-group-workqueue-* topics |
| | ✅ user-profiles-compact |
| | ✅ transaction-topic |
| | ✅ All retention-*ms-topic |
| | ✅ size-retention-topic |
| | ✅ All compressed-* topics |
| | ✅ high-throughput-topic |

### Consumer Groups Monitored

| Current | Optimized |
|---------|-----------|
| None configured | ✅ fast-processors |
| | ✅ slow-analytics |
| | ✅ batch-etl-job |
| | ✅ unstable-service |
| | ✅ distributed-workers |
| | ✅ partition-reader-* |
| | ✅ payment-processor |
| | ✅ order-fulfillment |
| | ✅ notification-service |
| | ✅ data-enrichment |

## Expected Metrics Increase

With the optimized configuration, expect to see:

1. **Topic Metrics**: From 2 → 20+ topics
2. **Consumer Group Metrics**: From 0 → 10+ groups
3. **JMX Metrics**: 10x more detailed broker metrics
4. **Consumer Lag Updates**: 2x faster (every 15s vs 30s)
5. **Partition Metrics**: Full visibility across 100+ partitions

## NRQL Query Examples

### Before Optimization
```sql
FROM KafkaTopicSample 
SELECT uniqueCount(topic) 
WHERE clusterName = 'kafka-k8s-cluster'
-- Result: 2 topics
```

### After Optimization
```sql
FROM KafkaTopicSample 
SELECT uniqueCount(topic) 
WHERE clusterName = 'kafka-k8s-cluster'
-- Result: 20+ topics

FROM KafkaConsumerSample
SELECT uniqueCount(consumerGroup)
WHERE clusterName = 'kafka-k8s-cluster'
-- Result: 10+ consumer groups

FROM KafkaBrokerSample
SELECT average(broker.messagesInPerSecond)
WHERE clusterName = 'kafka-k8s-cluster'
FACET topic
-- Result: Detailed per-topic metrics
```

## Apply the Optimization

Ready to upgrade? Run:
```bash
./apply-optimized-nri-kafka.sh
```

This will:
1. Backup your current configuration
2. Apply the optimized settings
3. Restart the New Relic infrastructure
4. Provide verification steps