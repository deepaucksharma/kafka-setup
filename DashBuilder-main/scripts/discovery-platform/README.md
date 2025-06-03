# New Relic Discovery Platform 2.0

A comprehensive, production-ready framework for discovering and analyzing all data points in a New Relic account. This platform addresses all the limitations of basic discovery scripts with intelligent sampling, parallel processing, progress management, and specialized Kafka monitoring support.

## Features

### Core Capabilities
- **Parallel Processing**: Execute multiple queries concurrently with rate limiting
- **Intelligent Sampling**: Automatically adjust sampling based on data volume
- **Progress Management**: Save/resume discovery sessions with automatic checkpoints
- **Rate Limiting**: Stay within New Relic's API limits (3000 queries/minute)
- **Timeout Handling**: Gracefully handle long-running queries with automatic retry
- **Comprehensive Discovery**: Event types, metrics, traces, logs, custom events, and relationships

### Advanced Features
- **Kafka Specialization**: Prioritized discovery for Kafka and Share Groups monitoring
- **Data Quality Analysis**: Automatic assessment of data completeness and quality
- **Relationship Mapping**: Discover connections between different data types
- **Intelligent Query Generation**: Create optimized queries based on discovered data
- **Dashboard Creation**: Automatically build comprehensive dashboards
- **Export Capabilities**: Export all discoveries and insights to JSON/Markdown

## Installation

```bash
# Install dependencies
npm install

# Make executable
chmod +x index.js

# Optional: Link globally
npm link
```

## Configuration

Create a `.env` file in the parent directory:

```env
NEW_RELIC_API_KEY=your_api_key_here
NEW_RELIC_ACCOUNT_ID=your_account_id
NEW_RELIC_REGION=US  # or EU
```

## Usage

### Basic Discovery
```bash
# Run full discovery with all features
./index.js

# Or use npm script
npm run discover
```

### Kafka-Focused Discovery
```bash
# Prioritize Kafka and queue-related data
npm run discover:kafka

# Or with CLI options
./index.js --discoverCustomEvents=true --maxEventTypesToProcess=20
```

### Quick Discovery
```bash
# Fast discovery with limited scope
npm run discover:quick

# Or specify options
./index.js --maxEventTypesToProcess=10 --generateDashboard=false
```

### Custom Configuration
```bash
./index.js \
  --maxConcurrentQueries=20 \
  --queriesPerMinute=2000 \
  --maxAttributesPerEventType=50 \
  --generateDashboard=true \
  --exportResults=true
```

## CLI Options

| Option | Default | Description |
|--------|---------|-------------|
| `--apiKey` | env var | New Relic API key |
| `--accountId` | env var | New Relic account ID |
| `--region` | US | API region (US or EU) |
| `--maxConcurrentQueries` | 10 | Maximum parallel queries |
| `--queriesPerMinute` | 2500 | Rate limit for queries |
| `--queryTimeout` | 30000 | Query timeout in ms |
| `--maxEventTypesToProcess` | 50 | Max event types to analyze |
| `--maxAttributesPerEventType` | 100 | Max attributes per event |
| `--generateDashboard` | true | Create dashboard after discovery |
| `--exportResults` | true | Export results to files |
| `--discoverMetrics` | true | Discover metric data |
| `--discoverTraces` | true | Discover distributed traces |
| `--discoverLogs` | true | Discover log data |
| `--saveProgress` | true | Enable progress saving |

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────┐
│                Discovery Platform                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐│
│  │   Rate      │  │   Progress   │  │   Query    ││
│  │  Limiter    │  │   Manager    │  │ Optimizer  ││
│  └─────────────┘  └──────────────┘  └────────────┘│
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐│
│  │ Discovery   │  │    Data      │  │ Dashboard  ││
│  │   Engine    │  │  Analyzer    │  │  Builder   ││
│  └─────────────┘  └──────────────┘  └────────────┘│
│                                                     │
└─────────────────────────────────────────────────────┘
                           │
                           ▼
                    New Relic API
