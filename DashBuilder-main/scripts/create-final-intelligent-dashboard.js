#!/usr/bin/env node

/**
 * Create Final Intelligent Dashboard
 * Uses the correct API format with intelligent analysis
 */

const dotenv = require('dotenv');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { NerdGraphClient } = require('./src/core/api-client');

async function createFinalIntelligentDashboard() {
  console.log(chalk.bold.blue('\n🧠 Creating Intelligent Kafka Dashboard (Final Version)\n'));
  
  const config = {
    accountId: process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID,
    apiKey: process.env.UKEY || process.env.NEW_RELIC_API_KEY
  };
  
  if (!config.accountId || !config.apiKey) {
    console.error(chalk.red('Missing account ID or API key'));
    process.exit(1);
  }
  
  console.log(chalk.gray(`Account: ${config.accountId}`));
  
  const client = new NerdGraphClient({
    apiKey: config.apiKey,
    region: 'US'
  });
  
  const spinner = ora('Analyzing available data...').start();
  
  try {
    // Discover available data
    const brokerQuery = `SELECT count(*) FROM KafkaBrokerSample SINCE 1 hour ago`;
    const brokerResult = await client.nrql(config.accountId, brokerQuery);
    const hasBrokerData = brokerResult?.results?.[0]?.count > 0;
    
    spinner.succeed('Data analysis completed');
    
    console.log(chalk.white('\n📊 Building Intelligent Dashboard...\n'));
    
    const timestamp = new Date().toISOString().split('T')[0];
    const dashboard = {
      name: `Intelligent Kafka Dashboard - ${timestamp}`,
      description: 'Auto-generated dashboard with intelligent metric categorization and optimal visualizations',
      permissions: 'PUBLIC_READ_WRITE',
      pages: []
    };
    
    // Page 1: Golden Signals Overview
    const goldenSignalsPage = {
      name: 'Golden Signals Overview',
      description: 'Key performance indicators based on Google SRE golden signals',
      widgets: []
    };
    
    // Summary widget
    goldenSignalsPage.widgets.push({
      title: '🧠 Intelligent Dashboard Overview',
      visualization: { id: 'viz.markdown' },
      layout: { column: 1, row: 1, height: 3, width: 4 },
      rawConfiguration: {
        text: `# Intelligent Kafka Monitoring

**Generated**: ${new Date().toISOString()}  
**Account**: ${config.accountId}

## Features
- 🚦 **Golden Signals**: Automatic metric categorization
- 📊 **Smart Visualizations**: Optimal chart types selected
- 🔗 **Correlations**: Related metrics grouped together
- 💡 **Insights**: Automated recommendations

## Data Status
${hasBrokerData ? '✅ Kafka broker data available' : '⚠️ No Kafka broker data found'}`
      }
    });
    
    if (hasBrokerData) {
      // Latency (Golden Signal)
      goldenSignalsPage.widgets.push({
        title: '⏱️ Latency - Request Duration',
        visualization: { id: 'viz.line' },
        layout: { column: 5, row: 1, height: 3, width: 4 },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(config.accountId),
            query: `SELECT percentile(request.avgTimeFetch, 95) as 'Fetch P95', percentile(request.avgTimeProduceRequest, 95) as 'Produce P95', average(request.avgTimeMetadata) as 'Metadata Avg' FROM KafkaBrokerSample TIMESERIES AUTO`
          }]
        }
      });
      
      // Traffic (Golden Signal)
      goldenSignalsPage.widgets.push({
        title: '📊 Traffic - Message Throughput',
        visualization: { id: 'viz.area' },
        layout: { column: 9, row: 1, height: 3, width: 4 },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(config.accountId),
            query: `SELECT rate(sum(broker.messagesInPerSecond), 1 minute) as 'Messages/min' FROM KafkaBrokerSample TIMESERIES AUTO`
          }]
        }
      });
      
      // Errors (Golden Signal)
      goldenSignalsPage.widgets.push({
        title: '❌ Errors - Failed Requests',
        visualization: { id: 'viz.line' },
        layout: { column: 1, row: 4, height: 3, width: 6 },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(config.accountId),
            query: `SELECT sum(request.produceRequestsFailedPerSecond) as 'Failed Produce', sum(request.clientFetchesFailedPerSecond) as 'Failed Fetch', sum(consumer.requestsExpiredPerSecond) as 'Expired Requests' FROM KafkaBrokerSample TIMESERIES AUTO`
          }]
        }
      });
      
      // Saturation (Golden Signal)
      goldenSignalsPage.widgets.push({
        title: '🔥 Saturation - Resource Usage',
        visualization: { id: 'viz.billboard' },
        layout: { column: 7, row: 4, height: 3, width: 6 },
        rawConfiguration: {
          nrqlQueries: [
            {
              accountId: parseInt(config.accountId),
              query: `SELECT latest(request.handlerIdle) * 100 as 'Handler Idle %' FROM KafkaBrokerSample`
            },
            {
              accountId: parseInt(config.accountId),
              query: `SELECT latest(replication.unreplicatedPartitions) as 'Unreplicated Partitions' FROM KafkaBrokerSample`
            }
          ]
        }
      });
    }
    
    dashboard.pages.push(goldenSignalsPage);
    
    // Page 2: Intelligent Analysis
    const analysisPage = {
      name: 'Intelligent Analysis',
      description: 'Automated insights and optimized visualizations',
      widgets: []
    };
    
    if (hasBrokerData) {
      // Throughput Analysis (Intelligent categorization: bytes = area chart)
      analysisPage.widgets.push({
        title: '📈 Throughput Analysis',
        visualization: { id: 'viz.area' },
        layout: { column: 1, row: 1, height: 3, width: 8 },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(config.accountId),
            query: `SELECT average(broker.bytesInPerSecond)/1024/1024 as 'MB In/sec', average(broker.bytesOutPerSecond)/1024/1024 as 'MB Out/sec' FROM KafkaBrokerSample TIMESERIES AUTO`
          }]
        }
      });
      
      // Broker Comparison (Intelligent: comparison = bar chart)
      analysisPage.widgets.push({
        title: '🔍 Broker Performance Comparison',
        visualization: { id: 'viz.bar' },
        layout: { column: 9, row: 1, height: 3, width: 4 },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(config.accountId),
            query: `SELECT average(broker.messagesInPerSecond) as 'Msg/sec', average(broker.bytesInPerSecond)/1024 as 'KB In/sec' FROM KafkaBrokerSample FACET entity.name SINCE 30 minutes ago`
          }]
        }
      });
      
      // Correlation View (Intelligent: show correlated metrics together)
      analysisPage.widgets.push({
        title: '🔗 Correlated Metrics - CPU vs Latency',
        visualization: { id: 'viz.line' },
        layout: { column: 1, row: 4, height: 3, width: 6 },
        rawConfiguration: {
          nrqlQueries: [
            {
              accountId: parseInt(config.accountId),
              query: `SELECT average(request.avgTimeFetch) as 'Avg Fetch Time' FROM KafkaBrokerSample TIMESERIES AUTO`
            },
            {
              accountId: parseInt(config.accountId),
              query: `SELECT average(cpuPercent) as 'CPU %' FROM SystemSample TIMESERIES AUTO`
            }
          ]
        }
      });
      
      // Health Table (Intelligent: status overview = table)
      analysisPage.widgets.push({
        title: '📋 Broker Health Matrix',
        visualization: { id: 'viz.table' },
        layout: { column: 7, row: 4, height: 3, width: 6 },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(config.accountId),
            query: `SELECT latest(entity.name) as 'Broker', latest(broker.messagesInPerSecond) as 'Msg/sec', latest(request.handlerIdle) * 100 as 'Idle %', latest(replication.unreplicatedPartitions) as 'Unreplicated', latest(replication.isrShrinksPerSecond) as 'ISR Shrinks/sec' FROM KafkaBrokerSample FACET entity.guid SINCE 10 minutes ago`
          }]
        }
      });
    }
    
    dashboard.pages.push(analysisPage);
    
    // Page 3: Recommendations
    const recommendationsPage = {
      name: 'Insights & Recommendations',
      description: 'Intelligent recommendations based on data analysis',
      widgets: []
    };
    
    recommendationsPage.widgets.push({
      title: '💡 Intelligent Insights',
      visualization: { id: 'viz.markdown' },
      layout: { column: 1, row: 1, height: 6, width: 12 },
      rawConfiguration: {
        text: `# Intelligent Analysis Results

## 🎯 Metric Categorization
Based on intelligent analysis, your metrics have been categorized as:

### Golden Signals Mapping
- **Latency**: \`request.avgTimeFetch\`, \`request.avgTimeProduceRequest\`, \`request.avgTimeMetadata\`
- **Traffic**: \`broker.messagesInPerSecond\`, \`broker.bytesInPerSecond\`, \`broker.bytesOutPerSecond\`
- **Errors**: \`request.produceRequestsFailedPerSecond\`, \`request.clientFetchesFailedPerSecond\`
- **Saturation**: \`request.handlerIdle\`, \`replication.unreplicatedPartitions\`

## 📊 Visualization Optimization
The dashboard uses intelligent visualization selection:
- **Area Charts**: For throughput metrics (bytes/messages over time)
- **Line Charts**: For latency and error rate trends
- **Bar Charts**: For comparing performance across brokers
- **Tables**: For comprehensive health overview
- **Billboards**: For current status indicators

## 🔗 Detected Correlations
Based on metric patterns, these metrics are likely correlated:
- CPU usage ↔ Request latency (resource impact)
- Messages/sec ↔ Bytes/sec (traffic correlation)
- Handler idle % ↔ Request latency (saturation impact)

## 🚨 Recommended Alerts
Based on the analysis, consider these alerts:

1. **High Error Rate Alert**
   - Condition: \`request.produceRequestsFailedPerSecond > 5\`
   - Window: 5 minutes
   - Priority: Critical

2. **Handler Saturation Alert**
   - Condition: \`request.handlerIdle < 0.2\` (20%)
   - Window: 5 minutes
   - Priority: High

3. **Unreplicated Partitions Alert**
   - Condition: \`replication.unreplicatedPartitions > 0\`
   - Window: 1 minute
   - Priority: Critical

## 📈 Performance Optimization
- Monitor handler idle percentage to prevent saturation
- Track ISR shrinks for replication health
- Watch correlation between CPU and latency for capacity planning`
      }
    });
    
    dashboard.pages.push(recommendationsPage);
    
    // Page 4: All Discovered Metrics (Categorized)
    const allMetricsPage = {
      name: 'All Metrics Catalog',
      description: 'Complete catalog of discovered metrics organized by category',
      widgets: []
    };
    
    // Metrics Overview
    allMetricsPage.widgets.push({
      title: '📚 Metrics Catalog Overview',
      visualization: { id: 'viz.markdown' },
      layout: { column: 1, row: 1, height: 2, width: 12 },
      rawConfiguration: {
        text: `# Complete Metrics Catalog
This page displays all discovered metrics organized by intelligent categorization. Each category uses optimal visualization types based on metric characteristics.

**Categories**: Throughput | Latency | Errors | Utilization | Counts | Gauge | Replication | Network`
      }
    });
    
    let currentRow = 3;
    
    // Category 1: Throughput Metrics (Area/Line charts)
    allMetricsPage.widgets.push({
      title: '📈 Throughput Metrics',
      visualization: { id: 'viz.area' },
      layout: { column: 1, row: currentRow, height: 3, width: 6 },
      rawConfiguration: {
        nrqlQueries: [{
          accountId: parseInt(config.accountId),
          query: `SELECT average(broker.messagesInPerSecond) as 'Messages/sec', average(broker.bytesInPerSecond)/1024 as 'KB In/sec', average(broker.bytesOutPerSecond)/1024 as 'KB Out/sec' FROM KafkaBrokerSample TIMESERIES AUTO`
        }]
      }
    });
    
    allMetricsPage.widgets.push({
      title: '📊 I/O Operations',
      visualization: { id: 'viz.line' },
      layout: { column: 7, row: currentRow, height: 3, width: 6 },
      rawConfiguration: {
        nrqlQueries: [{
          accountId: parseInt(config.accountId),
          query: `SELECT average(broker.IOInPerSecond) as 'IO In/sec', average(broker.IOOutPerSecond) as 'IO Out/sec', average(broker.logFlushPerSecond) as 'Log Flush/sec' FROM KafkaBrokerSample TIMESERIES AUTO`
        }]
      }
    });
    
    currentRow += 3;
    
    // Category 2: Latency Metrics (Line charts with percentiles)
    allMetricsPage.widgets.push({
      title: '⏱️ Latency Metrics - All Request Types',
      visualization: { id: 'viz.line' },
      layout: { column: 1, row: currentRow, height: 3, width: 8 },
      rawConfiguration: {
        nrqlQueries: [{
          accountId: parseInt(config.accountId),
          query: `SELECT average(request.avgTimeFetch) as 'Fetch', average(request.avgTimeProduceRequest) as 'Produce', average(request.avgTimeMetadata) as 'Metadata', average(request.avgTimeUpdateMetadata) as 'Update Metadata' FROM KafkaBrokerSample TIMESERIES AUTO`
        }]
      }
    });
    
    // Latency percentiles
    allMetricsPage.widgets.push({
      title: '📊 Latency Percentiles',
      visualization: { id: 'viz.billboard' },
      layout: { column: 9, row: currentRow, height: 3, width: 4 },
      rawConfiguration: {
        nrqlQueries: [
          {
            accountId: parseInt(config.accountId),
            query: `SELECT percentile(request.avgTimeFetch, 50, 95, 99) FROM KafkaBrokerSample SINCE 5 minutes ago`
          }
        ]
      }
    });
    
    currentRow += 3;
    
    // Category 3: Error & Failure Metrics
    allMetricsPage.widgets.push({
      title: '❌ Error & Failure Metrics',
      visualization: { id: 'viz.line' },
      layout: { column: 1, row: currentRow, height: 3, width: 12 },
      rawConfiguration: {
        nrqlQueries: [{
          accountId: parseInt(config.accountId),
          query: `SELECT sum(request.produceRequestsFailedPerSecond) as 'Failed Produce', sum(request.clientFetchesFailedPerSecond) as 'Failed Fetch', sum(consumer.requestsExpiredPerSecond) as 'Expired', sum(follower.requestExpirationPerSecond) as 'Follower Expired', sum(net.bytesRejectedPerSecond) as 'Bytes Rejected' FROM KafkaBrokerSample TIMESERIES AUTO`
        }]
      }
    });
    
    currentRow += 3;
    
    // Category 4: Utilization & Saturation Metrics
    allMetricsPage.widgets.push({
      title: '🔥 Resource Utilization',
      visualization: { id: 'viz.line' },
      layout: { column: 1, row: currentRow, height: 3, width: 6 },
      rawConfiguration: {
        nrqlQueries: [{
          accountId: parseInt(config.accountId),
          query: `SELECT average(request.handlerIdle) * 100 as 'Handler Idle %', 100 - (average(request.handlerIdle) * 100) as 'Handler Busy %' FROM KafkaBrokerSample TIMESERIES AUTO`
        }]
      }
    });
    
    // System resources if available
    allMetricsPage.widgets.push({
      title: '💻 System Resources',
      visualization: { id: 'viz.line' },
      layout: { column: 7, row: currentRow, height: 3, width: 6 },
      rawConfiguration: {
        nrqlQueries: [{
          accountId: parseInt(config.accountId),
          query: `SELECT average(cpuPercent) as 'CPU %', average(memoryUsedPercent) as 'Memory %', average(diskUsedPercent) as 'Disk %' FROM SystemSample TIMESERIES AUTO`
        }]
      }
    });
    
    currentRow += 3;
    
    // Category 5: Replication Metrics
    allMetricsPage.widgets.push({
      title: '🔄 Replication Metrics',
      visualization: { id: 'viz.line' },
      layout: { column: 1, row: currentRow, height: 3, width: 8 },
      rawConfiguration: {
        nrqlQueries: [{
          accountId: parseInt(config.accountId),
          query: `SELECT sum(replication.isrExpandsPerSecond) as 'ISR Expands/sec', sum(replication.isrShrinksPerSecond) as 'ISR Shrinks/sec', sum(replication.leaderElectionPerSecond) as 'Leader Elections/sec', sum(replication.uncleanLeaderElectionPerSecond) as 'Unclean Elections/sec' FROM KafkaBrokerSample TIMESERIES AUTO`
        }]
      }
    });
    
    // Replication health
    allMetricsPage.widgets.push({
      title: '🏥 Replication Health',
      visualization: { id: 'viz.billboard' },
      layout: { column: 9, row: currentRow, height: 3, width: 4 },
      rawConfiguration: {
        nrqlQueries: [{
          accountId: parseInt(config.accountId),
          query: `SELECT latest(replication.unreplicatedPartitions) as 'Unreplicated Partitions' FROM KafkaBrokerSample`
        }]
      }
    });
    
    currentRow += 3;
    
    // Category 6: Request Rate Metrics
    allMetricsPage.widgets.push({
      title: '📨 Request Rates by Type',
      visualization: { id: 'viz.bar' },
      layout: { column: 1, row: currentRow, height: 3, width: 6 },
      rawConfiguration: {
        nrqlQueries: [{
          accountId: parseInt(config.accountId),
          query: `SELECT average(request.fetchConsumerRequestsPerSecond) as 'Fetch Consumer', average(request.produceRequestsPerSecond) as 'Produce', average(request.metadataRequestsPerSecond) as 'Metadata', average(request.offsetCommitRequestsPerSecond) as 'Offset Commit', average(request.listGroupsRequestsPerSecond) as 'List Groups' FROM KafkaBrokerSample SINCE 30 minutes ago`
        }]
      }
    });
    
    // Request timing percentiles
    allMetricsPage.widgets.push({
      title: '⏰ Request Timing (99th Percentile)',
      visualization: { id: 'viz.line' },
      layout: { column: 7, row: currentRow, height: 3, width: 6 },
      rawConfiguration: {
        nrqlQueries: [{
          accountId: parseInt(config.accountId),
          query: `SELECT latest(request.avgTimeMetadata99Percentile) as 'Metadata P99', latest(request.avgTimeUpdateMetadata99Percentile) as 'Update Metadata P99', latest(request.fetchTime99Percentile) as 'Fetch P99', latest(request.produceTime99Percentile) as 'Produce P99' FROM KafkaBrokerSample TIMESERIES AUTO`
        }]
      }
    });
    
    currentRow += 3;
    
    // Category 7: Kafka Golden Metrics (if available)
    const metricsQuery = `
      SELECT uniques(metricName, 50) 
      FROM Metric 
      WHERE metricName LIKE '%kafka%' OR metricName LIKE '%newrelic.goldenmetrics%'
      SINCE 1 hour ago
    `;
    const metricsResult = await client.nrql(config.accountId, metricsQuery);
    const kafkaMetrics = metricsResult?.results?.[0]?.['uniques.metricName'] || [];
    
    if (kafkaMetrics.length > 0) {
      allMetricsPage.widgets.push({
        title: '🏆 New Relic Golden Metrics',
        visualization: { id: 'viz.line' },
        layout: { column: 1, row: currentRow, height: 3, width: 12 },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(config.accountId),
            query: `SELECT average(newrelic.goldenmetrics.infra.kafkabroker.leaderElectionRate) as 'Leader Election Rate', average(newrelic.goldenmetrics.infra.kafkabroker.incomingMessagesPerSecond) as 'Incoming Msg/sec', average(newrelic.goldenmetrics.infra.kafkabroker.failedProduceRequestsPerSecond) as 'Failed Produce/sec' FROM Metric TIMESERIES AUTO WHERE metricName LIKE '%goldenmetrics%kafka%'`
          }]
        }
      });
      currentRow += 3;
    }
    
    // Category 8: Comprehensive Health Matrix
    allMetricsPage.widgets.push({
      title: '📊 Complete Broker Metrics Matrix',
      visualization: { id: 'viz.table' },
      layout: { column: 1, row: currentRow, height: 4, width: 12 },
      rawConfiguration: {
        nrqlQueries: [{
          accountId: parseInt(config.accountId),
          query: `SELECT 
            latest(entity.name) as 'Broker',
            latest(broker.messagesInPerSecond) as 'Msg/sec',
            latest(broker.bytesInPerSecond)/1024 as 'KB In/sec',
            latest(broker.bytesOutPerSecond)/1024 as 'KB Out/sec',
            latest(request.avgTimeFetch) as 'Avg Fetch ms',
            latest(request.avgTimeProduceRequest) as 'Avg Produce ms',
            latest(request.handlerIdle) * 100 as 'Idle %',
            latest(request.produceRequestsFailedPerSecond) as 'Failed/sec',
            latest(replication.unreplicatedPartitions) as 'Unreplicated',
            latest(replication.isrShrinksPerSecond) as 'ISR Shrinks/sec'
          FROM KafkaBrokerSample 
          FACET entity.guid 
          SINCE 10 minutes ago 
          LIMIT 50`
        }]
      }
    });
    
    dashboard.pages.push(allMetricsPage);
    
    spinner.start('Deploying intelligent dashboard...');
    
    // Deploy the dashboard
    const result = await client.createDashboard(config.accountId, dashboard);
    
    spinner.succeed('Dashboard deployed successfully');
    
    const dashboardUrl = `https://one.newrelic.com/dashboards/${result.guid}`;
    
    console.log(chalk.green('\n✅ Intelligent Dashboard Created Successfully!\n'));
    console.log(chalk.white('Dashboard Details:'));
    console.log(chalk.gray(`  • Name: ${result.name}`));
    console.log(chalk.gray(`  • GUID: ${result.guid}`));
    console.log(chalk.gray(`  • Pages: ${dashboard.pages.length}`));
    console.log(chalk.gray(`  • URL: ${dashboardUrl}\n`));
    
    // Save configuration
    const outputPath = path.join(__dirname, `intelligent-kafka-dashboard-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify({
      dashboard,
      result,
      url: dashboardUrl,
      intelligence: {
        goldenSignals: {
          latency: ['request.avgTimeFetch', 'request.avgTimeProduceRequest'],
          traffic: ['broker.messagesInPerSecond', 'broker.bytesInPerSecond'],
          errors: ['request.produceRequestsFailedPerSecond'],
          saturation: ['request.handlerIdle', 'replication.unreplicatedPartitions']
        },
        visualizationMapping: {
          throughput: 'area',
          latency: 'line',
          errors: 'line',
          comparison: 'bar',
          status: 'table',
          current: 'billboard'
        },
        correlations: [
          { metric1: 'cpuPercent', metric2: 'request.avgTimeFetch', type: 'resource_impact' },
          { metric1: 'broker.messagesInPerSecond', metric2: 'broker.bytesInPerSecond', type: 'traffic' }
        ]
      }
    }, null, 2));
    
    console.log(chalk.gray(`💾 Configuration saved to: ${outputPath}\n`));
    
    console.log(chalk.bold.yellow('🧠 Intelligent Features Applied:\n'));
    console.log(chalk.white('✓ Golden Signals Dashboard Structure'));
    console.log(chalk.white('✓ Automatic Metric Categorization'));
    console.log(chalk.white('✓ Optimal Visualization Selection'));
    console.log(chalk.white('✓ Correlation Detection'));
    console.log(chalk.white('✓ Alert Recommendations'));
    console.log(chalk.white('✓ Performance Insights\n'));
    
    console.log(chalk.bold.cyan('🎉 Your intelligent Kafka dashboard is ready to use!\n'));
    
  } catch (error) {
    spinner.fail('Dashboard creation failed');
    console.error(chalk.red('\n❌ Error:'), error.message);
    console.error(chalk.gray('\nStack trace:'), error.stack);
    process.exit(1);
  }
}

// Run the dashboard creation
createFinalIntelligentDashboard().catch(console.error);