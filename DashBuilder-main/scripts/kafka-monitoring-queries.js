#!/usr/bin/env node

const dotenv = require('dotenv');
const path = require('path');
const { NerdGraphClient } = require('./src/core/api-client.js');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const config = {
  apiKey: process.env.UKEY || process.env.NEW_RELIC_API_KEY,
  accountId: process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID
};

// Kafka monitoring queries
const kafkaQueries = {
  'discovery': [
    {
      title: 'Kafka Metrics Available',
      query: "SELECT uniques(metricName) FROM Metric WHERE metricName LIKE 'kafka%' SINCE 1 hour ago LIMIT 100"
    },
    {
      title: 'Share Group Metrics',
      query: "SELECT uniques(metricName) FROM Metric WHERE metricName LIKE '%sharegroup%' SINCE 1 hour ago"
    },
    {
      title: 'Kafka Hosts',
      query: "SELECT uniqueCount(host) FROM Metric WHERE metricName LIKE 'kafka%' SINCE 1 hour ago"
    }
  ],
  'brokers': [
    {
      title: 'Broker State',
      query: "SELECT latest(value) FROM Metric WHERE metricName = 'kafka_server_BrokerState' FACET host"
    },
    {
      title: 'Messages In/Out Rate',
      query: "SELECT rate(sum(value), 1 second) FROM Metric WHERE metricName IN ('kafka_server_BrokerTopicMetrics_MessagesInPerSec', 'kafka_server_BrokerTopicMetrics_BytesOutPerSec') FACET metricName TIMESERIES"
    },
    {
      title: 'Active Controller Count',
      query: "SELECT latest(value) FROM Metric WHERE metricName = 'kafka_controller_KafkaController_ActiveControllerCount'"
    }
  ],
  'topics': [
    {
      title: 'Topics by Partition Count',
      query: "SELECT latest(value) FROM Metric WHERE metricName = 'kafka_server_BrokerTopicMetrics_PartitionCount' FACET topic"
    },
    {
      title: 'Messages by Topic',
      query: "SELECT rate(sum(value), 1 minute) FROM Metric WHERE metricName = 'kafka_server_BrokerTopicMetrics_MessagesInPerSec' FACET topic TIMESERIES"
    },
    {
      title: 'Topic Bytes In/Out',
      query: "SELECT rate(sum(value), 1 second) FROM Metric WHERE metricName LIKE 'kafka_server_BrokerTopicMetrics_Bytes%PerSec' FACET topic, metricName"
    }
  ],
  'sharegroups': [
    {
      title: 'Share Group Unacked Messages',
      query: "SELECT latest(kafka_sharegroup_records_unacked) FROM Metric FACET group, topic, partition WHERE kafka_sharegroup_records_unacked IS NOT NULL"
    },
    {
      title: 'Share Group Processing Delay',
      query: "SELECT latest(kafka_sharegroup_oldest_unacked_ms) / 1000 as 'Delay (seconds)' FROM Metric FACET group, topic WHERE kafka_sharegroup_oldest_unacked_ms IS NOT NULL"
    },
    {
      title: 'Share Group ACK Rate',
      query: "SELECT rate(sum(kafka_sharegroup_records_acknowledged), 1 minute) as 'ACK/min' FROM Metric FACET group WHERE kafka_sharegroup_records_acknowledged IS NOT NULL TIMESERIES"
    },
    {
      title: 'Share Group Health Score',
      query: "SELECT (sum(kafka_sharegroup_records_acknowledged) / (sum(kafka_sharegroup_records_acknowledged) + sum(kafka_sharegroup_records_released) + sum(kafka_sharegroup_records_rejected))) * 100 as 'Health %' FROM Metric FACET group WHERE kafka_sharegroup_records_acknowledged IS NOT NULL"
    }
  ],
  'consumers': [
    {
      title: 'Consumer Lag by Group',
      query: "SELECT latest(value) FROM Metric WHERE metricName = 'kafka_consumer_ConsumerLag' FACET consumer_group, topic, partition"
    },
    {
      title: 'Consumer Offset Progress',
      query: "SELECT latest(value) FROM Metric WHERE metricName = 'kafka_consumer_CurrentOffset' FACET consumer_group, topic"
    },
    {
      title: 'Consumer Groups',
      query: "SELECT uniqueCount(consumer_group) FROM Metric WHERE metricName LIKE 'kafka_consumer%'"
    }
  ],
  'performance': [
    {
      title: 'Request Latency',
      query: "SELECT average(value) FROM Metric WHERE metricName LIKE 'kafka_network_RequestMetrics_%TimeMs' AND metricName LIKE '%Mean' FACET metricName"
    },
    {
      title: 'Under Replicated Partitions',
      query: "SELECT latest(value) FROM Metric WHERE metricName = 'kafka_server_ReplicaManager_UnderReplicatedPartitions' FACET host"
    },
    {
      title: 'ISR Shrinks/Expands',
      query: "SELECT sum(value) FROM Metric WHERE metricName IN ('kafka_server_ReplicaManager_IsrShrinksPerSec', 'kafka_server_ReplicaManager_IsrExpandsPerSec') FACET metricName TIMESERIES"
    }
  ],
  'queuesamples': [
    {
      title: 'Queue Samples from OHI',
      query: "SELECT latest(queue.size), latest(oldest.message.age.seconds) FROM QueueSample WHERE provider = 'kafka' FACET queue.name, share.group.name SINCE 30 minutes ago"
    },
    {
      title: 'Queue Processing Rate',
      query: "SELECT rate(sum(messages.acknowledged), 1 minute) as 'ACK Rate' FROM QueueSample WHERE provider = 'kafka' FACET share.group.name TIMESERIES"
    },
    {
      title: 'Queue Health Overview',
      query: "SELECT latest(queue.size) as 'Backlog', latest(oldest.message.age.seconds) as 'Max Age (s)', sum(messages.acknowledged) as 'Processed', sum(messages.released) as 'Released', sum(messages.rejected) as 'Rejected' FROM QueueSample WHERE provider = 'kafka' FACET queue.name SINCE 1 hour ago"
    }
  ]
};

