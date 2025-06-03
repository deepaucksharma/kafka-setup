#!/usr/bin/env node

/**
 * Create Kafka Dashboard
 * Creates a dashboard based on discovered Kafka data
 */

const dotenv = require('dotenv');
const path = require('path');
const { NerdGraphClient } = require('./src/core/api-client.js');
const chalk = require('chalk');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function createKafkaDashboard() {
  const accountId = process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID;
  const apiKey = process.env.UKEY || process.env.NEW_RELIC_API_KEY;
  
  if (!accountId || !apiKey) {
    console.error(chalk.red('Missing account ID or API key'));
    process.exit(1);
  }
  
  console.log(chalk.bold.blue('\n🎯 Creating Kafka Dashboard\n'));
  console.log(chalk.gray(`Account: ${accountId}\n`));
  
  const client = new NerdGraphClient({
    apiKey,
    region: 'US'
  });
  
  // Dashboard configuration
  const dashboard = {
    name: `Kafka Monitoring - ${new Date().toISOString().split('T')[0]}`,
    description: 'Auto-generated Kafka monitoring dashboard',
    permissions: 'PUBLIC_READ_WRITE',
    pages: [
      {
        name: 'Kafka Overview',
        description: 'Kafka broker performance and health',
        widgets: [
          // Summary billboard
          {
            title: 'Kafka Cluster Summary',
            configuration: {
              markdown: {
                text: `## Kafka Monitoring Dashboard
                
**Account**: ${accountId}  
**Generated**: ${new Date().toISOString()}

This dashboard monitors your Kafka infrastructure including:
- Broker performance metrics
- Message throughput
- Kafka golden metrics from New Relic

Note: QueueSample data for Share Groups is not yet available.`
              }
            },
            layout: { column: 1, row: 1, width: 4, height: 3 }
          },
          
          // Broker count
          {
            title: 'Active Brokers',
            configuration: {
              billboard: {
                queries: [{
                  query: 'SELECT uniqueCount(entity.name) FROM KafkaBrokerSample SINCE 5 minutes ago',
                  accountId: parseInt(accountId)
                }]
              }
            },
            layout: { column: 5, row: 1, width: 2, height: 3 }
          },
          
          // Total throughput
          {
            title: 'Total Throughput',
            configuration: {
              billboard: {
                queries: [{
                  query: 'SELECT sum(broker.bytesInPerSecond) as \'Bytes In/sec\', sum(broker.bytesOutPerSecond) as \'Bytes Out/sec\' FROM KafkaBrokerSample SINCE 5 minutes ago',
                  accountId: parseInt(accountId)
                }]
              }
            },
            layout: { column: 7, row: 1, width: 3, height: 3 }
          },
          
          // Message rate
          {
            title: 'Message Rate',
            configuration: {
              billboard: {
                queries: [{
                  query: 'SELECT sum(broker.messagesInPerSecond) as \'Messages/sec\' FROM KafkaBrokerSample SINCE 5 minutes ago',
                  accountId: parseInt(accountId)
                }]
              }
            },
            layout: { column: 10, row: 1, width: 3, height: 3 }
          },
          
          // Throughput over time
          {
            title: 'Broker Throughput',
            configuration: {
              line: {
                queries: [{
                  query: 'SELECT average(broker.bytesInPerSecond) as \'Bytes In/sec\', average(broker.bytesOutPerSecond) as \'Bytes Out/sec\' FROM KafkaBrokerSample TIMESERIES AUTO SINCE 1 hour ago',
                  accountId: parseInt(accountId)
                }]
              }
            },
            layout: { column: 1, row: 4, width: 6, height: 3 }
          },
          
          // Message rate over time
          {
            title: 'Message Rate',
            configuration: {
              line: {
                queries: [{
                  query: 'SELECT average(broker.messagesInPerSecond) FROM KafkaBrokerSample TIMESERIES AUTO SINCE 1 hour ago',
                  accountId: parseInt(accountId)
                }]
              }
            },
            layout: { column: 7, row: 4, width: 6, height: 3 }
          },
          
          // Per broker performance
          {
            title: 'Performance by Broker',
            configuration: {
              bar: {
                queries: [{
                  query: 'SELECT average(broker.bytesInPerSecond) as \'Bytes In\', average(broker.bytesOutPerSecond) as \'Bytes Out\' FROM KafkaBrokerSample FACET entity.name SINCE 30 minutes ago',
                  accountId: parseInt(accountId)
                }]
              }
            },
            layout: { column: 1, row: 7, width: 6, height: 3 }
          },
          
          // Broker health table
          {
            title: 'Broker Health',
            configuration: {
              table: {
                queries: [{
                  query: 'SELECT latest(entity.name) as \'Broker\', latest(broker.messagesInPerSecond) as \'Msg/sec\', latest(broker.bytesInPerSecond) as \'Bytes In/sec\', latest(broker.bytesOutPerSecond) as \'Bytes Out/sec\' FROM KafkaBrokerSample FACET entity.guid SINCE 10 minutes ago LIMIT 20',
                  accountId: parseInt(accountId)
                }]
              }
            },
            layout: { column: 7, row: 7, width: 6, height: 3 }
          }
        ]
      },
      {
        name: 'Kafka Metrics',
        description: 'New Relic golden metrics for Kafka',
        widgets: [
          // Golden metrics
          {
            title: 'Kafka Golden Metrics',
            configuration: {
              markdown: {
                text: `## Kafka Golden Metrics

These are the pre-calculated golden metrics provided by New Relic for Kafka monitoring.`
              }
            },
            layout: { column: 1, row: 1, width: 12, height: 1 }
          },
          
          // Leader election rate
          {
            title: 'Leader Election Rate',
            configuration: {
              line: {
                queries: [{
                  query: 'SELECT average(newrelic.goldenmetrics.infra.kafkabroker.leaderElectionRate) FROM Metric TIMESERIES AUTO SINCE 1 hour ago',
                  accountId: parseInt(accountId)
                }]
              }
            },
            layout: { column: 1, row: 2, width: 6, height: 3 }
          },
          
          // Produce request duration
          {
            title: 'Produce Request Duration (99th percentile)',
            configuration: {
              line: {
                queries: [{
                  query: 'SELECT average(newrelic.goldenmetrics.infra.kafkabroker.produceRequestDuration99PercentileS) FROM Metric TIMESERIES AUTO SINCE 1 hour ago',
                  accountId: parseInt(accountId)
                }]
              }
            },
            layout: { column: 7, row: 2, width: 6, height: 3 }
          },
          
          // Failed produce requests
          {
            title: 'Failed Produce Requests',
            configuration: {
              line: {
                queries: [{
                  query: 'SELECT average(newrelic.goldenmetrics.infra.kafkabroker.failedProduceRequestsPerSecond) FROM Metric TIMESERIES AUTO SINCE 1 hour ago',
                  accountId: parseInt(accountId)
                }]
              }
            },
            layout: { column: 1, row: 5, width: 6, height: 3 }
          },
          
          // Incoming messages from golden metrics
          {
            title: 'Incoming Messages (Golden Metric)',
            configuration: {
              line: {
                queries: [{
                  query: 'SELECT average(newrelic.goldenmetrics.infra.kafkabroker.incomingMessagesPerSecond) FROM Metric TIMESERIES AUTO SINCE 1 hour ago',
                  accountId: parseInt(accountId)
                }]
              }
            },
            layout: { column: 7, row: 5, width: 6, height: 3 }
          }
        ]
      }
    ]
  };
  
  try {
    console.log(chalk.yellow('Creating dashboard...'));
    
    const result = await client.createDashboard(accountId, dashboard);
    
    if (result) {
      const dashboardUrl = `https://one.newrelic.com/dashboards/${result.guid}`;
      
      console.log(chalk.green('\n✅ Dashboard created successfully!\n'));
      console.log(chalk.white('Dashboard Details:'));
      console.log(chalk.gray(`  • Name: ${result.name}`));
      console.log(chalk.gray(`  • GUID: ${result.guid}`));
      console.log(chalk.gray(`  • URL: ${dashboardUrl}\n`));
      
      // Save dashboard config
      const outputPath = `kafka-dashboard-${accountId}-${Date.now()}.json`;
      fs.writeFileSync(outputPath, JSON.stringify({
        dashboard,
        result,
        url: dashboardUrl
      }, null, 2));
      
      console.log(chalk.gray(`Dashboard configuration saved to: ${outputPath}\n`));
      
      console.log(chalk.bold.yellow('📝 Next Steps:\n'));
      console.log(chalk.white('1. Enable more Kafka monitoring:'));
      console.log(chalk.gray('   • Ensure Kafka integration is fully configured'));
      console.log(chalk.gray('   • Enable topic and consumer monitoring'));
      console.log(chalk.gray('   • Deploy Share Group monitoring for QueueSample data\n'));
      
      console.log(chalk.white('2. Add alerts:'));
      console.log(chalk.gray('   • Alert on high leader election rate'));
      console.log(chalk.gray('   • Alert on failed produce requests'));
      console.log(chalk.gray('   • Alert on broker throughput drops\n'));
      
    }
  } catch (error) {
    console.error(chalk.red('\n❌ Failed to create dashboard:'), error.message);
    console.error(chalk.gray('\nPossible issues:'));
    console.error(chalk.gray('  • Check API key permissions'));
    console.error(chalk.gray('  • Verify account ID is correct'));
    console.error(chalk.gray('  • Ensure you have dashboard creation rights'));
  }
}

// Run the dashboard creation
createKafkaDashboard().catch(console.error);