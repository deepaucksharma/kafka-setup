#!/usr/bin/env node

/**
 * Quick Kafka Discovery Script
 * Focused discovery for Kafka-related monitoring data
 */

const dotenv = require('dotenv');
const path = require('path');
const { NerdGraphClient } = require('./src/core/api-client.js');
const ora = require('ora');
const chalk = require('chalk');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function discoverKafkaMonitoring() {
  const accountId = process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID;
  const apiKey = process.env.UKEY || process.env.NEW_RELIC_API_KEY;
  
  if (!accountId || !apiKey) {
    console.error(chalk.red('Missing account ID or API key'));
    process.exit(1);
  }
  
  console.log(chalk.bold.blue('\n🚀 Quick Kafka Discovery\n'));
  console.log(chalk.gray(`Account: ${accountId}`));
  
  const client = new NerdGraphClient({
    apiKey,
    region: 'US'
  });
  
  const spinner = ora('Starting Kafka discovery...').start();
  const discoveries = {
    timestamp: new Date().toISOString(),
    accountId,
    kafka: {},
    queues: {},
    metrics: [],
    summary: {}
  };
  
  try {
    // Step 1: Check for Kafka event types
    spinner.text = 'Checking for Kafka broker data...';
    
    const kafkaQuery = `
      SELECT count(*) 
      FROM KafkaBrokerSample, KafkaTopicSample, KafkaConsumerSample, KafkaProducerSample 
      FACET eventType() 
      SINCE 1 hour ago
    `;
    
    const kafkaResult = await client.nrql(accountId, kafkaQuery);
    
    if (kafkaResult?.results) {
      discoveries.kafka.eventTypes = kafkaResult.results.map(r => ({
        type: r.facet[0],
        count: r.count
      }));
      spinner.succeed('Found Kafka event types');
    } else {
      spinner.warn('No Kafka event types found');
    }
    
    // Step 2: Check for QueueSample (Share Groups)
    spinner.start('Checking for Queue/Share Group data...');
    
    const queueQuery = `
      SELECT 
        count(*) as samples,
        uniqueCount(share.group.name) as shareGroups,
        sum(queue.size) as totalBacklog,
        max(oldest.message.age.seconds) as maxAge
      FROM QueueSample 
      WHERE provider = 'kafka' 
      SINCE 1 hour ago
    `;
    
    const queueResult = await client.nrql(accountId, queueQuery);
    
    if (queueResult?.results?.[0]?.samples > 0) {
      discoveries.queues = queueResult.results[0];
      spinner.succeed('Found Queue/Share Group data');
      
      // Get share group details
      const shareGroupQuery = `
        SELECT 
          latest(queue.size) as backlog,
          latest(oldest.message.age.seconds) as oldestAge,
          rate(sum(messages.acknowledged), 1 minute) as ackRate
        FROM QueueSample 
        WHERE provider = 'kafka' 
        FACET share.group.name 
        SINCE 30 minutes ago 
        LIMIT 20
      `;
      
      const shareGroupResult = await client.nrql(accountId, shareGroupQuery);
      if (shareGroupResult?.results) {
        discoveries.queues.shareGroups = shareGroupResult.results.map(r => ({
          name: r.facet[0],
          backlog: r['latest.queue.size'],
          oldestAge: r['latest.oldest.message.age.seconds'],
          ackRate: r['rate.sum.messages.acknowledged']
        }));
      }
    } else {
      spinner.warn('No Queue/Share Group data found');
    }
    
    // Step 3: Check for Kafka metrics
    spinner.start('Checking for Kafka metrics...');
    
    const metricsQuery = `
      SELECT uniques(metricName, 100) 
      FROM Metric 
      WHERE metricName LIKE '%kafka%' 
      SINCE 1 hour ago
    `;
    
    const metricsResult = await client.nrql(accountId, metricsQuery);
    
    if (metricsResult?.results?.[0]) {
      discoveries.metrics = metricsResult.results[0]['uniques.metricName'] || [];
      spinner.succeed(`Found ${discoveries.metrics.length} Kafka metrics`);
    } else {
      spinner.warn('No Kafka metrics found');
    }
    
    // Step 4: Get broker performance
    if (discoveries.kafka.eventTypes?.some(e => e.type === 'KafkaBrokerSample')) {
      spinner.start('Analyzing broker performance...');
      
      const brokerQuery = `
        SELECT 
          average(broker.bytesInPerSecond) as avgBytesIn,
          average(broker.bytesOutPerSecond) as avgBytesOut,
          average(broker.messagesInPerSecond) as avgMessagesIn,
          uniqueCount(entity.name) as brokerCount
        FROM KafkaBrokerSample 
        SINCE 30 minutes ago
      `;
      
      const brokerResult = await client.nrql(accountId, brokerQuery);
      if (brokerResult?.results?.[0]) {
        discoveries.kafka.brokerPerformance = brokerResult.results[0];
        spinner.succeed('Analyzed broker performance');
      }
    }
    
    // Step 5: Get topic information
    if (discoveries.kafka.eventTypes?.some(e => e.type === 'KafkaTopicSample')) {
      spinner.start('Getting topic information...');
      
      const topicQuery = `
        SELECT 
          uniqueCount(topic.topicName) as topicCount,
          sum(topic.partitionCount) as totalPartitions
        FROM KafkaTopicSample 
        SINCE 30 minutes ago
      `;
      
      const topicResult = await client.nrql(accountId, topicQuery);
      if (topicResult?.results?.[0]) {
        discoveries.kafka.topicInfo = topicResult.results[0];
        spinner.succeed('Got topic information');
      }
    }
    
    // Generate summary
    discoveries.summary = {
      hasKafkaBrokers: discoveries.kafka.eventTypes?.some(e => e.type === 'KafkaBrokerSample'),
      hasShareGroups: discoveries.queues.samples > 0,
      hasKafkaMetrics: discoveries.metrics.length > 0,
      totalShareGroups: discoveries.queues.shareGroups || 0,
      totalBacklog: discoveries.queues.totalBacklog || 0,
      brokerCount: discoveries.kafka.brokerPerformance?.brokerCount || 0,
      topicCount: discoveries.kafka.topicInfo?.topicCount || 0
    };
    
    // Display results
    console.log(chalk.bold.cyan('\n📊 Discovery Summary:\n'));
    
    console.log(chalk.white('Kafka Infrastructure:'));
    console.log(chalk.gray(`  • Brokers: ${discoveries.summary.brokerCount || 'Not found'}`));
    console.log(chalk.gray(`  • Topics: ${discoveries.summary.topicCount || 'Not found'}`));
    console.log(chalk.gray(`  • Partitions: ${discoveries.kafka.topicInfo?.totalPartitions || 'Not found'}`));
    
    if (discoveries.summary.hasShareGroups) {
      console.log(chalk.white('\nShare Groups:'));
      console.log(chalk.gray(`  • Active Groups: ${discoveries.summary.totalShareGroups}`));
      console.log(chalk.gray(`  • Total Backlog: ${discoveries.summary.totalBacklog.toLocaleString()}`));
      console.log(chalk.gray(`  • Max Message Age: ${discoveries.queues.maxAge}s`));
    }
    
    if (discoveries.kafka.brokerPerformance) {
      console.log(chalk.white('\nBroker Performance:'));
      console.log(chalk.gray(`  • Throughput In: ${Math.round(discoveries.kafka.brokerPerformance.avgBytesIn).toLocaleString()} bytes/sec`));
      console.log(chalk.gray(`  • Throughput Out: ${Math.round(discoveries.kafka.brokerPerformance.avgBytesOut).toLocaleString()} bytes/sec`));
      console.log(chalk.gray(`  • Messages In: ${Math.round(discoveries.kafka.brokerPerformance.avgMessagesIn).toLocaleString()} msg/sec`));
    }
    
    console.log(chalk.white('\nData Availability:'));
    console.log(chalk.gray(`  • Kafka Brokers: ${discoveries.summary.hasKafkaBrokers ? '✅' : '❌'}`));
    console.log(chalk.gray(`  • Share Groups: ${discoveries.summary.hasShareGroups ? '✅' : '❌'}`));
    console.log(chalk.gray(`  • Kafka Metrics: ${discoveries.summary.hasKafkaMetrics ? '✅' : '❌'}`));
    
    // Save results
    const outputPath = `kafka-discovery-${accountId}-${Date.now()}.json`;
    fs.writeFileSync(outputPath, JSON.stringify(discoveries, null, 2));
    console.log(chalk.green(`\n✅ Results saved to: ${outputPath}\n`));
    
    // Generate recommended queries
    console.log(chalk.bold.yellow('📝 Recommended NRQL Queries:\n'));
    
    if (discoveries.summary.hasShareGroups) {
      console.log(chalk.white('Share Group Health:'));
      console.log(chalk.gray(`SELECT latest(queue.size), latest(oldest.message.age.seconds) FROM QueueSample WHERE provider = 'kafka' FACET share.group.name SINCE 1 hour ago\n`));
    }
    
    if (discoveries.summary.hasKafkaBrokers) {
      console.log(chalk.white('Broker Performance:'));
      console.log(chalk.gray(`SELECT average(broker.bytesInPerSecond), average(broker.bytesOutPerSecond) FROM KafkaBrokerSample TIMESERIES AUTO SINCE 1 hour ago\n`));
      
      console.log(chalk.white('Topic Activity:'));
      console.log(chalk.gray(`SELECT sum(topic.bytesInPerSec), sum(topic.bytesOutPerSec) FROM KafkaTopicSample FACET topic.topicName SINCE 1 hour ago\n`));
    }
    
  } catch (error) {
    spinner.fail('Discovery failed');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

// Run the discovery
discoverKafkaMonitoring().catch(console.error);