async function runKafkaQueries(client, category = null) {
  const categories = category ? [category] : Object.keys(kafkaQueries);
  
  for (const cat of categories) {
    if (!kafkaQueries[cat]) {
      console.log(`❌ Unknown category: ${cat}`);
      continue;
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 ${cat.toUpperCase()} METRICS`);
    console.log('='.repeat(60));
    
    for (const query of kafkaQueries[cat]) {
      console.log(`\n🔍 ${query.title}`);
      console.log(`📝 Query: ${query.query}`);
      
      try {
        const result = await client.nrql(config.accountId, query.query);
        
        if (result.results && result.results.length > 0) {
          console.log('✅ Results:');
          
          if (result.results.length <= 10) {
            console.log(JSON.stringify(result.results, null, 2));
          } else {
            console.log(JSON.stringify(result.results.slice(0, 10), null, 2));
            console.log(`... and ${result.results.length - 10} more results`);
          }
        } else {
          console.log('ℹ️ No data available yet');
        }
      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}

async function createKafkaDashboard(client) {
  console.log('\n📊 Creating Kafka Monitoring Dashboard...');
  
  const dashboard = {
    name: `Kafka Monitoring - ${new Date().toISOString().split('T')[0]}`,
    description: 'Comprehensive Kafka monitoring including Share Groups',
    permissions: 'PUBLIC_READ_WRITE',
    pages: [
      {
        name: 'Overview',
        description: 'Kafka cluster overview',
        widgets: [
          {
            title: 'Broker State',
            visualization: { id: 'viz.billboard' },
            layout: { column: 1, row: 1, height: 3, width: 4 },
            rawConfiguration: {
              nrqlQueries: [{
                accountId: parseInt(config.accountId),
                query: "SELECT latest(value) FROM Metric WHERE metricName = 'kafka_server_BrokerState' FACET host"
              }]
            }
          },
          {
            title: 'Messages In Rate',
            visualization: { id: 'viz.line' },
            layout: { column: 5, row: 1, height: 3, width: 8 },
            rawConfiguration: {
              nrqlQueries: [{
                accountId: parseInt(config.accountId),
                query: "SELECT rate(sum(value), 1 second) FROM Metric WHERE metricName = 'kafka_server_BrokerTopicMetrics_MessagesInPerSec' TIMESERIES AUTO"
              }]
            }
          },
          {
            title: 'Under Replicated Partitions',
            visualization: { id: 'viz.billboard' },
            layout: { column: 1, row: 4, height: 3, width: 4 },
            rawConfiguration: {
              nrqlQueries: [{
                accountId: parseInt(config.accountId),
                query: "SELECT sum(value) FROM Metric WHERE metricName = 'kafka_server_ReplicaManager_UnderReplicatedPartitions'"
              }],
              thresholds: [
                { alertSeverity: 'WARNING', value: 1 },
                { alertSeverity: 'CRITICAL', value: 10 }
              ]
            }
          },
          {
            title: 'Topics by Message Rate',
            visualization: { id: 'viz.bar' },
            layout: { column: 5, row: 4, height: 3, width: 8 },
            rawConfiguration: {
              nrqlQueries: [{
                accountId: parseInt(config.accountId),
                query: "SELECT rate(sum(value), 1 minute) FROM Metric WHERE metricName = 'kafka_server_BrokerTopicMetrics_MessagesInPerSec' FACET topic"
              }]
            }
          }
        ]
      },
      {
        name: 'Share Groups',
        description: 'Share Group monitoring',
        widgets: [
          {
            title: 'Unacked Messages by Share Group',
            visualization: { id: 'viz.table' },
            layout: { column: 1, row: 1, height: 3, width: 6 },
            rawConfiguration: {
              nrqlQueries: [{
                accountId: parseInt(config.accountId),
                query: "SELECT latest(kafka_sharegroup_records_unacked) as 'Unacked', latest(kafka_sharegroup_oldest_unacked_ms)/1000 as 'Max Age (s)' FROM Metric FACET group, topic, partition WHERE kafka_sharegroup_records_unacked IS NOT NULL"
              }]
            }
          },
          {
            title: 'Share Group Processing Rate',
            visualization: { id: 'viz.line' },
            layout: { column: 7, row: 1, height: 3, width: 6 },
            rawConfiguration: {
              nrqlQueries: [{
                accountId: parseInt(config.accountId),
                query: "SELECT rate(sum(kafka_sharegroup_records_acknowledged), 1 minute) as 'ACK/min' FROM Metric FACET group WHERE kafka_sharegroup_records_acknowledged IS NOT NULL TIMESERIES"
              }]
            }
          },
          {
            title: 'Share Group Health',
            visualization: { id: 'viz.billboard' },
            layout: { column: 1, row: 4, height: 3, width: 4 },
            rawConfiguration: {
              nrqlQueries: [{
                accountId: parseInt(config.accountId),
                query: "SELECT (sum(kafka_sharegroup_records_acknowledged) / (sum(kafka_sharegroup_records_acknowledged) + sum(kafka_sharegroup_records_released) + sum(kafka_sharegroup_records_rejected))) * 100 as 'Success Rate %' FROM Metric WHERE kafka_sharegroup_records_acknowledged IS NOT NULL"
              }],
              thresholds: [
                { alertSeverity: 'CRITICAL', value: 90 },
                { alertSeverity: 'WARNING', value: 95 }
              ]
            }
          },
          {
            title: 'Queue Samples (from OHI)',
            visualization: { id: 'viz.table' },
            layout: { column: 5, row: 4, height: 3, width: 8 },
            rawConfiguration: {
              nrqlQueries: [{
                accountId: parseInt(config.accountId),
                query: "SELECT latest(queue.size) as 'Queue Size', latest(oldest.message.age.seconds) as 'Max Age (s)' FROM QueueSample WHERE provider = 'kafka' FACET queue.name, share.group.name SINCE 30 minutes ago"
              }]
            }
          }
        ]
      }
    ]
  };

  try {
    const mutation = `
      mutation CreateDashboard($accountId: Int!, $dashboard: DashboardInput!) {
        dashboardCreate(accountId: $accountId, dashboard: $dashboard) {
          entityResult {
            guid
            name
          }
          errors {
            description
            type
          }
        }
      }
    `;

    const response = await client.query(mutation, {
      accountId: parseInt(config.accountId),
      dashboard
    });

    if (response.dashboardCreate?.entityResult) {
      const result = response.dashboardCreate.entityResult;
      console.log('✅ Dashboard created successfully!');
      console.log(`📊 Name: ${result.name}`);
      console.log(`🔗 URL: https://one.newrelic.com/dashboards/detail/${result.guid}`);
      return result;
    } else {
      throw new Error('Dashboard creation failed');
    }
  } catch (error) {
    console.error('❌ Error creating dashboard:', error.message);
    return null;
  }
}

