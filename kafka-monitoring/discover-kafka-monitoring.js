#!/usr/bin/env node

/**
 * Kafka Monitoring Discovery Script
 * Discovers all Kafka-related monitoring data based on VERIFY_MONITORING_NRQL.md
 */

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const apiKey = process.env.NEW_RELIC_API_KEY || process.env.UKEY || process.env.IKEY;
const accountId = process.env.NEW_RELIC_ACCOUNT_ID || process.env.ACC || '3630072';

// Core NRQL queries to verify Kafka monitoring
const verificationQueries = {
  // Mechanism 1: nri-kafka (Traditional Kafka Metrics)
  'nri-kafka': {
    'Integration Status': `
      FROM SystemSample 
      SELECT uniqueCount(entityName) 
      WHERE entityName LIKE '%kafka%' 
      FACET nr.integrationName 
      SINCE 30 minutes ago
    `,
    'Broker Metrics': `
      FROM KafkaBrokerSample 
      SELECT count(*), latest(broker.bytesInPerSecond), latest(broker.bytesOutPerSecond) 
      FACET entityName 
      SINCE 10 minutes ago
    `,
    'Topic Metrics': `
      FROM KafkaTopicSample 
      SELECT count(*), uniqueCount(topic), latest(topic.partitions) 
      FACET topic 
      SINCE 10 minutes ago
    `,
    'Consumer Metrics': `
      FROM KafkaConsumerSample 
      SELECT count(*), latest(consumer.lag), latest(consumer.offset) 
      FACET consumerGroup, topic 
      SINCE 10 minutes ago
    `,
    'All Kafka Event Types': `
      FROM KafkaBrokerSample, KafkaTopicSample, KafkaConsumerSample, KafkaOffsetSample, KafkaPartitionSample 
      SELECT count(*) 
      FACET eventType() 
      SINCE 30 minutes ago
    `
  },
  
  // Mechanism 2: nri-flex (Prometheus Scraper)
  'nri-flex': {
    'Flex Integration Status': `
      FROM IntegrationSample 
      SELECT latest(timestamp) 
      WHERE integrationName = 'nri-flex' 
      FACET entityName 
      SINCE 10 minutes ago
    `,
    'Share Group Metrics': `
      FROM Metric 
      SELECT latest(kafka_sharegroup_records_unacked), 
             latest(kafka_sharegroup_records_acknowledged),
             latest(kafka_sharegroup_oldest_unacked_ms) 
      WHERE metricName LIKE 'kafka_sharegroup%' 
      FACET group, topic, partition 
      SINCE 10 minutes ago
    `,
    'JMX Metrics': `
      FROM Metric 
      SELECT count(*), uniqueCount(metricName) 
      WHERE metricName LIKE 'kafka%' 
      SINCE 10 minutes ago
    `,
    'All Prometheus Metrics': `
      FROM Metric 
      SELECT uniqueCount(metricName) as 'Unique Metrics' 
      WHERE cluster = 'kafka-k8s-cluster' OR job = 'kafka' 
      SINCE 30 minutes ago
    `
  },
  
  // Mechanism 3: Custom OHI (QueueSample events)
  'custom-ohi': {
    'QueueSample Events': `
      FROM QueueSample 
      SELECT count(*), uniqueCount(share.group.name), uniqueCount(topic.name) 
      WHERE provider = 'kafka' 
      SINCE 10 minutes ago
    `,
    'Share Group Details': `
      FROM QueueSample 
      SELECT latest(queue.size), 
             latest(oldest.message.age.seconds),
             latest(messages.acknowledged) 
      WHERE provider = 'kafka' 
      FACET share.group.name, topic.name 
      SINCE 10 minutes ago
    `,
    'Processing Rates': `
      FROM QueueSample 
      SELECT rate(sum(messages.acknowledged), 1 minute) as 'Messages/min' 
      WHERE provider = 'kafka' 
      FACET share.group.name 
      TIMESERIES 1 minute 
      SINCE 30 minutes ago
    `
  },
  
  // Combined Views
  'combined': {
    'Zero Lag Fallacy Check': `
      FROM KafkaBrokerSample, QueueSample 
      SELECT latest(consumer.lag) as 'Traditional Lag', 
             latest(queue.size) as 'Actual Unacked' 
      WHERE consumer.group.name = share.group.name 
      FACET consumer.group.name 
      SINCE 1 hour ago
    `,
    'All Kafka Data Sources': `
      SELECT count(*) 
      FROM KafkaBrokerSample, KafkaTopicSample, KafkaConsumerSample, 
           KafkaOffsetSample, KafkaPartitionSample, QueueSample, Metric 
      WHERE provider = 'kafka' OR clusterName IS NOT NULL OR metricName LIKE 'kafka%' 
      FACET eventType() 
      SINCE 1 hour ago
    `
  }
};

