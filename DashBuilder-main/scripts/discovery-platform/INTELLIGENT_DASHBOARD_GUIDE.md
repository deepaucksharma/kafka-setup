# Intelligent Dashboard Generation Guide

## Overview

The Intelligent Dashboard Builder is an advanced system that automatically creates optimal New Relic dashboards based on discovered metrics. It uses sophisticated analysis algorithms to:

- Categorize metrics by type and behavior
- Detect correlations between metrics
- Identify golden signals (latency, traffic, errors, saturation)
- Suggest appropriate visualizations
- Generate insights and recommendations
- Create anomaly detection widgets
- Optimize dashboard layout

## Architecture

### Core Components

1. **IntelligentDashboardBuilder** (`intelligent-dashboard-builder.js`)
   - Main orchestrator for dashboard generation
   - Analyzes metrics and creates dashboard structure
   - Selects optimal visualizations based on metric characteristics

2. **AdvancedMetricAnalyzer** (`advanced-metric-analyzer.js`)
   - Performs deep metric analysis
   - Detects seasonality, trends, and anomalies
   - Calculates correlations between metrics
   - Assesses business impact and criticality

3. **DashboardBuilder** (`dashboard-builder.js`)
   - Integrates intelligent builder with standard dashboard creation
   - Provides fallback to standard dashboards
   - Handles dashboard deployment to New Relic

## How It Works

### 1. Metric Analysis

The system analyzes each discovered metric to determine:

```javascript
// Metric categorization patterns
{
  throughput: /\b(throughput|rate|persecond|persec|ops|tps|rps|qps)\b/i,
  latency: /\b(latency|duration|time|delay|response|wait)\b/i,
  error: /\b(error|fail|exception|timeout|reject|invalid)\b/i,
  utilization: /\b(percent|percentage|usage|utilization|ratio|cpu|memory|disk)\b/i,
  count: /\b(count|total|sum|number|size|length)\b/i,
  gauge: /\b(current|active|open|pending|queue|backlog)\b/i,
  bytes: /\b(bytes|size|memory|storage|bandwidth)\b/i,
  connection: /\b(connection|session|socket|client|thread)\b/i,
  business: /\b(revenue|cost|conversion|transaction|order|customer|user)\b/i
}
```

### 2. Visualization Selection

Based on metric type, the system selects optimal visualizations:

```javascript
// Visualization matrix
{
  throughput: { primary: 'line', secondary: 'area', tertiary: 'billboard' },
  latency: { primary: 'line', secondary: 'histogram', tertiary: 'heatmap' },
  error: { primary: 'line', secondary: 'bar', tertiary: 'billboard' },
  utilization: { primary: 'line', secondary: 'gauge', tertiary: 'billboard' },
  count: { primary: 'billboard', secondary: 'bar', tertiary: 'table' },
  gauge: { primary: 'billboard', secondary: 'gauge', tertiary: 'line' },
  bytes: { primary: 'area', secondary: 'line', tertiary: 'billboard' },
  connection: { primary: 'line', secondary: 'area', tertiary: 'table' },
  business: { primary: 'billboard', secondary: 'pie', tertiary: 'funnel' }
}
```

### 3. Golden Signals Mapping

The system automatically maps metrics to Google SRE's four golden signals:

- **Latency**: Response time, duration, delay metrics
- **Traffic**: Throughput, request rate, message rate
- **Errors**: Error rates, failures, timeouts
- **Saturation**: CPU, memory, queue depth, utilization

### 4. Dashboard Structure

Generated dashboards follow this structure:

1. **Golden Signals Overview** - Key performance indicators
2. **Category Pages** - Metrics grouped by type
3. **Anomaly Detection** - Baseline comparisons and anomaly alerts
4. **Correlations** - Related metrics for root cause analysis

## Usage

### Basic Usage

```javascript
const IntelligentDashboardBuilder = require('./intelligent-dashboard-builder');

const builder = new IntelligentDashboardBuilder({
  accountId: '12345',
  apiKey: 'your-api-key',
  enableAnomalyDetection: true,
  enableCorrelations: true
});

const result = await builder.buildDashboards(discoveryResults);
```

### With Discovery Platform

```bash
# Run intelligent dashboard generation for Kafka
node scripts/run-intelligent-kafka-dashboard.js

# Test with sample data
node scripts/test-intelligent-dashboard.js
```

### Configuration Options