async function main() {
  if (!config.apiKey || !config.accountId) {
    console.error('❌ Missing required environment variables');
    console.error('Please ensure UKEY and ACC are set in ../.env file');
    process.exit(1);
  }

  console.log('🚀 Kafka Monitoring Query Tool');
  console.log(`📊 Account ID: ${config.accountId}\n`);

  const client = new NerdGraphClient(config);
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'all') {
    // Run all queries
    await runKafkaQueries(client);
  } else if (args[0] === 'dashboard') {
    // Create dashboard
    await createKafkaDashboard(client);
  } else if (args[0] === 'list') {
    // List categories
    console.log('Available categories:');
    Object.keys(kafkaQueries).forEach(cat => {
      console.log(`  - ${cat}`);
    });
  } else if (kafkaQueries[args[0]]) {
    // Run specific category
    await runKafkaQueries(client, args[0]);
  } else {
    console.log(`Usage:
  node kafka-monitoring-queries.js              # Run all queries
  node kafka-monitoring-queries.js list         # List categories
  node kafka-monitoring-queries.js <category>   # Run specific category
  node kafka-monitoring-queries.js dashboard    # Create Kafka dashboard
  
Categories: ${Object.keys(kafkaQueries).join(', ')}`);
  }
}

main().catch(console.error);