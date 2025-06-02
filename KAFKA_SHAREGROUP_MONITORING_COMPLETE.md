# Comprehensive Kafka Share Group Monitoring with New Relic

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Quick Start](#quick-start)
5. [Understanding Share Groups](#understanding-share-groups)
6. [The Zero Lag Fallacy](#the-zero-lag-fallacy)
7. [Complete Kubernetes Setup](#complete-kubernetes-setup)
8. [Monitoring Components](#monitoring-components)
9. [Custom OHI Integration](#custom-ohi-integration)
10. [Dashboards and Alerts](#dashboards-and-alerts)
11. [Testing and Validation](#testing-and-validation)
12. [Troubleshooting](#troubleshooting)
13. [Best Practices](#best-practices)
14. [Migration Guide](#migration-guide)

## Overview

This comprehensive guide provides a complete Kubernetes-based setup for monitoring Apache Kafka with New Relic, specifically focusing on Kafka Share Groups (Kafka 4.0 Early Access feature). The solution addresses the "zero lag fallacy" in traditional Kafka monitoring by tracking actual message acknowledgment rather than just offset positions.

### Key Features
- **Dual monitoring approach**: Traditional Kafka metrics + Share Group metrics
- **New Relic integration**: Using nri-kafka, nri-flex, and Custom OHI
- **Queues & Streams UI**: Full integration with New Relic's specialized queue monitoring
- **Automated deployment**: Environment-based configuration and deployment scripts
- **Production-ready**: Includes monitoring, alerting, and troubleshooting tools

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Kubernetes Cluster                       │
│                                                             │
│  ┌──────────┐     ┌─────────────────────────────────────┐ │
│  │ Zookeeper │────▶│         Kafka Broker               │ │
│  └──────────┘     │  - Share Groups enabled            │ │
│                   │  - JMX Port: 9999                  │ │
│                   │  - Prometheus Exporter: 9404       │ │
│                   └──────────────┬──────────────────────┘ │
│                                  │                          │
│         ┌────────────────────────┼────────────────┐        │
│         │                        │                │        │
│         ▼                        ▼                ▼        │
│  ┌──────────────┐  ┌──────────────────┐  ┌─────────────┐ │
│  │  nri-kafka   │  │    nri-flex      │  │ Custom OHI  │ │
│  │              │  │                  │  │             │ │
│  │ Traditional  │  │ Prometheus       │  │ QueueSample │ │
│  │   Metrics    │  │   Scraper        │  │   Events    │ │
│  └──────┬───────┘  └──────┬───────────┘  └──────┬──────┘ │
│         │                 │                       │        │
│         └─────────────────┼───────────────────────┘        │
│                           │                                │
│                           ▼                                │
│                   ┌───────────────────┐                   │
│                   │    New Relic      │                   │
│                   │  - Metrics        │                   │
│                   │  - Events         │                   │
│                   │  - Queues & UI    │                   │
│                   └───────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Kubernetes cluster** (1.19+)
  - Docker Desktop with Kubernetes enabled
  - kind, minikube, or cloud provider
- **kubectl** configured and connected to cluster
- **New Relic account** with license key
- **Resources**:
  - Minimum: 4 CPUs, 8GB RAM
  - Recommended: 6 CPUs, 12GB RAM
- **Storage**: 10GB available for Kafka and Zookeeper

### Docker Desktop Configuration
```bash
# Enable Kubernetes in Docker Desktop settings
# Allocate resources: 6 CPUs, 12GB RAM, 40GB disk

# For local development, adjust storage in .env:
KAFKA_STORAGE_SIZE=2Gi
ZOOKEEPER_STORAGE_SIZE=1Gi
```

## Quick Start

```bash
# 1. Clone the repository
git clone <repository-url>
cd kafka_setup/kafka-monitoring

# 2. Setup environment
cp .env.example .env
# Edit .env - add your NEW_RELIC_LICENSE_KEY

# 3. Deploy everything
./deploy.sh

# 4. Verify deployment
kubectl get pods -n kafka-monitoring

# 5. Check metrics
kubectl port-forward -n kafka-monitoring kafka-0 9404:9404
curl http://localhost:9404/metrics | grep sharegroup
```

## Understanding Share Groups

### Traditional Consumer Groups vs Share Groups

**Traditional Consumer Groups**:
- Track progress using offsets
- Each partition assigned to one consumer
- Offset commit indicates "processed up to here"
- **Problem**: Offset ≠ Message actually processed

**Share Groups** (Kafka 4.0):
- Track individual message states
- Multiple consumers can process from same partition
- Explicit acknowledgment per message
- **Solution**: Accurate processing status

### Message States in Share Groups

1. **Available**: Ready for delivery
2. **Acquired**: Being processed by a consumer
3. **Acknowledged**: Successfully processed
4. **Released**: Returned to available (timeout/failure)
5. **Rejected**: Permanently failed

### Key Metrics

```
kafka_sharegroup_records_unacked      # Messages currently being processed
kafka_sharegroup_oldest_unacked_ms    # How long oldest message waiting
kafka_sharegroup_records_acknowledged # Successfully processed
kafka_sharegroup_records_released     # Timed out/returned
kafka_sharegroup_records_rejected     # Failed permanently
```

## The Zero Lag Fallacy

Traditional monitoring shows "zero lag" when consumers catch up to the latest offset, but this is misleading:

```
Producer writes → Offset 1000
Consumer reads → Offset 1000
Traditional Lag = 0 ✓ (Looks good!)

Reality:
- Message at offset 1000 still being processed
- Could fail and need retry
- Actual backlog unknown
```

### Share Groups Solution

```sql
-- Traditional (misleading)
SELECT latest(kafka.consumer.lag) as 'Offset Lag'
FROM KafkaConsumerSample

-- Share Groups (accurate)
SELECT latest(queue.size) as 'Actual Unacked Messages'
FROM QueueSample
WHERE provider = 'kafka'
```

## Complete Kubernetes Setup

### Directory Structure
```
kafka-monitoring/
├── .env.example                    # Environment configuration template
├── .env                           # Your configuration (git ignored)
├── generate-configs.sh            # Generates YAML from templates
├── deploy.sh                      # Deployment script
├── README.md                      # Setup documentation
├── templates/                     # YAML templates
│   ├── 01-kafka-zookeeper.yaml.tmpl
│   ├── 02-kafka-broker.yaml.tmpl
│   ├── 03-newrelic-configmap.yaml.tmpl
│   ├── 04-flex-configmap.yaml.tmpl
│   ├── 05-newrelic-daemonset.yaml.tmpl
│   ├── 06-test-sharegroup-consumer.yaml.tmpl
│   └── 07-custom-ohi-configmap.yaml.tmpl
└── generated/                     # Generated YAML files (git ignored)
```

### Environment Configuration (.env)

```bash
# New Relic Configuration
NEW_RELIC_LICENSE_KEY=your_license_key_here
NEW_RELIC_CLUSTER_NAME=kafka-k8s-monitoring
NRIA_VERBOSE=1

# Kafka Configuration
KAFKA_CLUSTER_NAME=kafka-k8s-cluster
KAFKA_NAMESPACE=kafka-monitoring
KAFKA_VERSION=7.5.0
KAFKA_REPLICAS=1
KAFKA_STORAGE_SIZE=5Gi
ZOOKEEPER_STORAGE_SIZE=2Gi

# Share Groups Configuration
ENABLE_SHARE_GROUPS=true
SHARE_GROUP_HEARTBEAT_MS=5000
SHARE_GROUP_SESSION_TIMEOUT_MS=30000

# Monitoring Configuration
NEWRELIC_INFRA_VERSION=2.13.0
NRI_KAFKA_VERSION=latest
FLEX_INTERVAL=30s
```

### 00-namespace.yaml
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: kafka-monitoring
```

### 01-kafka-zookeeper.yaml.tmpl
```yaml
apiVersion: v1
kind: Service
metadata:
  name: zookeeper
  namespace: ${KAFKA_NAMESPACE}
spec:
  ports:
  - port: 2181
    targetPort: 2181
  selector:
    app: zookeeper
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: zookeeper
  namespace: ${KAFKA_NAMESPACE}
spec:
  selector:
    matchLabels:
      app: zookeeper
  serviceName: zookeeper
  replicas: 1
  template:
    metadata:
      labels:
        app: zookeeper
    spec:
      containers:
      - name: zookeeper
        image: confluentinc/cp-zookeeper:${KAFKA_VERSION}
        ports:
        - containerPort: 2181
        env:
        - name: ZOOKEEPER_CLIENT_PORT
          value: "2181"
        - name: ZOOKEEPER_TICK_TIME
          value: "2000"
        volumeMounts:
        - name: data
          mountPath: /var/lib/zookeeper
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: ${ZOOKEEPER_STORAGE_SIZE}
```

### 02-kafka-broker.yaml.tmpl
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: kafka-jmx-exporter-config
  namespace: ${KAFKA_NAMESPACE}
data:
  kafka-jmx-exporter.yaml: |
    startDelaySeconds: 0
    ssl: false
    lowercaseOutputName: false
    lowercaseOutputLabelNames: false
    rules:
    # Standard Kafka metrics
    - pattern: kafka.server<type=(.+), name=(.+), clientId=(.+), topic=(.+), partition=(.*)><>Value
      name: kafka_server_$1_$2
      type: GAUGE
      labels:
       clientId: "$3"
       topic: "$4"
       partition: "$5"
    
    # Share Group metrics for Kafka 4.0
    - pattern: 'kafka.server<type=share-group-metrics, group=(.+), topic=(.+), partition=(.+)><>records-unacked'
      name: kafka_sharegroup_records_unacked
      labels:
        group: "$1"
        topic: "$2"
        partition: "$3"
      type: GAUGE
    
    - pattern: 'kafka.server<type=share-group-metrics, group=(.+), topic=(.+), partition=(.+)><>oldest-unacked-message-age-ms'
      name: kafka_sharegroup_oldest_unacked_ms
      labels:
        group: "$1"
        topic: "$2"
        partition: "$3"
      type: GAUGE
    
    - pattern: 'kafka.server<type=share-group-metrics, group=(.+), topic=(.+), partition=(.+)><>records-acknowledged'
      name: kafka_sharegroup_records_acknowledged
      labels:
        group: "$1"
        topic: "$2"
        partition: "$3"
      type: COUNTER
    
    - pattern: 'kafka.server<type=share-group-metrics, group=(.+), topic=(.+), partition=(.+)><>records-released'
      name: kafka_sharegroup_records_released
      labels:
        group: "$1"
        topic: "$2"
        partition: "$3"
      type: COUNTER
    
    - pattern: 'kafka.server<type=share-group-metrics, group=(.+), topic=(.+), partition=(.+)><>records-rejected'
      name: kafka_sharegroup_records_rejected
      labels:
        group: "$1"
        topic: "$2"
        partition: "$3"
      type: COUNTER
---
apiVersion: v1
kind: Service
metadata:
  name: kafka
  namespace: ${KAFKA_NAMESPACE}
spec:
  ports:
  - name: broker
    port: 9092
    targetPort: 9092
  - name: jmx
    port: 9999
    targetPort: 9999
  - name: metrics
    port: 9404
    targetPort: 9404
  selector:
    app: kafka
  clusterIP: None
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: kafka
  namespace: ${KAFKA_NAMESPACE}
spec:
  selector:
    matchLabels:
      app: kafka
  serviceName: kafka
  replicas: ${KAFKA_REPLICAS}
  template:
    metadata:
      labels:
        app: kafka
    spec:
      containers:
      - name: kafka
        image: confluentinc/cp-kafka:${KAFKA_VERSION}
        ports:
        - containerPort: 9092
        - containerPort: 9999
        - containerPort: 9404
        env:
        - name: KAFKA_BROKER_ID
          value: "0"
        - name: KAFKA_ZOOKEEPER_CONNECT
          value: "zookeeper:2181"
        - name: KAFKA_ADVERTISED_LISTENERS
          value: "PLAINTEXT://kafka-0.kafka:9092"
        - name: KAFKA_LISTENERS
          value: "PLAINTEXT://0.0.0.0:9092"
        - name: KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR
          value: "1"
        - name: KAFKA_TRANSACTION_STATE_LOG_MIN_ISR
          value: "1"
        - name: KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR
          value: "1"
        - name: KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS
          value: "0"
        # Enable JMX
        - name: KAFKA_JMX_PORT
          value: "9999"
        - name: KAFKA_JMX_HOSTNAME
          value: "kafka-0.kafka"
        # JMX Prometheus Exporter
        - name: KAFKA_OPTS
          value: "-javaagent:/opt/jmx-exporter/jmx_prometheus_javaagent.jar=9404:/opt/jmx-exporter/config.yaml"
        # Enable Share Groups
        - name: KAFKA_CFG_GROUP_SHARE_ENABLE
          value: "${ENABLE_SHARE_GROUPS}"
        - name: KAFKA_CFG_GROUP_SHARE_HEARTBEAT_INTERVAL_MS
          value: "${SHARE_GROUP_HEARTBEAT_MS}"
        - name: KAFKA_CFG_GROUP_SHARE_SESSION_TIMEOUT_MS
          value: "${SHARE_GROUP_SESSION_TIMEOUT_MS}"
        volumeMounts:
        - name: data
          mountPath: /var/lib/kafka
        - name: jmx-exporter
          mountPath: /opt/jmx-exporter
      initContainers:
      - name: download-jmx-exporter
        image: busybox:latest
        command:
        - sh
        - -c
        - |
          wget -O /opt/jmx-exporter/jmx_prometheus_javaagent.jar \
            https://repo1.maven.org/maven2/io/prometheus/jmx/jmx_prometheus_javaagent/0.19.0/jmx_prometheus_javaagent-0.19.0.jar
          cp /config/kafka-jmx-exporter.yaml /opt/jmx-exporter/config.yaml
        volumeMounts:
        - name: jmx-exporter
          mountPath: /opt/jmx-exporter
        - name: jmx-config
          mountPath: /config
      volumes:
      - name: jmx-exporter
        emptyDir: {}
      - name: jmx-config
        configMap:
          name: kafka-jmx-exporter-config
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: ${KAFKA_STORAGE_SIZE}
```

## Monitoring Components

### 03-newrelic-configmap.yaml.tmpl
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: newrelic-config
  namespace: ${KAFKA_NAMESPACE}
data:
  nri-kafka-config.yml: |
    integrations:
      - name: nri-kafka
        env:
          CLUSTER_NAME: ${KAFKA_CLUSTER_NAME}
          AUTODISCOVER_STRATEGY: zookeeper
          ZOOKEEPER_HOSTS: '[{"host": "zookeeper", "port": 2181}]'
          COLLECT_BROKER_TOPIC_DATA: true
          COLLECT_TOPIC_SIZE: true
          JMX_HOST: kafka-0.kafka
          JMX_PORT: 9999
          TOPIC_LIST: '["test-topic", "share-group-topic"]'
        interval: ${FLEX_INTERVAL}
```

### 04-flex-configmap.yaml.tmpl
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: newrelic-flex-config
  namespace: ${KAFKA_NAMESPACE}
data:
  kafka-sharegroup-flex.yml: |
    integrations:
      - name: nri-flex
        config:
          name: KafkaShareGroupMonitor
          apis:
            - name: ShareGroupMetrics
              url: http://kafka-0.kafka:9404/metrics
              prometheus:
                enable: true
              metric_parser:
                metrics:
                  - metric_name: kafka_sharegroup_records_unacked
                    metric_type: gauge
                  - metric_name: kafka_sharegroup_oldest_unacked_ms
                    metric_type: gauge
                  - metric_name: kafka_sharegroup_records_acknowledged
                    metric_type: counter
                  - metric_name: kafka_sharegroup_records_released
                    metric_type: counter
                  - metric_name: kafka_sharegroup_records_rejected
                    metric_type: counter
              custom_attributes:
                environment: kubernetes
                cluster: ${KAFKA_CLUSTER_NAME}
                integration: sharegroup-monitoring
```

### 05-newrelic-daemonset.yaml.tmpl
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: newrelic-license
  namespace: ${KAFKA_NAMESPACE}
type: Opaque
stringData:
  license: "${NEW_RELIC_LICENSE_KEY}"
---
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: newrelic-infrastructure
  namespace: ${KAFKA_NAMESPACE}
spec:
  selector:
    matchLabels:
      app: newrelic-infrastructure
  template:
    metadata:
      labels:
        app: newrelic-infrastructure
    spec:
      serviceAccountName: newrelic-infrastructure
      hostNetwork: true
      dnsPolicy: ClusterFirstWithHostNet
      containers:
      - name: newrelic-infrastructure
        image: newrelic/infrastructure-k8s:${NEWRELIC_INFRA_VERSION}
        securityContext:
          privileged: true
        env:
        - name: NRIA_LICENSE_KEY
          valueFrom:
            secretKeyRef:
              name: newrelic-license
              key: license
        - name: CLUSTER_NAME
          value: "${NEW_RELIC_CLUSTER_NAME}"
        - name: NRIA_VERBOSE
          value: "${NRIA_VERBOSE}"
        - name: NRIA_PROMETHEUS_INTEGRATIONS_SOURCE_ENABLED
          value: "true"
        volumeMounts:
        - name: host-root
          mountPath: /host
          readOnly: true
        - name: nri-kafka-config
          mountPath: /var/db/newrelic-infra/integrations.d/kafka-config.yml
          subPath: nri-kafka-config.yml
        - name: nri-flex-config
          mountPath: /var/db/newrelic-infra/integrations.d/kafka-sharegroup-flex.yml
          subPath: kafka-sharegroup-flex.yml
        - name: custom-ohi-definition
          mountPath: /var/db/newrelic-infra/integrations.d/sharegroup-ohi-definition.yaml
          subPath: sharegroup-ohi-definition.yaml
        - name: custom-ohi-script
          mountPath: /var/db/newrelic-infra/custom-integrations/sharegroup-ohi.py
          subPath: sharegroup-ohi.py
      volumes:
      - name: host-root
        hostPath:
          path: /
      - name: nri-kafka-config
        configMap:
          name: newrelic-config
      - name: nri-flex-config
        configMap:
          name: newrelic-flex-config
      - name: custom-ohi-definition
        configMap:
          name: custom-ohi-sharegroup
          items:
          - key: sharegroup-ohi-definition.yaml
            path: sharegroup-ohi-definition.yaml
      - name: custom-ohi-script
        configMap:
          name: custom-ohi-sharegroup
          defaultMode: 0755
          items:
          - key: sharegroup-ohi.py
            path: sharegroup-ohi.py
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: newrelic-infrastructure
  namespace: ${KAFKA_NAMESPACE}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: newrelic-infrastructure
rules:
- apiGroups: [""]
  resources:
  - nodes
  - nodes/metrics
  - nodes/stats
  - nodes/proxy
  - pods
  - services
  - secrets
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources:
  - daemonsets
  - deployments
  - replicasets
  - statefulsets
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: newrelic-infrastructure
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: newrelic-infrastructure
subjects:
- kind: ServiceAccount
  name: newrelic-infrastructure
  namespace: ${KAFKA_NAMESPACE}
```

## Custom OHI Integration

### 07-custom-ohi-configmap.yaml.tmpl
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: custom-ohi-sharegroup
  namespace: ${KAFKA_NAMESPACE}
data:
  sharegroup-ohi-definition.yaml: |
    integrations:
    - name: com.example.kafka.sharegroup
      env:
        PROMETHEUS_ENDPOINT: "http://kafka-0.kafka:9404/metrics"
        CLUSTER_NAME: "${KAFKA_CLUSTER_NAME}"
      interval: 30
  
  sharegroup-ohi.py: |
    #!/usr/bin/env python3
    """
    Custom OHI for Kafka Share Groups
    Converts Share Group metrics to QueueSample events for New Relic Queues & Streams UI
    """
    import json
    import requests
    import sys
    import time
    import os
    from datetime import datetime
    
    # Configuration
    PROMETHEUS_ENDPOINT = os.environ.get('PROMETHEUS_ENDPOINT', 'http://kafka-0.kafka:9404/metrics')
    CLUSTER_NAME = os.environ.get('CLUSTER_NAME', '${KAFKA_CLUSTER_NAME}')
    
    def parse_prometheus_metrics(text):
        """Parse Prometheus text format into metrics dict"""
        metrics = {}
        for line in text.strip().split('\n'):
            if line.startswith('#') or not line:
                continue
            
            try:
                parts = line.split(' ')
                if len(parts) != 2:
                    continue
                
                metric_part = parts[0]
                value = float(parts[1])
                
                if '{' in metric_part:
                    metric_name = metric_part[:metric_part.index('{')]
                    labels_str = metric_part[metric_part.index('{')+1:metric_part.index('}')]
                    labels = {}
                    for label in labels_str.split(','):
                        if '=' in label:
                            k, v = label.split('=', 1)
                            labels[k] = v.strip('"')
                else:
                    metric_name = metric_part
                    labels = {}
                
                if metric_name not in metrics:
                    metrics[metric_name] = []
                
                metrics[metric_name].append({
                    'labels': labels,
                    'value': value
                })
            except:
                continue
        
        return metrics
    
    def fetch_sharegroup_metrics():
        """Fetch Share Group metrics from Prometheus endpoint"""
        try:
            response = requests.get(PROMETHEUS_ENDPOINT, timeout=10)
            response.raise_for_status()
            return parse_prometheus_metrics(response.text)
        except Exception as e:
            print(f"Error fetching metrics: {e}", file=sys.stderr)
            return {}
    
    def create_queue_samples(metrics):
        """Convert Share Group metrics to QueueSample events"""
        queue_samples = []
        grouped_metrics = {}
        
        for metric_name, values in metrics.items():
            if 'sharegroup' not in metric_name:
                continue
            
            for metric in values:
                labels = metric['labels']
                group = labels.get('group', 'unknown')
                topic = labels.get('topic', 'unknown')
                partition = labels.get('partition', 'unknown')
                
                key = f"{group}:{topic}:{partition}"
                if key not in grouped_metrics:
                    grouped_metrics[key] = {
                        'group': group,
                        'topic': topic,
                        'partition': partition,
                        'metrics': {}
                    }
                
                if 'records_unacked' in metric_name:
                    grouped_metrics[key]['metrics']['queue.size'] = metric['value']
                elif 'oldest_unacked_ms' in metric_name:
                    grouped_metrics[key]['metrics']['oldest.message.age.seconds'] = metric['value'] / 1000.0
                elif 'records_acknowledged' in metric_name:
                    grouped_metrics[key]['metrics']['messages.acknowledged'] = metric['value']
                elif 'records_released' in metric_name:
                    grouped_metrics[key]['metrics']['messages.released'] = metric['value']
                elif 'records_rejected' in metric_name:
                    grouped_metrics[key]['metrics']['messages.rejected'] = metric['value']
        
        # Create QueueSample events
        for key, data in grouped_metrics.items():
            queue_sample = {
                'eventType': 'QueueSample',
                'provider': 'kafka',
                'entityName': f"queue:kafka/{data['topic']}-{data['partition']}",
                'displayName': f"{data['topic']}-{data['partition']}",
                'queue.name': f"{data['topic']}-{data['partition']}",
                'share.group.name': data['group'],
                'topic': data['topic'],
                'partition': data['partition'],
                'cluster': CLUSTER_NAME,
                'timestamp': int(time.time())
            }
            
            queue_sample.update(data['metrics'])
            queue_sample.setdefault('queue.size', 0)
            queue_sample.setdefault('oldest.message.age.seconds', 0)
            queue_sample.setdefault('messages.acknowledged', 0)
            queue_sample.setdefault('messages.released', 0)
            queue_sample.setdefault('messages.rejected', 0)
            
            queue_samples.append(queue_sample)
        
        # Create topic aggregates
        topic_aggregates = {}
        for sample in queue_samples:
            topic = sample['topic']
            group = sample['share.group.name']
            key = f"{group}:{topic}"
            
            if key not in topic_aggregates:
                topic_aggregates[key] = {
                    'eventType': 'QueueSample',
                    'provider': 'kafka',
                    'entityName': f"queue:kafka/{topic}",
                    'displayName': topic,
                    'queue.name': topic,
                    'share.group.name': group,
                    'topic': topic,
                    'cluster': CLUSTER_NAME,
                    'queue.size': 0,
                    'oldest.message.age.seconds': 0,
                    'messages.acknowledged': 0,
                    'messages.released': 0,
                    'messages.rejected': 0,
                    'timestamp': int(time.time())
                }
            
            topic_aggregates[key]['queue.size'] += sample.get('queue.size', 0)
            topic_aggregates[key]['messages.acknowledged'] += sample.get('messages.acknowledged', 0)
            topic_aggregates[key]['messages.released'] += sample.get('messages.released', 0)
            topic_aggregates[key]['messages.rejected'] += sample.get('messages.rejected', 0)
            topic_aggregates[key]['oldest.message.age.seconds'] = max(
                topic_aggregates[key]['oldest.message.age.seconds'],
                sample.get('oldest.message.age.seconds', 0)
            )
        
        queue_samples.extend(list(topic_aggregates.values()))
        return queue_samples
    
    def main():
        """Main function for OHI"""
        try:
            metrics = fetch_sharegroup_metrics()
            queue_samples = create_queue_samples(metrics)
            
            output = {
                'name': 'com.example.kafka.sharegroup',
                'protocol_version': '3',
                'integration_version': '1.0.0',
                'data': [{
                    'entity': {
                        'name': 'kafka-sharegroup-ohi',
                        'type': 'kafka-sharegroup',
                        'id_attributes': [
                            {'key': 'cluster', 'value': CLUSTER_NAME}
                        ]
                    },
                    'metrics': queue_samples,
                    'inventory': {},
                    'events': []
                }]
            }
            
            print(json.dumps(output))
            
        except Exception as e:
            print(f"Error in main: {e}", file=sys.stderr)
            sys.exit(1)
    
    if __name__ == '__main__':
        main()
```

### 06-test-sharegroup-consumer.yaml.tmpl
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: create-test-topics
  namespace: ${KAFKA_NAMESPACE}
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: create-topics
        image: confluentinc/cp-kafka:${KAFKA_VERSION}
        command:
        - sh
        - -c
        - |
          sleep 30
          kafka-topics --bootstrap-server kafka-0.kafka:9092 \
            --create --topic share-group-topic \
            --partitions 3 --replication-factor 1 || true
          kafka-topics --bootstrap-server kafka-0.kafka:9092 \
            --create --topic test-topic \
            --partitions 3 --replication-factor 1 || true
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: share-group-consumer-script
  namespace: ${KAFKA_NAMESPACE}
data:
  consumer.sh: |
    #!/bin/bash
    # Simulated Share Group Consumer
    echo "Starting Share Group Consumer (simulated)..."
    
    # Since Kafka 4.0 with Share Groups might not be available,
    # we simulate the behavior for testing metrics
    
    while true; do
      # Consume messages and simulate acknowledgment
      kafka-console-consumer \
        --bootstrap-server kafka-0.kafka:9092 \
        --topic share-group-topic \
        --group test-share-group \
        --max-messages 10 \
        --timeout-ms 5000 || true
      
      # Log simulated acknowledgment
      echo "Acknowledged batch of messages"
      sleep 5
    done
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: share-group-consumer
  namespace: ${KAFKA_NAMESPACE}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: share-group-consumer
  template:
    metadata:
      labels:
        app: share-group-consumer
    spec:
      containers:
      - name: consumer
        image: confluentinc/cp-kafka:${KAFKA_VERSION}
        command: ["/bin/bash", "/scripts/consumer.sh"]
        volumeMounts:
        - name: script
          mountPath: /scripts
      volumes:
      - name: script
        configMap:
          name: share-group-consumer-script
          defaultMode: 0755
```

## Dashboards and Alerts

### Dashboard Configuration
```json
{
  "name": "Kafka Share Groups Monitoring",
  "pages": [
    {
      "name": "Share Group Overview",
      "widgets": [
        {
          "title": "Total Unacknowledged Messages",
          "nrql": "SELECT sum(queue.size) FROM QueueSample WHERE provider = 'kafka' FACET share.group.name TIMESERIES AUTO"
        },
        {
          "title": "Oldest Unacked Message Age",
          "nrql": "SELECT max(oldest.message.age.seconds) FROM QueueSample WHERE provider = 'kafka' FACET share.group.name, topic.name TIMESERIES AUTO"
        },
        {
          "title": "Message Processing Rate",
          "nrql": "SELECT rate(sum(messages.acknowledged), 1 minute) FROM QueueSample WHERE provider = 'kafka' FACET share.group.name TIMESERIES AUTO"
        },
        {
          "title": "Zero Lag Fallacy Comparison",
          "nrql": "SELECT latest(kafka.consumer.lag) as 'Traditional Lag', latest(queue.size) as 'Actual Unacked' FROM KafkaConsumerSample, QueueSample WHERE clusterName = 'kafka-k8s-cluster' FACET consumerGroup, share.group.name"
        }
      ]
    }
  ]
}
```

### Alert Policies

1. **High Unacknowledged Messages**
```sql
SELECT sum(queue.size) FROM QueueSample 
WHERE provider = 'kafka' 
FACET share.group.name
-- Critical: > 10,000 messages
-- Warning: > 5,000 messages
```

2. **Old Unacked Messages**
```sql
SELECT max(oldest.message.age.seconds) FROM QueueSample 
WHERE provider = 'kafka' 
FACET share.group.name, topic.name
-- Critical: > 300 seconds (5 minutes)
-- Warning: > 120 seconds (2 minutes)
```

3. **Stalled Processing**
```sql
SELECT rate(sum(messages.acknowledged), 1 minute) FROM QueueSample 
WHERE provider = 'kafka' 
FACET share.group.name
-- Critical: = 0 for 5 minutes
-- Warning: < 10 messages/minute
```

## Testing and Validation

### Generate Test Workloads
```bash
# Deploy workload generator
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: workload-generator
  namespace: kafka-monitoring
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: generator
        image: confluentinc/cp-kafka:7.5.0
        command:
        - sh
        - -c
        - |
          # Normal load
          echo "Generating normal load..."
          for i in {1..100}; do
            echo "Message $i" | kafka-console-producer \
              --bootstrap-server kafka-0.kafka:9092 \
              --topic share-group-topic
            sleep 0.1
          done
          
          # Burst load
          echo "Generating burst load..."
          for i in {1..500}; do
            echo "Burst $i" | kafka-console-producer \
              --bootstrap-server kafka-0.kafka:9092 \
              --topic share-group-topic
          done
          
          echo "Workload generation complete"
EOF
```

### Verify Metrics Flow

1. **Check Prometheus Metrics**:
```bash
kubectl port-forward -n kafka-monitoring kafka-0 9404:9404
curl http://localhost:9404/metrics | grep sharegroup
```

2. **Verify QueueSample Events**:
```sql
SELECT count(*) FROM QueueSample 
WHERE provider = 'kafka' 
SINCE 5 minutes ago

SELECT * FROM QueueSample 
WHERE provider = 'kafka' 
LIMIT 10
```

3. **Check OHI Logs**:
```bash
kubectl logs -n kafka-monitoring -l app=newrelic-infrastructure -c newrelic-infrastructure | grep sharegroup
```

## Troubleshooting

### Common Issues

1. **Pods Not Starting**
```bash
# Check pod status
kubectl describe pod <pod-name> -n kafka-monitoring

# Check events
kubectl get events -n kafka-monitoring --sort-by='.lastTimestamp'

# Check resource availability
kubectl top nodes
```

2. **No Metrics in New Relic**
```bash
# Verify license key
kubectl get secret newrelic-license -n kafka-monitoring -o yaml

# Check agent logs
kubectl logs -n kafka-monitoring -l app=newrelic-infrastructure

# Test connectivity
kubectl exec -it <newrelic-pod> -n kafka-monitoring -- curl -v https://metric-api.newrelic.com/
```

3. **Share Group Metrics Missing**
```bash
# Check JMX directly
kubectl exec -it kafka-0 -n kafka-monitoring -- \
  kafka-run-class kafka.tools.JmxTool \
  --jmx-url service:jmx:rmi:///jndi/rmi://localhost:9999/jmxrmi \
  --object-name "kafka.server:type=share-group-metrics,*" \
  --one-time true

# Verify Prometheus scraping
kubectl port-forward -n kafka-monitoring kafka-0 9404:9404
curl http://localhost:9404/metrics | grep -i share
```

4. **OHI Not Sending Events**
```bash
# Test OHI script directly
kubectl exec -it <newrelic-pod> -n kafka-monitoring -- \
  python3 /var/db/newrelic-infra/custom-integrations/sharegroup-ohi.py

# Check for Python dependencies
kubectl exec -it <newrelic-pod> -n kafka-monitoring -- \
  pip3 list | grep requests
```

### Debug Commands

```bash
# Full system check
cat <<'EOF' > debug.sh
#!/bin/bash
echo "=== Kafka Share Group Debug ==="

echo -e "\n1. Pod Status:"
kubectl get pods -n kafka-monitoring

echo -e "\n2. Kafka Topics:"
kubectl exec -it kafka-0 -n kafka-monitoring -- \
  kafka-topics --bootstrap-server localhost:9092 --list

echo -e "\n3. Consumer Groups:"
kubectl exec -it kafka-0 -n kafka-monitoring -- \
  kafka-consumer-groups --bootstrap-server localhost:9092 --list

echo -e "\n4. Prometheus Metrics:"
kubectl port-forward -n kafka-monitoring kafka-0 9404:9404 &
PF_PID=$!
sleep 2
curl -s http://localhost:9404/metrics | grep -c sharegroup
kill $PF_PID 2>/dev/null

echo -e "\n5. New Relic Agent Status:"
kubectl logs -n kafka-monitoring -l app=newrelic-infrastructure --tail=20 | grep -i "error\|warn\|sharegroup"
EOF

chmod +x debug.sh
./debug.sh
```

## Best Practices

### 1. Resource Management
- **CPU**: Allocate at least 2 cores for Kafka, 1 core for monitoring
- **Memory**: 4GB for Kafka, 2GB for Zookeeper, 1GB for monitoring
- **Storage**: Use fast SSDs for Kafka data, separate volumes for logs

### 2. Monitoring Strategy
- **Metrics Collection**: Keep intervals at 30-60 seconds
- **Alert Thresholds**: Start conservative, tune based on baseline
- **Dashboard Organization**: Separate operational vs analytical views

### 3. Share Group Configuration
```yaml
# Optimal settings for production
SHARE_GROUP_HEARTBEAT_MS: 3000        # Fast failure detection
SHARE_GROUP_SESSION_TIMEOUT_MS: 30000 # Allow for GC pauses
SHARE_GROUP_MAX_POLL_RECORDS: 500     # Balance throughput/latency
ACKNOWLEDGMENT_TIMEOUT_MS: 30000      # Match session timeout
```

### 4. Security Considerations
- Use Kubernetes secrets for all credentials
- Enable RBAC for service accounts
- Implement network policies
- Use TLS for Kafka communication

### 5. Scaling Guidelines
- **Horizontal**: Add Kafka brokers for throughput
- **Vertical**: Increase resources for latency-sensitive workloads
- **Consumers**: Scale based on `queue.size` trends

## Migration Guide

### Phase 1: Parallel Running (2-4 weeks)
```yaml
# Deploy Share Group consumer alongside traditional
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dual-consumer
spec:
  containers:
  - name: traditional-consumer
    # Existing consumer configuration
  - name: sharegroup-consumer
    # New Share Group consumer
    env:
    - name: CONSUMER_MODE
      value: "shadow"  # Only monitor, don't process
```

### Phase 2: Canary Deployment (2-4 weeks)
```yaml
# Route percentage of traffic to Share Groups
- name: TRAFFIC_PERCENTAGE
  value: "10"  # Start with 10%
- name: FEATURE_FLAG_SHAREGROUPS
  value: "true"
```

### Phase 3: Full Migration (1-2 weeks)
```yaml
# Switch all traffic to Share Groups
- name: CONSUMER_MODE
  value: "sharegroup"
- name: LEGACY_MODE
  value: "false"
```

### Rollback Plan
```bash
# Quick rollback procedure
kubectl set env deployment/consumer-app CONSUMER_MODE=traditional -n kafka-monitoring
kubectl rollout restart deployment/consumer-app -n kafka-monitoring
kubectl rollout status deployment/consumer-app -n kafka-monitoring
```

## Conclusion

This comprehensive setup provides:

1. **Accurate Monitoring**: Real message processing status, not just offset lag
2. **Full Integration**: Native New Relic Queues & Streams UI support
3. **Production Ready**: Includes monitoring, alerting, and troubleshooting
4. **Future Proof**: Ready for Kafka 4.0 Share Groups when released

The combination of traditional metrics (nri-kafka), Prometheus scraping (nri-flex), and custom integration (OHI) ensures complete visibility into Kafka operations while addressing the fundamental "zero lag fallacy" that has misled teams for years.

### Key Takeaways

- **Zero lag ≠ No backlog**: Always monitor actual message processing
- **Share Groups**: Bring queue semantics to streaming platforms
- **Observability**: Critical for modern distributed systems
- **Automation**: Environment-based configuration speeds deployment

For questions, issues, or contributions, please refer to the project repository.