```javascript
{
  accountId: 'required',              // New Relic account ID
  apiKey: 'required',                 // New Relic API key
  maxWidgetsPerPage: 12,              // Maximum widgets per dashboard page
  enableAnomalyDetection: true,       // Include anomaly detection widgets
  enableCorrelations: true,           // Detect and display correlations
  enablePredictions: true,            // Generate predictive insights
  region: 'US'                        // API region
}
```

## Features

### 1. Intelligent Metric Categorization

- Automatically categorizes metrics by analyzing names and patterns
- Maps metrics to appropriate visualization types
- Groups related metrics together

### 2. Correlation Detection

- Finds strongly correlated metrics
- Suggests monitoring correlated metrics together
- Helps with root cause analysis

### 3. Anomaly Detection

- Creates baseline comparison widgets
- Suggests anomaly detection alerts
- Identifies metrics suitable for predictive monitoring

### 4. Business Impact Assessment

- Identifies business-critical metrics
- Prioritizes metrics by impact
- Suggests appropriate alert thresholds

### 5. Layout Optimization

- Prevents widget overlap
- Optimizes visual flow
- Groups related widgets together

## Example: Kafka Dashboard

For a Kafka monitoring scenario, the intelligent builder will:

1. **Identify Golden Signals**:
   - Latency: `request.avgTimeFetch`, `request.avgTimeProduceRequest`
   - Traffic: `broker.messagesInPerSecond`, `broker.bytesInPerSecond`
   - Errors: `request.produceRequestsFailedPerSecond`, `consumer.requestsExpiredPerSecond`
   - Saturation: `request.handlerIdle`, `queue.size`

2. **Create Specialized Widgets**:
   - Broker performance trends (line charts)
   - Topic activity distribution (pie charts)
   - Consumer lag analysis (heatmaps)
   - Error rate monitoring (time series with thresholds)

3. **Generate Insights**:
   - Missing metrics recommendations
   - Alert configuration suggestions
   - Performance optimization tips

## Advanced Features

### Seasonality Detection

The system can detect:
- Hourly patterns (e.g., business hours)
- Daily patterns (e.g., batch jobs)
- Weekly patterns (e.g., weekend traffic)

### Trend Analysis

- Linear regression for trend detection
- R-squared calculation for confidence
- Percentage change predictions

### Forecastability Assessment

Evaluates metrics for predictive monitoring based on:
- Data completeness
- Seasonality strength
- Trend consistency
- Noise level

## Best Practices

1. **Data Requirements**:
   - At least 1 hour of data for basic analysis
   - 24 hours for seasonality detection
   - 1 week for weekly pattern detection

2. **Metric Naming**:
   - Use descriptive names that include metric type
   - Include units in metric names (e.g., `PerSecond`, `Percent`)
   - Follow consistent naming conventions

3. **Performance**:
   - Limit concurrent queries with `maxConcurrentQueries`
   - Use appropriate time ranges for discovery
   - Cache discovery results when possible

## Troubleshooting

### No Dashboards Created

```bash
# Check for available data
node scripts/simple-event-discovery.js

# Verify API permissions
node scripts/validate-keys.js
```

### Missing Widgets

- Ensure metrics have sufficient data
- Check metric naming patterns
- Verify event types are being collected

### Performance Issues

- Reduce time range for discovery
- Limit number of metrics analyzed
- Use sampling for large datasets

## Integration with CI/CD

```yaml
# Example GitHub Action
- name: Generate Dashboard
  run: |
    npm install
    node scripts/run-intelligent-kafka-dashboard.js
  env:
    NEW_RELIC_API_KEY: ${{ secrets.NEW_RELIC_API_KEY }}
    NEW_RELIC_ACCOUNT_ID: ${{ secrets.NEW_RELIC_ACCOUNT_ID }}
```

## Future Enhancements

1. **Machine Learning Integration**:
   - Automatic baseline learning
   - Predictive alerting
   - Anomaly scoring

2. **Template Library**:
   - Pre-built templates for common technologies
   - Industry-specific dashboards
   - Compliance-focused layouts

3. **Interactive Dashboard Builder**:
   - Real-time preview
   - Drag-and-drop customization
   - A/B testing for layouts

## Contributing

To add new metric patterns or visualization types:

1. Update `metricPatterns` in `intelligent-dashboard-builder.js`
2. Add visualization mappings to `visualizationMatrix`
3. Create widget generation methods for new types
4. Test with sample data

## Support

For issues or questions:
- Check the troubleshooting section
- Review example scripts
- Open an issue in the repository