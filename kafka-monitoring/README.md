# Kafka Share Group Monitoring

Kubernetes deployment for Kafka with New Relic monitoring of Share Groups (Kafka 4.0 Early Access).

## Quick Start

```bash
# 1. Setup environment
cp .env.example .env
# Edit .env - add your NEW_RELIC_LICENSE_KEY

# 2. Deploy
./deploy.sh

# 3. Verify
kubectl get pods -n kafka-monitoring
```

## Prerequisites

- Kubernetes (Docker Desktop, kind, or cloud)
- kubectl
- New Relic license key

### Docker Desktop Setup

```bash
# Enable Kubernetes in Docker Desktop settings
# Allocate resources: 6 CPUs, 12GB RAM, 40GB disk

# For local development, adjust in .env:
KAFKA_STORAGE_SIZE=2Gi
ZOOKEEPER_STORAGE_SIZE=1Gi
```

## Configuration

Key variables in `.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `NEW_RELIC_LICENSE_KEY` | Your NR license | Required |
| `KAFKA_NAMESPACE` | K8s namespace | `kafka-monitoring` |
| `KAFKA_VERSION` | Kafka version | `7.5.0` |
| `ENABLE_SHARE_GROUPS` | Share Groups | `true` |

## Architecture

```
Kafka → JMX → Prometheus Exporter → New Relic
         ↓
    Share Groups → nri-flex → QueueSample Events
```

## Testing

```bash
# Access metrics
kubectl port-forward -n kafka-monitoring kafka-0 9404:9404
curl http://localhost:9404/metrics | grep sharegroup

# Produce messages
kubectl exec -it kafka-0 -n kafka-monitoring -- \
  kafka-console-producer --bootstrap-server localhost:9092 --topic share-group-topic

# Check logs
kubectl logs -n kafka-monitoring -l app=share-group-consumer
```

## Monitoring

### NRQL Queries

```sql
-- Unacked messages
SELECT latest(kafka_sharegroup_records_unacked) 
FROM Metric WHERE cluster = 'kafka-k8s-cluster' 
FACET group, topic, partition

-- Processing delay
SELECT latest(kafka_sharegroup_oldest_unacked_ms) / 1000 as 'Delay (sec)' 
FROM Metric WHERE cluster = 'kafka-k8s-cluster' 
FACET group, topic

-- Throughput
SELECT rate(sum(kafka_sharegroup_records_acknowledged), 1 minute) 
FROM Metric WHERE cluster = 'kafka-k8s-cluster' 
FACET group
```

### Key Metrics

- `kafka_sharegroup_records_unacked` - Messages being processed
- `kafka_sharegroup_oldest_unacked_ms` - Processing delay
- `kafka_sharegroup_records_acknowledged` - Completed messages
- `kafka_sharegroup_records_released` - Timed out messages
- `kafka_sharegroup_records_rejected` - Failed messages

## Troubleshooting

```bash
# Pod issues
kubectl describe pod kafka-0 -n kafka-monitoring
kubectl logs kafka-0 -n kafka-monitoring

# Metrics missing
kubectl exec -it kafka-0 -n kafka-monitoring -- \
  kafka-run-class kafka.tools.JmxTool \
  --jmx-url service:jmx:rmi:///jndi/rmi://localhost:9999/jmxrmi \
  --object-name "kafka.server:type=share-group-metrics,*"

# New Relic agent
kubectl logs -n kafka-monitoring -l app=newrelic-infrastructure
```

## Files

```
├── .env.example          # Configuration template
├── generate-configs.sh   # Generate YAML from templates
├── deploy.sh            # Deploy to Kubernetes
├── templates/           # YAML templates
│   ├── 01-kafka-zookeeper.yaml.tmpl
│   ├── 02-kafka-broker.yaml.tmpl
│   ├── 03-newrelic-configmap.yaml.tmpl
│   ├── 04-flex-configmap.yaml.tmpl
│   ├── 05-newrelic-daemonset.yaml.tmpl
│   └── 06-test-sharegroup-consumer.yaml.tmpl
└── generated/           # Generated YAML files (git ignored)
```

## Clean Up

```bash
kubectl delete namespace kafka-monitoring
```