# Kafka Monitoring - Queues & Streams Feature Enhancements

## Current Implementation Gaps

### 1. Missing Required QueueSample Attributes
Based on New Relic's Queues & Streams UI requirements, our current implementation is missing:

- **Producer metrics**: `producer.count`, `messages.in.rate`, `messages.published`
- **Consumer metrics**: `consumer.lag.max`, `consumer.utilization`, `messages.consumed.rate`
- **Queue health**: `queue.waitTime.avg`, `queue.processingTime.avg`, `error.rate`
- **Entity metadata**: `service.name`, `environment`, `region`, `cloud.provider`

### 2. Entity Naming Issues
Current: `kafka:sharegroup:{group}:{topic}:{partition}`
Recommended: Follow standard entity naming for better UI integration

### 3. Missing Collection Modes
Currently only implementing Share Group mode. Need to support all 4 modes:
1. **Traditional Consumer Groups** (offset-based lag)
2. **Share Groups** (acknowledgment-based lag)
3. **Producer Metrics** (ingestion rates)
4. **Broker/Topic Health** (overall system metrics)

## Enhanced Implementation Design

### 1. Comprehensive QueueSample Attributes

```python
# Required attributes for full Queues & Streams UI support
queue_sample = {
    "eventType": "QueueSample",
    "timestamp": int(time.time()),
    
    # Entity identification (REQUIRED)
    "provider": "kafka",  # or "kafka-msk", "kafka-confluent"
    "queue.name": topic_name,
    "entityName": entity_name,
    "service.name": service_name,
    
    # Environment context
    "environment": "production",
    "region": "us-east-1",
    "cloud.provider": "self-hosted",  # or "aws", "confluent"
    "cluster.name": cluster_name,
    
    # Queue metrics (REQUIRED for main panels)
    "queue.size": unacked_messages,
    "queue.waitTime.avg": avg_wait_time_ms,
    "oldest.message.age.seconds": oldest_msg_age,
    
    # Throughput metrics (REQUIRED for throughput panel)
    "messages.in.rate": messages_per_second_in,
    "messages.out.rate": messages_per_second_out,
    "messages.published": total_published,
    "messages.consumed": total_consumed,
    "messages.acknowledged": total_acknowledged,
    
    # Consumer metrics (REQUIRED for consumer panel)
    "consumer.count": active_consumers,
    "consumer.lag.max": max_lag_messages,
    "consumer.utilization": consumer_cpu_percent,
    "messages.consumed.rate": consumption_rate,
    
    # Producer metrics (REQUIRED for producer panel)
    "producer.count": active_producers,
    "producer.rate": production_rate,
    "producer.errors": producer_error_count,
    
    # Error tracking (REQUIRED for health panel)
    "error.rate": errors_per_minute,
    "messages.dlq": dead_letter_count,
    "messages.failed": failed_count,
    
    # Performance metrics
    "queue.processingTime.avg": avg_processing_ms,
    "queue.throughput.bytes": bytes_per_second,
    
    # Kafka-specific attributes
    "topic.name": topic,
    "partition.id": partition,
    "partition.count": total_partitions,
    "broker.count": broker_count,
    "replication.factor": replication_factor,
    
    # Share Group specific (when applicable)
    "share.group.name": share_group,
    "messages.released": released_count,
    "messages.rejected": rejected_count,
    
    # Consumer Group specific (when applicable)
    "consumer.group.name": consumer_group,
    "consumer.group.state": group_state,
    "offset.lag": offset_based_lag,
}
```

### 2. Four Collection Modes Implementation

#### Mode 1: Traditional Consumer Groups
```python
def collect_consumer_group_metrics():
    """Collect offset-based consumer group lag metrics"""
    # Query consumer group offsets
    # Calculate lag vs high water mark
    # Create QueueSample with consumer group focus
```

#### Mode 2: Share Groups (Current Implementation)
```python
def collect_share_group_metrics():
    """Collect acknowledgment-based Share Group metrics"""
    # Current implementation with enhancements
```

#### Mode 3: Producer Metrics
```python
def collect_producer_metrics():
    """Collect producer-side metrics"""
    # Query JMX for producer metrics
    # Track production rates, errors
    # Create QueueSample with producer focus
```

#### Mode 4: Broker/Topic Health
```python
def collect_broker_topic_metrics():
    """Collect overall broker and topic health"""
    # Query broker metrics
    # Aggregate topic-level statistics
    # Create QueueSample with system health focus
```

### 3. Entity Naming Convention

Follow New Relic's standard entity naming:
```
# For topics
entity:kafka:topic:{cluster}:{topic}

# For consumer groups
entity:kafka:consumergroup:{cluster}:{group}:{topic}

# For share groups
entity:kafka:sharegroup:{cluster}:{group}:{topic}

# For brokers
entity:kafka:broker:{cluster}:{broker_id}
```

### 4. Enhanced OHI Configuration

```yaml
integrations:
  - name: com.newrelic.kafka-enhanced
    exec: /scripts/kafka-enhanced-ohi.py
    interval: 30s
    env:
      # Collection modes
      COLLECT_CONSUMER_GROUPS: "true"
      COLLECT_SHARE_GROUPS: "true"
      COLLECT_PRODUCERS: "true"
      COLLECT_BROKER_HEALTH: "true"
      
      # Data sources
      KAFKA_BOOTSTRAP_SERVERS: "kafka-0.kafka:9092"
      JMX_ENDPOINT: "kafka-0.kafka:9999"
      PROMETHEUS_ENDPOINT: "http://kafka-0.kafka:9404/metrics"
      
      # Entity configuration
      CLUSTER_NAME: "kafka-k8s-cluster"
      ENVIRONMENT: "production"
      REGION: "us-east-1"
      SERVICE_NAME: "kafka-monitoring"
```

## Implementation Recommendations

### 1. Immediate Enhancements
- Add missing QueueSample attributes to current OHI
- Implement producer and consumer rate calculations
- Add error tracking and health metrics

### 2. Short-term Goals
- Implement all 4 collection modes
- Add support for multiple clusters
- Create mode-specific entity naming

### 3. Long-term Vision
- Auto-discovery of topics and consumer groups
- Dynamic threshold calculation
- Integration with Kafka Connect and Streams

## Benefits

1. **Full UI Support**: All panels in Queues & Streams UI will have data
2. **Better Alerting**: More metrics enable sophisticated alert conditions
3. **Complete Visibility**: Cover all aspects of Kafka operations
4. **Cloud Parity**: Match features of MSK and Confluent integrations