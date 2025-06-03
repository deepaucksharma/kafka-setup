#!/usr/bin/env node

/**
 * Simple Event Discovery
 * Discover event types one by one to avoid mixing issues
 */

const dotenv = require('dotenv');
const path = require('path');
const { NerdGraphClient } = require('./src/core/api-client.js');
const chalk = require('chalk');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function simpleEventDiscovery() {
  const accountId = process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID;
  const apiKey = process.env.UKEY || process.env.NEW_RELIC_API_KEY;
  
  if (!accountId || !apiKey) {
    console.error(chalk.red('Missing account ID or API key'));
    process.exit(1);
  }
  
  console.log(chalk.bold.blue('\n🔍 Simple Event Type Discovery\n'));
  console.log(chalk.gray(`Account: ${accountId}\n`));
  
  const client = new NerdGraphClient({
    apiKey,
    region: 'US'
  });
  
  // Common event types to check
  const eventTypesToCheck = [
    // Kafka
    'KafkaBrokerSample',
    'KafkaTopicSample', 
    'KafkaConsumerSample',
    'KafkaProducerSample',
    'QueueSample',
    
    // Infrastructure
    'SystemSample',
    'ProcessSample',
    'NetworkSample',
    'ContainerSample',
    'StorageSample',
    
    // APM
    'Transaction',
    'TransactionError',
    'Span',
    
    // Other
    'Log',
    'Metric',
    'InfrastructureEvent',
    'PageView',
    'SyntheticCheck'
  ];
  
  const results = [];
  
  console.log(chalk.yellow('Checking event types...\n'));
  
  for (const eventType of eventTypesToCheck) {
    try {
      const query = `SELECT count(*) FROM ${eventType} SINCE 1 hour ago`;
      const result = await client.nrql(accountId, query);
      
      if (result?.results?.[0]?.count > 0) {
        console.log(chalk.green(`✅ ${eventType}: ${result.results[0].count.toLocaleString()} events`));
        results.push({
          eventType,
          count: result.results[0].count,
          found: true
        });
      } else {
        console.log(chalk.gray(`⚪ ${eventType}: No data`));
        results.push({
          eventType,
          count: 0,
          found: false
        });
      }
    } catch (error) {
      if (error.message.includes('does not exist')) {
        console.log(chalk.red(`❌ ${eventType}: Not available`));
        results.push({
          eventType,
          count: 0,
          found: false,
          error: 'Not available'
        });
      } else {
        console.log(chalk.red(`❌ ${eventType}: Error - ${error.message}`));
        results.push({
          eventType,
          count: 0,
          found: false,
          error: error.message
        });
      }
    }
  }
  
  // Summary
  console.log(chalk.bold.cyan('\n📊 Summary:\n'));
  
  const kafkaResults = results.filter(r => 
    ['KafkaBrokerSample', 'KafkaTopicSample', 'KafkaConsumerSample', 'KafkaProducerSample', 'QueueSample'].includes(r.eventType)
  );
  
  console.log(chalk.white('Kafka Monitoring:'));
  kafkaResults.forEach(r => {
    const status = r.found && r.count > 0 ? '✅' : r.found ? '⚠️ ' : '❌';
    console.log(`  ${status} ${r.eventType}: ${r.found ? r.count.toLocaleString() + ' events' : r.error || 'No data'}`);
  });
  
  const hasKafkaData = kafkaResults.some(r => r.found && r.count > 0);
  
  if (hasKafkaData) {
    console.log(chalk.green('\n✅ Kafka monitoring data is available!'));
    
    console.log(chalk.yellow('\n📝 Suggested queries:\n'));
    
    if (results.find(r => r.eventType === 'QueueSample' && r.count > 0)) {
      console.log(chalk.white('Share Group Monitoring:'));
      console.log(chalk.gray('SELECT latest(queue.size), latest(oldest.message.age.seconds) FROM QueueSample WHERE provider = \'kafka\' FACET share.group.name SINCE 1 hour ago\n'));
    }
    
    if (results.find(r => r.eventType === 'KafkaBrokerSample' && r.count > 0)) {
      console.log(chalk.white('Broker Performance:'));
      console.log(chalk.gray('SELECT average(broker.bytesInPerSecond), average(broker.bytesOutPerSecond), average(broker.messagesInPerSecond) FROM KafkaBrokerSample TIMESERIES AUTO SINCE 1 hour ago\n'));
    }
    
    if (results.find(r => r.eventType === 'KafkaTopicSample' && r.count > 0)) {
      console.log(chalk.white('Topic Activity:'));
      console.log(chalk.gray('SELECT sum(topic.bytesInPerSec), sum(topic.bytesOutPerSec) FROM KafkaTopicSample FACET topic.topicName SINCE 1 hour ago\n'));
    }
  } else {
    console.log(chalk.red('\n❌ No Kafka monitoring data found.'));
    console.log(chalk.yellow('\nPossible reasons:'));
    console.log(chalk.gray('  • Kafka integration not installed'));
    console.log(chalk.gray('  • No Kafka brokers running'));
    console.log(chalk.gray('  • Data not yet available (wait a few minutes)'));
  }
  
}

// Run the discovery
simpleEventDiscovery().catch(console.error);