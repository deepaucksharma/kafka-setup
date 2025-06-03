# New Relic Discovery Platform

A comprehensive, production-ready framework for discovering and analyzing all data points in a New Relic account with intelligent query routing, cost optimization, and automatic dashboard generation.

## 🚀 Features

### Core Discovery Capabilities
- **Exhaustive Data Discovery**: Automatically discovers all event types, metrics, traces, logs, and custom events
- **Intelligent Attribute Classification**: Analyzes and classifies attributes by data type, cardinality, and usage patterns
- **Relationship Mapping**: Discovers relationships between different data sources
- **Smart Query Generation**: Generates optimized NRQL queries based on discovered data
- **Insight Generation**: Produces actionable insights and recommendations

### Advanced Query Features (NerdGraph Integration)
- **Long-Running Queries**: Support for queries up to 10 minutes via NerdGraph
- **Data Plus Detection**: Automatically detects and utilizes Data Plus capabilities
- **Cost Estimation**: Real-time query cost estimation and tracking
- **Intelligent Query Routing**: Automatically routes queries to the optimal execution method
- **Async Query Support**: Handles large result sets with async queries
- **Query Optimization**: Automatic time window and sampling optimization

### Dashboard Integration
- **Automatic Dashboard Generation**: Creates comprehensive dashboards from discoveries
- **DashBuilder Integration**: Seamlessly integrates with the DashBuilder ecosystem
- **Template Export**: Exports dashboard configurations as reusable templates
- **Multi-Page Dashboards**: Organizes discoveries into logical dashboard pages

### Performance & Reliability
- **Rate Limiting**: Intelligent rate limiting to stay within API limits
- **Progress Management**: Checkpoint-based progress saving and resumption
- **Parallel Processing**: Concurrent query execution with configurable limits
- **Caching**: LRU cache for query results to improve performance
- **Error Recovery**: Automatic retry with exponential backoff

## 📋 Prerequisites

- Node.js 14 or higher
- New Relic account with API access
- User API key with appropriate permissions

## 🛠️ Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your New Relic credentials
```

## 🚀 Quick Start

### Basic Discovery
```bash
# Run discovery on your account
./scripts/discovery-platform/index.js

# With specific options
./scripts/discovery-platform/index.js \
  --maxEventTypes 20 \
  --maxAttributes 50 \
  --generateDashboard true
```

### Discovery to Dashboard Pipeline
```bash
# Full pipeline: discover data and create dashboard
./scripts/discovery-to-dashboard.js

# With options
./scripts/discovery-to-dashboard.js \
  --account YOUR_ACCOUNT_ID \
  --max-event-types 50 \
  --output-dir ./my-discoveries
```

### Test NerdGraph Features
```bash
# Test long-running queries and Data Plus
./scripts/test-discovery-nerdgraph.js
```

## 📖 Usage

### Command Line Options

```bash
./scripts/discovery-to-dashboard.js [options]

Options:
  -a, --account <id>          New Relic account ID
  -k, --api-key <key>         New Relic API key
  -r, --region <region>       New Relic region (US/EU) (default: "US")
  --max-event-types <n>       Maximum event types to process (default: 50)
  --max-attributes <n>        Maximum attributes per event type (default: 100)
  --no-metrics               Skip metric discovery
  --no-traces                Skip trace discovery
  --no-logs                  Skip log discovery
  --no-dashboard             Skip dashboard generation
  --dry-run                  Run discovery without creating dashboard
  --export-only              Export results without creating dashboard
  --resume                   Resume from previous progress
  --force-nerdgraph          Force all queries through NerdGraph
  --cost-limit <n>           Maximum estimated cost (default: 1000)
  --output-dir <dir>         Output directory (default: "./discovery-output")
```

### Programmatic Usage

```javascript
const DiscoveryPlatform = require('./scripts/discovery-platform');

const platform = new DiscoveryPlatform({
  apiKey: 'YOUR_API_KEY',
  accountId: 'YOUR_ACCOUNT_ID',
  region: 'US',
  
  // Discovery options
  maxEventTypesToProcess: 50,
  maxAttributesPerEventType: 100,
  
  // Features
  discoverMetrics: true,
  discoverTraces: true,
  discoverLogs: true,
  generateDashboard: true,
  
  // Performance
  maxConcurrentQueries: 10,
  enableCache: true
});

// Event handlers
platform.on('dataPlusDetected', (dataPlus) => {
  console.log('Data Plus capabilities:', dataPlus);
});

