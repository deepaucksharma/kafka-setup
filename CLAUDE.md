# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains a Kubernetes-based Kafka monitoring solution that addresses the "zero lag fallacy" by tracking actual message acknowledgment in Kafka Share Groups (Kafka 4.0 EA) rather than just offset positions. It integrates with New Relic for comprehensive observability.

## Core Architecture

The system consists of three monitoring layers:
1. **nri-kafka**: Collects traditional Kafka metrics (broker stats, topic metrics, consumer lag)
2. **nri-flex**: Scrapes Share Group metrics from Prometheus endpoint
3. **Custom OHI**: Transforms metrics into QueueSample events for New Relic's Queues & Streams UI

Data flow: Kafka → JMX → Prometheus Exporter → New Relic Infrastructure → New Relic Cloud

## Essential Commands

### Deployment
```bash
# Full deployment (generates configs and deploys)
./kafka-monitoring/deploy.sh

# Generate configs only
./kafka-monitoring/deploy.sh generate

# Check status
./kafka-monitoring/deploy.sh status

# Run test workload
./kafka-monitoring/deploy.sh test

# Clean up everything
./kafka-monitoring/deploy.sh clean

# Dry run (preview changes)
./kafka-monitoring/deploy.sh -n deploy
```

### Development & Testing
```bash
# Verify metrics endpoint
kubectl port-forward -n kafka-monitoring kafka-0 9404:9404
curl http://localhost:9404/metrics | grep sharegroup

# Produce test messages
kubectl exec -it kafka-0 -n kafka-monitoring -- \
  kafka-console-producer --bootstrap-server localhost:9092 --topic share-group-topic

# Check OHI logs
kubectl logs -n kafka-monitoring -l app=newrelic-infrastructure -c newrelic-infrastructure | grep sharegroup

# Verify QueueSample events in New Relic
# Use NRQL: SELECT * FROM QueueSample WHERE provider = 'kafka' SINCE 10 minutes ago
```

## Configuration Structure

The project uses environment-based configuration. Key variables in `.env`:
- `NEW_RELIC_LICENSE_KEY` (required)
- `KAFKA_NAMESPACE` (default: kafka-monitoring)
- `KAFKA_VERSION` (default: 7.5.0)
- `ENABLE_SHARE_GROUPS` (default: true)
- `PROMETHEUS_ENDPOINT` (default: http://kafka-0.kafka:9404/metrics)

Templates in `kafka-monitoring/templates/` are processed with `envsubst` to generate final YAML files in `generated/`.

## Key Implementation Details

### Share Group Metrics Mapping
The Custom OHI (`07-custom-ohi-configmap.yaml`) maps Kafka metrics to queue terminology:
- `kafka_sharegroup_records_unacked` → `queue.size`
- `kafka_sharegroup_oldest_unacked_ms` → `oldest.message.age.seconds`
- `kafka_sharegroup_records_acknowledged` → `messages.acknowledged`

### Deployment Order
The `deploy.sh` script ensures proper ordering:
1. Namespace and configs
2. Zookeeper and Kafka
3. Wait for Kafka readiness
4. New Relic monitoring components
5. Test consumers and OHI

### Troubleshooting Patterns
When metrics aren't appearing:
1. Check Prometheus endpoint directly
2. Verify OHI script execution
3. Validate New Relic license key
4. Review pod logs for errors

## Project-Specific Context

This implementation assumes Kafka 4.0 features (Share Groups) which may not be released. The setup includes placeholder configurations that simulate Share Group behavior for testing the monitoring infrastructure.

The "zero lag fallacy" refers to traditional monitoring showing zero consumer lag while messages are still being processed. This solution tracks actual unacknowledged messages for accurate backlog visibility.

## Related Components

- **DashBuilder**: Separate tool in `DashBuilder-main/` for programmatically creating New Relic dashboards
- **Comprehensive Documentation**: See `KAFKA_SHAREGROUP_MONITORING_COMPLETE.md` for full details