async function runNRQL(query) {
  const response = await fetch(`https://api.newrelic.com/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'API-Key': apiKey
    },
    body: JSON.stringify({
      query: `
        query($accountId: Int!, $nrql: Nrql!) {
          actor {
            account(id: $accountId) {
              nrql(query: $nrql) {
                results
              }
            }
          }
        }
      `,
      variables: {
        accountId: parseInt(accountId),
        nrql: query.trim()
      }
    })
  });

  const data = await response.json();
  return data?.data?.actor?.account?.nrql?.results || null;
}

async function discoverKafkaMonitoring() {
  console.log('🚀 Kafka Monitoring Discovery');
  console.log(`📊 Account: ${accountId}`);
  console.log('='.repeat(60) + '\n');
  
  const discoveries = {
    timestamp: new Date().toISOString(),
    accountId,
    mechanisms: {},
    summary: {
      totalQueries: 0,
      successfulQueries: 0,
      dataFound: {},
      recommendations: []
    }
  };
  
  // Run all verification queries
  for (const [mechanism, queries] of Object.entries(verificationQueries)) {
    console.log(`\n📌 Checking ${mechanism.toUpperCase()}`);
    console.log('-'.repeat(40));
    
    discoveries.mechanisms[mechanism] = {};
    
    for (const [queryName, query] of Object.entries(queries)) {
      console.log(`\n🔍 ${queryName}:`);
      discoveries.summary.totalQueries++;
      
      try {
        const result = await runNRQL(query);
        
        if (result && result.length > 0) {
          discoveries.summary.successfulQueries++;
          discoveries.mechanisms[mechanism][queryName] = {
            hasData: true,
            resultCount: result.length,
            sample: result[0]
          };
          
          // Print summary
          console.log(`✅ Found data: ${result.length} results`);
          
          // Print first result as sample
          if (result[0]) {
            console.log('📊 Sample:', JSON.stringify(result[0], null, 2).split('\n').slice(0, 5).join('\n') + '...');
          }
        } else {
          discoveries.mechanisms[mechanism][queryName] = {
            hasData: false,
            resultCount: 0
          };
          console.log('❌ No data found');
        }
      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        discoveries.mechanisms[mechanism][queryName] = {
          hasData: false,
          error: error.message
        };
      }
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Generate summary and recommendations
  console.log('\n' + '='.repeat(60));
  console.log('📊 DISCOVERY SUMMARY');
  console.log('='.repeat(60));
  
  // Check each mechanism
  const hasNriKafka = Object.values(discoveries.mechanisms['nri-kafka']).some(r => r.hasData);
  const hasNriFlex = Object.values(discoveries.mechanisms['nri-flex']).some(r => r.hasData);
  const hasCustomOHI = Object.values(discoveries.mechanisms['custom-ohi']).some(r => r.hasData);
  
  console.log(`\n✅ Active Monitoring Mechanisms:`);
  if (hasNriKafka) console.log('  • nri-kafka (Traditional Kafka Integration)');
  if (hasNriFlex) console.log('  • nri-flex (Prometheus Metrics)');
  if (hasCustomOHI) console.log('  • Custom OHI (QueueSample Events)');
  
  console.log(`\n❌ Missing Monitoring Mechanisms:`);
  if (!hasNriKafka) {
    console.log('  • nri-kafka - No KafkaBrokerSample events found');
    discoveries.summary.recommendations.push('Deploy New Relic Kafka Integration (nri-kafka)');
  }
  if (!hasNriFlex) {
    console.log('  • nri-flex - No Prometheus metrics found');
    discoveries.summary.recommendations.push('Configure nri-flex to scrape Prometheus endpoint');
  }
  if (!hasCustomOHI) {
    console.log('  • Custom OHI - No QueueSample events found');
    discoveries.summary.recommendations.push('Deploy Custom OHI for Share Groups monitoring');
  }
  
  // Save results
  const outputFile = `kafka-discovery-${Date.now()}.json`;
  fs.writeFileSync(outputFile, JSON.stringify(discoveries, null, 2));
  console.log(`\n💾 Full results saved to: ${outputFile}`);
  
  // Generate NRQL queries file
  const nrqlFile = `kafka-monitoring-queries.nrql`;
  let nrqlContent = '# Kafka Monitoring NRQL Queries\n\n';
  
  for (const [mechanism, queries] of Object.entries(verificationQueries)) {
    nrqlContent += `## ${mechanism}\n\n`;
    for (const [name, query] of Object.entries(queries)) {
      nrqlContent += `-- ${name}\n${query.trim()}\n\n`;
    }
  }
  
  fs.writeFileSync(nrqlFile, nrqlContent);
  console.log(`📝 NRQL queries saved to: ${nrqlFile}`);
  
  return discoveries;
}

// Main execution
if (require.main === module) {
  if (!apiKey) {
    console.error('❌ Missing API key. Set NEW_RELIC_API_KEY in environment');
    process.exit(1);
  }
  
  discoverKafkaMonitoring()
    .then(() => console.log('\n✅ Discovery complete!'))
    .catch(error => {
      console.error('\n❌ Discovery failed:', error);
      process.exit(1);
    });
}