platform.on('discovery', ({ type, data }) => {
  console.log(`Discovered ${type}:`, data.name);
});

// Run discovery
const discoveries = await platform.discover();
```

## 🏗️ Architecture

### Core Components

1. **DiscoveryPlatform** (`index.js`)
   - Main orchestrator
   - Manages discovery phases
   - Coordinates all components

2. **NerdGraphQueryExecutor** (`lib/nerdgraph-query-executor.js`)
   - Intelligent query routing
   - Long-running query support
   - Cost estimation and tracking
   - Data Plus detection

3. **DiscoveryEngine** (`lib/discovery-engine.js`)
   - Core discovery logic
   - Service, operation, and pattern discovery
   - Metadata extraction

4. **QueryOptimizer** (`lib/query-optimizer.js`)
   - Query optimization strategies
   - Sampling and time window optimization
   - Query generation

5. **DataAnalyzer** (`lib/data-analyzer.js`)
   - Data quality analysis
   - Relationship discovery
   - Insight generation

6. **DashboardIntegration** (`lib/dashboard-integration.js`)
   - Converts discoveries to dashboard configs
   - Integrates with DashBuilder
   - Template generation

### Discovery Phases

1. **Data Source Discovery**
   - Event types with volume analysis
   - Attribute discovery and classification
   - Metric discovery and grouping
   - Trace and service discovery
   - Log pattern analysis

2. **Data Analysis**
   - Quality assessment
   - Relationship mapping
   - Pattern recognition
   - Anomaly detection

3. **Insight Generation**
   - Performance insights
   - Cost optimization recommendations
   - Data quality improvements
   - Architecture insights

4. **Dashboard Creation**
   - Multi-page dashboard generation
   - Widget optimization
   - Query distribution
   - Visual hierarchy

5. **Export & Reporting**
   - JSON data export
   - Markdown reports
   - Query library
   - Dashboard templates

## 📊 Output

### Discovery Results
```json
{
  "eventTypes": [
    {
      "name": "Transaction",
      "volume": 1000000,
      "attributes": {
        "duration": {
          "type": "numeric",
          "dataType": "float",
          "statistics": {
            "avg": 0.5,
            "min": 0.01,
            "max": 10.0
          }
        }
      },
      "metadata": {
        "entityCount": 50,
        "hostCount": 10
      }
    }
  ],
  "metrics": [...],
  "insights": [...],
  "recommendations": [...],
  "dashboardUrl": "https://one.newrelic.com/..."
}
```

### Generated Files
- `discovery-{accountId}-{timestamp}-full.json` - Complete discovery data
- `discovery-{accountId}-{timestamp}-summary.md` - Human-readable report
- `discovery-{accountId}-{timestamp}-queries.json` - Generated NRQL queries
- `discovery-{accountId}-{timestamp}-insights.json` - Insights and recommendations
- `discovery-{accountId}-{timestamp}-template.json` - Dashboard template

## 🔧 Configuration

### Environment Variables
```bash
# Required
NEW_RELIC_API_KEY=your-api-key
NEW_RELIC_ACCOUNT_ID=your-account-id

# Optional
NEW_RELIC_REGION=US
DEBUG=true
```

### Progress Management
The platform automatically saves progress to allow resumption:
```bash
# Resume previous discovery
./scripts/discovery-to-dashboard.js --resume

# Custom progress file
./scripts/discovery-to-dashboard.js --progress-file my-progress.json
```

## 📈 Performance Considerations

### Query Optimization
- Automatic sampling for high-volume data
- Time window optimization on failures
- Intelligent query batching
- Result caching

### Rate Limiting
- Configurable queries per minute (default: 2500)
- Automatic backoff on rate limits
- Concurrent query limits

### Cost Management
- Real-time cost estimation
- Cost tracking by category
- Configurable cost limits
- Query method optimization

## 🐛 Troubleshooting

### Common Issues

1. **Rate Limit Errors**
   - Reduce `queriesPerMinute` configuration
   - Decrease `maxConcurrentQueries`

2. **Timeout Errors**
   - Enable NerdGraph for long queries: `--force-nerdgraph`
   - Increase `queryTimeout` configuration

3. **Memory Issues**
   - Reduce `maxEventTypesToProcess`
   - Enable progress saving for large discoveries

4. **Missing Dependencies**
   ```bash
   npm install
   ```

### Debug Mode
```bash
# Enable debug logging
DEBUG=true ./scripts/discovery-to-dashboard.js
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is part of the DashBuilder ecosystem.