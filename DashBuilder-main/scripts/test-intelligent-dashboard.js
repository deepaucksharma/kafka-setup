#!/usr/bin/env node

/**
 * Test Intelligent Dashboard Generation
 * Demonstrates the advanced dashboard builder with Kafka metrics
 */

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Import the intelligent dashboard builder
const IntelligentDashboardBuilder = require('./discovery-platform/lib/intelligent-dashboard-builder');

async function testIntelligentDashboard() {
  console.log(chalk.bold.blue('\n🧠 Testing Intelligent Dashboard Generation\n'));
  
  const config = {
    accountId: process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID,
    apiKey: process.env.UKEY || process.env.NEW_RELIC_API_KEY,
    enableAnomalyDetection: true,
    enableCorrelations: true,
    enablePredictions: true
  };
  
  console.log(chalk.gray(`Account: ${config.accountId}`));
  
  // Create sample discovery results based on actual Kafka monitoring
  const discoveryResults = {
    timestamp: new Date().toISOString(),
    accountId: config.accountId,
    eventTypes: [
      {
        name: 'KafkaBrokerSample',
        count: 1500,
        timeRange: '1 hour',
        attributes: [
          { name: 'broker.bytesInPerSecond', type: 'number', cardinality: 'continuous' },
          { name: 'broker.bytesOutPerSecond', type: 'number', cardinality: 'continuous' },
          { name: 'broker.messagesInPerSecond', type: 'number', cardinality: 'continuous' },
          { name: 'broker.IOInPerSecond', type: 'number', cardinality: 'continuous' },
          { name: 'broker.IOOutPerSecond', type: 'number', cardinality: 'continuous' },
          { name: 'broker.logFlushPerSecond', type: 'number', cardinality: 'continuous' },
          { name: 'request.avgTimeFetch', type: 'number', cardinality: 'continuous' },
          { name: 'request.avgTimeMetadata', type: 'number', cardinality: 'continuous' },
          { name: 'request.avgTimeProduceRequest', type: 'number', cardinality: 'continuous' },
          { name: 'request.produceRequestsFailedPerSecond', type: 'number', cardinality: 'continuous' },
          { name: 'request.fetchConsumerRequestsPerSecond', type: 'number', cardinality: 'continuous' },
          { name: 'request.handlerIdle', type: 'number', cardinality: 'continuous' },
          { name: 'replication.unreplicatedPartitions', type: 'number', cardinality: 'discrete' },
          { name: 'replication.isrExpandsPerSecond', type: 'number', cardinality: 'continuous' },
          { name: 'replication.isrShrinksPerSecond', type: 'number', cardinality: 'continuous' },
          { name: 'replication.leaderElectionPerSecond', type: 'number', cardinality: 'continuous' },
          { name: 'replication.uncleanLeaderElectionPerSecond', type: 'number', cardinality: 'continuous' },
          { name: 'consumer.requestsExpiredPerSecond', type: 'number', cardinality: 'continuous' },
          { name: 'follower.requestExpirationPerSecond', type: 'number', cardinality: 'continuous' },
          { name: 'net.bytesRejectedPerSecond', type: 'number', cardinality: 'continuous' },
          { name: 'clusterName', type: 'string', cardinality: 1 },
          { name: 'entity.name', type: 'string', cardinality: 10 }
        ]
      },
      {
        name: 'KafkaTopicSample',
        count: 500,
        timeRange: '1 hour',
        attributes: [
          { name: 'topic.bytesInPerSec', type: 'number', cardinality: 'continuous' },
          { name: 'topic.bytesOutPerSec', type: 'number', cardinality: 'continuous' },
          { name: 'topic.messagesInPerSec', type: 'number', cardinality: 'continuous' },
          { name: 'topic.partitionsWithNonPreferredLeader', type: 'number', cardinality: 'discrete' },
          { name: 'topic.underReplicatedPartitions', type: 'number', cardinality: 'discrete' },
          { name: 'topic.respondsToMetadataRequests', type: 'number', cardinality: 'binary' },
          { name: 'topic.diskSize', type: 'number', cardinality: 'continuous' },
          { name: 'topic.topicName', type: 'string', cardinality: 25 }
        ]
      },
      {
        name: 'KafkaConsumerSample',
        count: 300,
        timeRange: '1 hour',
        attributes: [
          { name: 'consumer.lag', type: 'number', cardinality: 'continuous' },
          { name: 'consumer.maxLag', type: 'number', cardinality: 'continuous' },
          { name: 'consumer.totalLag', type: 'number', cardinality: 'continuous' },
          { name: 'consumer.messageRate', type: 'number', cardinality: 'continuous' },
          { name: 'consumer.bytesConsumedPerSecond', type: 'number', cardinality: 'continuous' },
          { name: 'consumer.fetchRatePerSecond', type: 'number', cardinality: 'continuous' },
          { name: 'consumer.recordsConsumedRate', type: 'number', cardinality: 'continuous' },
          { name: 'consumer.avgFetchLatency', type: 'number', cardinality: 'continuous' },
          { name: 'consumer.clientId', type: 'string', cardinality: 15 },
          { name: 'consumer.groupId', type: 'string', cardinality: 8 }
        ]
      },
      {
        name: 'QueueSample',
        count: 200,
        timeRange: '1 hour',
        attributes: [
          { name: 'queue.size', type: 'number', cardinality: 'continuous' },
          { name: 'oldest.message.age.seconds', type: 'number', cardinality: 'continuous' },
          { name: 'messages.acknowledged', type: 'number', cardinality: 'continuous' },
          { name: 'messages.received', type: 'number', cardinality: 'continuous' },
          { name: 'messages.processed', type: 'number', cardinality: 'continuous' },
          { name: 'share.group.name', type: 'string', cardinality: 5 },
          { name: 'provider', type: 'string', cardinality: 1 }
        ]
      },
      {
        name: 'SystemSample',
        count: 3000,
        timeRange: '1 hour',
        attributes: [
          { name: 'cpuPercent', type: 'number', cardinality: 'continuous' },
          { name: 'memoryUsedPercent', type: 'number', cardinality: 'continuous' },
          { name: 'diskUsedPercent', type: 'number', cardinality: 'continuous' },
          { name: 'networkReceiveBytesPerSecond', type: 'number', cardinality: 'continuous' },
          { name: 'networkTransmitBytesPerSecond', type: 'number', cardinality: 'continuous' },
          { name: 'hostname', type: 'string', cardinality: 5 }
        ]
      }
    ],
    metrics: [
      {
        name: 'newrelic.goldenmetrics.infra.kafkabroker.leaderElectionRate',
        type: 'gauge',
        unit: 'per_second'
      },
      {
        name: 'newrelic.goldenmetrics.infra.kafkabroker.produceRequestDuration99PercentileS',
        type: 'gauge',
        unit: 'seconds'
      },
      {
        name: 'newrelic.goldenmetrics.infra.kafkabroker.failedProduceRequestsPerSecond',
        type: 'counter',
        unit: 'per_second'
      },
      {
        name: 'newrelic.goldenmetrics.infra.kafkabroker.incomingMessagesPerSecond',
        type: 'counter',
        unit: 'per_second'
      }
    ],
    relationships: [
      {
        from: 'KafkaBrokerSample',
        to: 'KafkaTopicSample',
        type: 'manages'
      },
      {
        from: 'KafkaConsumerSample',
        to: 'KafkaTopicSample',
        type: 'consumes'
      },
      {
        from: 'QueueSample',
        to: 'KafkaTopicSample',
        type: 'monitors'
      }
    ]
  };
  
  try {
    // Initialize the intelligent dashboard builder
    const builder = new IntelligentDashboardBuilder(config);
    
    console.log(chalk.yellow('\n📊 Starting intelligent dashboard generation...\n'));
    
    // Build the dashboard
    const result = await builder.buildDashboards(discoveryResults);
    
    console.log(chalk.green('\n✅ Intelligent dashboard generated successfully!\n'));
    
    // Display analysis results
    console.log(chalk.bold.white('📈 Metric Analysis:'));
    console.log(chalk.gray(`  • Event Types Analyzed: ${Object.keys(result.analysis.eventTypes).length}`));
    console.log(chalk.gray(`  • Metric Categories: ${Object.keys(result.analysis.categories).join(', ')}`));
    console.log(chalk.gray(`  • Time Series Metrics: ${result.analysis.timeSeries.length}`));
    console.log(chalk.gray(`  • Dimensions Identified: ${result.analysis.dimensions.length}`));
    
    // Display golden signals
    console.log(chalk.bold.white('\n🚦 Golden Signals Mapping:'));
    for (const [signal, metrics] of Object.entries(result.analysis.goldenSignals)) {
      if (metrics.length > 0) {
        console.log(chalk.gray(`  • ${signal}: ${metrics.length} metrics`));
        metrics.slice(0, 3).forEach(m => {
          console.log(chalk.gray(`    - ${m}`));
        });
      }
    }
    
    // Display correlations
    if (result.correlations && result.correlations.strong.length > 0) {
      console.log(chalk.bold.white('\n🔗 Detected Correlations:'));
      result.correlations.strong.slice(0, 5).forEach(corr => {
        console.log(chalk.gray(`  • ${corr.metric1} ↔ ${corr.metric2} (${corr.type})`));
      });
    }
    
    // Display insights
    if (result.insights && result.insights.length > 0) {
      console.log(chalk.bold.white('\n💡 Generated Insights:'));
      result.insights.forEach(insight => {
        const icon = insight.severity === 'high' ? '🔴' : insight.severity === 'medium' ? '🟡' : '🟢';
        console.log(chalk.gray(`  ${icon} ${insight.message}`));
      });
    }
    
    // Display dashboard info
    console.log(chalk.bold.white('\n📊 Dashboard Details:'));
    console.log(chalk.gray(`  • Name: ${result.dashboard.name}`));
    console.log(chalk.gray(`  • GUID: ${result.dashboard.guid}`));
    console.log(chalk.gray(`  • URL: ${result.dashboard.url}`));
    console.log(chalk.gray(`  • Pages: ${result.dashboard.pages?.length || 'N/A'}`));
    
    // Save the results
    const outputPath = path.join(__dirname, `intelligent-dashboard-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify({
      config,
      discoveryResults,
      result
    }, null, 2));
    
    console.log(chalk.gray(`\n💾 Full results saved to: ${outputPath}\n`));
    
    // Show example queries
    console.log(chalk.bold.yellow('📝 Example Dashboard Queries Generated:\n'));
    
    console.log(chalk.white('1. Kafka Broker Performance:'));
    console.log(chalk.gray('   SELECT average(broker.bytesInPerSecond), average(broker.bytesOutPerSecond)'));
    console.log(chalk.gray('   FROM KafkaBrokerSample TIMESERIES AUTO\n'));
    
    console.log(chalk.white('2. Consumer Lag Analysis:'));
    console.log(chalk.gray('   SELECT max(consumer.lag) FROM KafkaConsumerSample'));
    console.log(chalk.gray('   FACET consumer.groupId TIMESERIES AUTO\n'));
    
    console.log(chalk.white('3. Share Group Queue Depth:'));
    console.log(chalk.gray('   SELECT latest(queue.size), latest(oldest.message.age.seconds)'));
    console.log(chalk.gray('   FROM QueueSample WHERE provider = \'kafka\''));
    console.log(chalk.gray('   FACET share.group.name\n'));
    
    console.log(chalk.white('4. Error Rate Correlation:'));
    console.log(chalk.gray('   SELECT percentage(count(*), WHERE request.produceRequestsFailedPerSecond > 0)'));
    console.log(chalk.gray('   FROM KafkaBrokerSample TIMESERIES AUTO\n'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Error generating intelligent dashboard:'), error.message);
    console.error(chalk.gray('\nStack trace:'), error.stack);
    
    // Try to provide helpful troubleshooting
    console.log(chalk.yellow('\n🔧 Troubleshooting tips:'));
    console.log(chalk.gray('  • Verify your API key has dashboard creation permissions'));
    console.log(chalk.gray('  • Check that the account ID is correct'));
    console.log(chalk.gray('  • Ensure network connectivity to New Relic API'));
    console.log(chalk.gray('  • Review the error message above for specific issues'));
  }
}

// Run the test
testIntelligentDashboard().catch(console.error);