# NRI-Kafka Configuration Guide

## Overview

This guide explains how to properly configure nri-kafka to monitor all aspects of your Kafka cluster, especially with the comprehensive simulator generating rich multi-dimensional data.

## Current vs Optimized Configuration

### Current Issues
1. **Deprecated Zookeeper Discovery**: Using `AUTODISCOVER_STRATEGY: zookeeper` which is being phased out
2. **Limited Topic Monitoring**: Only monitoring 2 hardcoded topics out of 20+ created
3. **No Consumer Group Monitoring**: Missing `COLLECT_CONSUMER_GROUP_DATA` configuration
4. **No Performance Tuning**: Using defaults which may not handle high-volume data

### Optimized Configuration Benefits
1. **Bootstrap Server Discovery**: Modern approach using Kafka's native discovery
2. **Comprehensive Topic Monitoring**: Monitor all topics with regex patterns
3. **Consumer Group Tracking**: Full consumer lag monitoring
4. **Dual Integration Instances**: Separate instances for broker and consumer metrics
5. **Performance Optimized**: Tuned timeouts, connection pools, and intervals

## Configuration Options Explained

### 1. Discovery Strategy
```yaml
# Old (Deprecated)
AUTODISCOVER_STRATEGY: zookeeper
ZOOKEEPER_HOSTS: '[{"host": "zookeeper", "port": 2181}]'

# New (Recommended)
AUTODISCOVER_STRATEGY: bootstrap
BOOTSTRAP_SERVERS: kafka-0.kafka:9092
```

### 2. Topic Monitoring Modes

#### Option A: Monitor All Topics (Recommended)
```yaml
TOPIC_MODE: all
```

#### Option B: Regex Pattern
```yaml
TOPIC_MODE: regex
TOPIC_REGEX: '^(standard-|share-group-|compressed-).*'  # Monitor specific patterns
```

#### Option C: Explicit List
```yaml
TOPIC_MODE: list
TOPIC_LIST: '["topic1", "topic2", "topic3"]'
```

### 3. Consumer Group Monitoring
```yaml
COLLECT_CONSUMER_GROUP_DATA: true
CONSUMER_GROUP_MODE: all  # or 'regex' with CONSUMER_GROUP_REGEX
```

### 4. Performance Tuning
```yaml
TIMEOUT: 30000              # Operation timeout in ms
MAX_JMX_CONNECTIONS: 10     # JMX connection pool size
THREAD_POOL_SIZE: 10        # Worker thread pool
TOPIC_BUCKET_SIZE: 150      # Topics per API request
```

## Implementation Steps

### 1. Backup Current Configuration
```bash
kubectl get configmap newrelic-config -n kafka-monitoring -o yaml > newrelic-config-backup.yaml
```

### 2. Apply Optimized Configuration
```bash
# Replace the current template
cp templates/03-newrelic-configmap-optimized.yaml.tmpl templates/03-newrelic-configmap.yaml.tmpl

# Regenerate configurations
./generate-configs.sh

# Apply the new configuration
kubectl apply -f generated/03-newrelic-configmap.yaml
```

### 3. Restart New Relic Infrastructure
```bash
# Delete the pod to force recreation with new config
kubectl delete pod -n kafka-monitoring -l name=newrelic-infrastructure
```

### 4. Verify Configuration
```bash
# Check New Relic pod logs
kubectl logs -n kafka-monitoring -l name=newrelic-infrastructure | grep nri-kafka

# Verify metrics collection
kubectl exec -n kafka-monitoring deployment/kafka-comprehensive-simulator -- \
  kafka-consumer-groups --bootstrap-server kafka-0.kafka:9092 --list
```

## Monitoring All Simulator Data

With the optimized configuration, nri-kafka will collect:

### Topics (20+ types)
- Standard topics (1, 3, 5, 10, 20 partitions)
- Compacted topics
- Time-retention topics (1min, 5min, 1hr)
- Size-retention topics
- Compressed topics (gzip, snappy, lz4, zstd)
- Transaction topics
- High-throughput topics
- Share Group workqueue topics

### Consumer Groups
- fast-processors
- slow-analytics
- batch-etl-job
- unstable-service
- distributed-workers
- partition-reader-0 through partition-reader-4
- payment-processor
- order-fulfillment
- notification-service
- data-enrichment

### Metrics Categories
- **Broker Metrics**: Messages/bytes in/out per second
- **Topic Metrics**: Per-topic statistics, partition counts
- **Consumer Metrics**: Lag, offset, consumption rates
- **JMX Metrics**: Request latencies, handler utilization
- **Network Metrics**: Request types and latencies
- **Log Metrics**: Flush rates and times

## Verification Queries

After applying the optimized configuration, verify data collection:

```sql
-- Check all topics being monitored
FROM KafkaTopicSample 
SELECT uniqueCount(topic) as 'Topics Monitored'
WHERE clusterName = 'kafka-k8s-cluster' 
SINCE 10 minutes ago

-- Check all consumer groups
FROM KafkaConsumerSample 
SELECT uniqueCount(consumerGroup) as 'Consumer Groups'
WHERE clusterName = 'kafka-k8s-cluster' 
SINCE 10 minutes ago

-- Verify JMX metrics
FROM KafkaBrokerSample 
SELECT count(*) 
WHERE clusterName = 'kafka-k8s-cluster' 
AND broker.JMXPort IS NOT NULL
SINCE 10 minutes ago

-- Check consumer lag for all groups
FROM KafkaConsumerSample 
SELECT max(consumer.lag) as 'Max Lag'
WHERE clusterName = 'kafka-k8s-cluster' 
FACET consumerGroup, topic 
SINCE 10 minutes ago
```

## Best Practices

1. **Use Bootstrap Discovery**: Always prefer bootstrap over zookeeper
2. **Monitor All Topics**: In development/test, monitor all topics. In production, use patterns
3. **Separate Consumer Monitoring**: Use a dedicated instance for consumer lag with higher frequency
4. **Set Appropriate Timeouts**: Adjust based on cluster size and network latency
5. **Use Metrics Filtering**: Apply allowlist/blocklist to reduce noise
6. **Monitor Both JMX and Native**: JMX provides deep metrics, native provides consumer groups

## Troubleshooting

### No Data Appearing
1. Check pod logs: `kubectl logs -n kafka-monitoring -l name=newrelic-infrastructure`
2. Verify connectivity: `kubectl exec -n kafka-monitoring <pod> -- nc -zv kafka-0.kafka 9092`
3. Check JMX port: `kubectl exec -n kafka-monitoring <pod> -- nc -zv kafka-0.kafka 9999`

### Missing Consumer Groups
1. Ensure `COLLECT_CONSUMER_GROUP_DATA: true`
2. Check consumer group exists: `kafka-consumer-groups --list --bootstrap-server kafka-0.kafka:9092`
3. Verify permissions if using ACLs

### High Memory Usage
1. Reduce `TOPIC_BUCKET_SIZE`
2. Use topic patterns instead of `all`
3. Increase collection interval
4. Apply metrics blocklist

## Next Steps

1. Apply the optimized configuration
2. Create custom New Relic dashboards for all metrics
3. Set up alerting for consumer lag and broker issues
4. Consider adding SSL/SASL authentication in production