```

### Key Components

1. **Rate Limiter**: Token bucket algorithm with concurrent execution limits
2. **Progress Manager**: Checkpoint system with atomic saves and backups
3. **Discovery Engine**: Parallel attribute classification and sampling
4. **Query Optimizer**: Intelligent query generation and timeout handling
5. **Data Analyzer**: Quality assessment and relationship discovery
6. **Dashboard Builder**: Multi-page dashboard creation with specialized views

## Discovery Process

### Phase 1: Data Source Discovery
- Discover all event types with volume analysis
- Prioritize based on volume and relevance
- Special handling for Kafka/Queue data

### Phase 2: Attribute Analysis
- Classify attributes (numeric, string, boolean)
- Collect statistics and sample values
- Identify high-cardinality attributes

### Phase 3: Metric Discovery
- Group metrics by prefix/pattern
- Analyze metric dimensions
- Focus on important metric categories

### Phase 4: Analysis & Insights
- Data quality assessment
- Relationship mapping
- Pattern recognition
- Generate recommendations

### Phase 5: Output Generation
- Create optimized NRQL queries
- Build comprehensive dashboard
- Export results and insights

## Progress Management

The platform automatically saves progress every minute and can resume interrupted sessions:

```bash
# Progress is saved to:
discovery-progress-{accountId}.json

# Resume a previous session
./index.js  # Automatically detects and resumes

# Force fresh start
rm discovery-progress-*.json
./index.js
```

## Output Files

After discovery completes, find results in:

```
discovery-export-{accountId}-{timestamp}/
├── discovery-complete.json     # Full discovery data
├── discovery-summary.md        # Human-readable summary
├── generated-queries.json      # All generated NRQL queries
└── dashboard-config.json       # Dashboard configuration
```

## Kafka Monitoring Focus

The platform includes special handling for Kafka monitoring:

1. **Prioritization**: Kafka-related event types are discovered first
2. **Share Groups**: Special queries for QueueSample events
3. **Specialized Dashboard**: Dedicated Kafka monitoring page
4. **Zero Lag Fallacy**: Comparison queries for traditional vs share group metrics

## Performance Optimizations

1. **Parallel Processing**: Process multiple attributes concurrently
2. **Intelligent Sampling**: Reduce data scanned for high-volume event types
3. **Query Caching**: Cache frequently used queries
4. **Timeout Handling**: Automatically retry with smaller time windows
5. **Batch Operations**: Group similar queries for efficiency

## Error Handling

The platform includes comprehensive error handling:

- Automatic retry for timeout errors
- Graceful degradation for failed queries
- Progress saving on errors
- Detailed error logging
- Continue discovery even with partial failures

## Monitoring the Discovery

Watch the discovery progress in real-time:

```bash
# View console output with emojis
./index.js

# Check detailed logs
tail -f logs/discovery.log

# Monitor errors only
tail -f logs/error.log
```

## Best Practices

1. **Start with Quick Discovery**: Use `--maxEventTypesToProcess=10` for initial runs
2. **Monitor Rate Limits**: Watch for rate limit warnings in logs
3. **Use Progress Saves**: Don't disable progress saving for long discoveries
4. **Export Results**: Always export results for future reference
5. **Review Insights**: Check the insights and recommendations section

## Troubleshooting

### Discovery Timeout
```bash
# Reduce concurrent queries
./index.js --maxConcurrentQueries=5

# Increase timeout
./index.js --queryTimeout=60000
```

### Rate Limit Issues
```bash
# Reduce queries per minute
./index.js --queriesPerMinute=1000
```

### Memory Issues
```bash
# Process fewer event types
./index.js --maxEventTypesToProcess=20
```

### Resume Failed Discovery
```bash
# Discovery auto-resumes from last checkpoint
./index.js

# Force restart
rm discovery-progress-*.json && ./index.js
```

## Examples

### Kafka-Specific Discovery
```bash
./index.js \
  --maxEventTypesToProcess=30 \
  --discoverCustomEvents=true \
  --maxAttributesPerEventType=50
```

### Production Discovery
```bash
./index.js \
  --maxConcurrentQueries=20 \
  --queriesPerMinute=2000 \
  --saveProgress=true \
  --exportResults=true
```

### Development/Testing
```bash
./index.js \
  --maxEventTypesToProcess=5 \
  --generateDashboard=false \
  --exportResults=false
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new features
4. Submit a pull request

## License

MIT License - See LICENSE file for details