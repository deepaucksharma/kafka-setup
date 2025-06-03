# NRQL CLI Guide for DashBuilder

This guide shows how to use the New Relic Query Language (NRQL) CLI tools in DashBuilder.

## Setup

1. **Environment Variables**
   The tools use credentials from the `.env` file in the parent directory:
   - `UKEY` or `NEW_RELIC_API_KEY` - Your New Relic API key
   - `ACC` or `NEW_RELIC_ACCOUNT_ID` - Your New Relic account ID

2. **Installation**
   ```bash
   cd scripts
   npm install
   ```

## Available Tools

### 1. Simple NRQL Query Runner

**File:** `run-nrql-query.js`

Run any NRQL query directly:

```bash
# Basic query
node run-nrql-query.js "SELECT count(*) FROM Transaction SINCE 1 hour ago"

# System metrics
node run-nrql-query.js "SELECT average(cpuPercent) FROM SystemSample TIMESERIES SINCE 1 hour ago"

# Show event types
node run-nrql-query.js "SHOW EVENT TYPES"

# Discover attributes
node run-nrql-query.js "SELECT keyset() FROM SystemSample SINCE 1 hour ago"
```

### 2. NRQL Examples Tool

**File:** `nrql-examples.js`

Provides categorized example queries:

```bash
# Run all examples
node nrql-examples.js

# List categories
node nrql-examples.js list

# Run specific category
node nrql-examples.js system    # System metrics
node nrql-examples.js metrics   # Metric exploration
node nrql-examples.js kafka     # Kafka-specific queries
node nrql-examples.js discovery # Schema discovery

# Run custom query
node nrql-examples.js "SELECT average(memoryUsedPercent) FROM SystemSample"
```

### 3. Full CLI Tool (nr-guardian)

**File:** `src/cli.js`

The comprehensive CLI with validation and optimization features:

```bash
# Validate NRQL query
node src/cli.js nrql validate "SELECT count(*) FROM Transaction"

# Optimize query
node src/cli.js nrql optimize "SELECT * FROM SystemSample"

# Explain query
node src/cli.js nrql explain "SELECT average(cpuPercent) FROM SystemSample FACET hostname"

# Auto-fix query issues
node src/cli.js nrql autofix "SELECT count(*) FROM InvalidEventType" --apply
```

## Common NRQL Patterns

### Discovery Queries

```bash
# List all event types
node run-nrql-query.js "SHOW EVENT TYPES"

# List attributes for an event type
node run-nrql-query.js "SELECT keyset() FROM SystemSample LIMIT 1"

# Find unique values
node run-nrql-query.js "SELECT uniques(hostname) FROM SystemSample SINCE 1 day ago"
```

### System Monitoring

```bash
# CPU usage over time
node run-nrql-query.js "SELECT average(cpuPercent) FROM SystemSample TIMESERIES AUTO SINCE 1 hour ago"

# Memory by host
node run-nrql-query.js "SELECT average(memoryUsedPercent) FROM SystemSample FACET hostname SINCE 1 hour ago"

# Top processes by CPU
node run-nrql-query.js "SELECT average(cpuPercent) FROM ProcessSample FACET processDisplayName LIMIT 10"
```

### Metric Exploration

```bash
# List all metrics
node run-nrql-query.js "SELECT uniques(metricName) FROM Metric SINCE 1 hour ago LIMIT 100"

# Metric values by name
node run-nrql-query.js "SELECT average(value) FROM Metric FACET metricName WHERE metricName LIKE 'host%' SINCE 1 hour ago"

# Metrics by dimension
node run-nrql-query.js "SELECT count(*) FROM Metric FACET dimensions() SINCE 1 hour ago"
```

### Kafka Monitoring

```bash
# Kafka metrics (if available)
node run-nrql-query.js "SELECT uniques(metricName) FROM Metric WHERE metricName LIKE 'kafka%'"

# Share group metrics
node run-nrql-query.js "SELECT latest(kafka_sharegroup_records_unacked) FROM Metric FACET group, topic, partition"

# JMX metrics
node run-nrql-query.js "SELECT average(value) FROM Metric WHERE metricName LIKE 'kafka.server%' FACET metricName"
```

### Data Usage

```bash
# Ingestion by source
node run-nrql-query.js "SELECT sum(GigabytesIngested) FROM NrConsumption FACET usageMetric SINCE 1 week ago"

# Query usage
node run-nrql-query.js "SELECT count(*) FROM NrdbQuery FACET user SINCE 1 day ago"

# API calls
node run-nrql-query.js "SELECT count(*) FROM Public_APICall FACET requestUri SINCE 1 hour ago"
```

## Advanced Features

### Query Validation

```bash
# Check syntax and execution
node src/cli.js nrql validate "SELECT count(*) FROM Transaction" --expect-no-error

# Validate with result expectations
node src/cli.js nrql validate "SELECT count(*) FROM SystemSample" --min-results 1
```

### Batch Processing

```bash
# Create a file with queries (one per line)
echo "SELECT count(*) FROM SystemSample
SELECT average(cpuPercent) FROM SystemSample
SHOW EVENT TYPES" > queries.txt

# Validate all queries
node src/cli.js nrql validate-file queries.txt --parallel
```

### Output Formats

```bash
# JSON output
node src/cli.js nrql validate "SELECT count(*) FROM SystemSample" --json

# Quiet mode (errors only)
node src/cli.js nrql validate "SELECT count(*) FROM SystemSample" --quiet
```

## Troubleshooting

### No Results
- Check time range: Add `SINCE` clause
- Verify event type exists: `SHOW EVENT TYPES`
- Check account has data: Try different event types

### Authentication Errors
- Verify `.env` file exists in parent directory
- Check API key has query permissions
- Ensure account ID is correct

### Query Errors
- Use `nrql validate` to check syntax
- Use `nrql explain` to understand query
- Use `nrql autofix` for common issues

## Examples for Dashboard Creation

Use these queries in your dashboards:

```javascript
// CPU Dashboard Widget
{
  query: "SELECT average(cpuPercent) FROM SystemSample TIMESERIES AUTO",
  title: "CPU Usage Over Time"
}

// Memory Dashboard Widget
{
  query: "SELECT average(memoryUsedPercent) FROM SystemSample FACET hostname",
  title: "Memory Usage by Host"
}

// Process Dashboard Widget
{
  query: "SELECT count(*) FROM ProcessSample FACET processDisplayName",
  title: "Process Count"
}
```

## Best Practices

1. **Use Time Ranges**: Always include `SINCE` clause for better performance
2. **Limit Results**: Use `LIMIT` to prevent large result sets
3. **Test First**: Validate queries before adding to dashboards
4. **Use Facets Wisely**: High-cardinality facets can be expensive
5. **Cache Results**: The tools cache results to reduce API calls

## Integration with DashBuilder

These queries can be used in:
- Dashboard generation scripts
- Metric discovery services
- Query validation in dashboards
- Real-time monitoring widgets

Example integration:
```javascript
const { NerdGraphClient } = require('./scripts/src/core/api-client.js');

const client = new NerdGraphClient({
  apiKey: process.env.UKEY,
  accountId: process.env.ACC
});

// Use in dashboard generation
const result = await client.nrql(accountId, "SELECT average(cpuPercent) FROM SystemSample");
```