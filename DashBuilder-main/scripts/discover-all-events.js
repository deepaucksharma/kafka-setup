#!/usr/bin/env node

/**
 * Discover All Event Types
 * Quick script to find all available event types in the account
 */

const dotenv = require('dotenv');
const path = require('path');
const { NerdGraphClient } = require('./src/core/api-client.js');
const chalk = require('chalk');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function discoverAllEvents() {
  const accountId = process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID;
  const apiKey = process.env.UKEY || process.env.NEW_RELIC_API_KEY;
  
  if (!accountId || !apiKey) {
    console.error(chalk.red('Missing account ID or API key'));
    process.exit(1);
  }
  
  console.log(chalk.bold.blue('\n🔍 Discovering All Event Types\n'));
  console.log(chalk.gray(`Account: ${accountId}\n`));
  
  const client = new NerdGraphClient({
    apiKey,
    region: 'US'
  });
  
  try {
    // Get all event types with volume
    console.log(chalk.yellow('Fetching event types...'));
    
    const query = `
      SHOW EVENT TYPES 
      SINCE 1 day ago
    `;
    
    const result = await client.nrql(accountId, query);
    
    if (result?.results) {
      const eventTypes = result.results.map(r => r.eventType).sort();
      
      console.log(chalk.green(`\n✅ Found ${eventTypes.length} event types:\n`));
      
      // Get volume for each event type - filter out problematic ones
      const accountEventTypes = eventTypes.filter(et => 
        !['Entity', 'EntityAudits', 'Relationship'].includes(et)
      );
      
      const volumeQuery = `
        SELECT count(*) 
        FROM ${accountEventTypes.slice(0, 25).join(', ')} 
        FACET eventType() 
        SINCE 1 hour ago
      `;
      
      console.log(chalk.yellow('Getting event volumes...\n'));
      const volumeResult = await client.nrql(accountId, volumeQuery);
      
      const eventVolumes = {};
      if (volumeResult?.results) {
        volumeResult.results.forEach(r => {
          eventVolumes[r.facet[0]] = r.count;
        });
      }
      
      // Display grouped by category
      const categories = {
        'Kafka': [],
        'Queue': [],
        'Infrastructure': [],
        'APM': [],
        'Browser': [],
        'Synthetic': [],
        'Logs': [],
        'Metrics': [],
        'Custom': [],
        'Other': []
      };
      
      eventTypes.forEach(et => {
        const volume = eventVolumes[et] || 0;
        const entry = { name: et, volume };
        
        if (et.toLowerCase().includes('kafka')) {
          categories.Kafka.push(entry);
        } else if (et.includes('Queue')) {
          categories.Queue.push(entry);
        } else if (['SystemSample', 'ProcessSample', 'NetworkSample', 'ContainerSample', 'StorageSample'].includes(et)) {
          categories.Infrastructure.push(entry);
        } else if (['Transaction', 'TransactionError', 'Span'].includes(et)) {
          categories.APM.push(entry);
        } else if (['PageView', 'BrowserInteraction', 'JavaScriptError'].includes(et)) {
          categories.Browser.push(entry);
        } else if (et.includes('Synthetic')) {
          categories.Synthetic.push(entry);
        } else if (et === 'Log') {
          categories.Logs.push(entry);
        } else if (et === 'Metric') {
          categories.Metrics.push(entry);
        } else if (!et.startsWith('Nr') && !et.includes('Entity')) {
          categories.Custom.push(entry);
        } else {
          categories.Other.push(entry);
        }
      });
      
      // Display results
      Object.entries(categories).forEach(([category, events]) => {
        if (events.length > 0) {
          console.log(chalk.bold.white(`${category}:`));
          events.forEach(e => {
            const volumeStr = e.volume > 0 ? chalk.green(`(${e.volume.toLocaleString()} events/hr)`) : chalk.gray('(no data)');
            console.log(`  • ${e.name} ${volumeStr}`);
          });
          console.log('');
        }
      });
      
      // Check for specific Kafka/Queue event types
      console.log(chalk.bold.yellow('📊 Kafka Monitoring Status:\n'));
      
      const kafkaChecks = {
        'KafkaBrokerSample': 'Kafka Broker Monitoring',
        'KafkaTopicSample': 'Kafka Topic Monitoring',
        'KafkaConsumerSample': 'Kafka Consumer Monitoring',
        'KafkaProducerSample': 'Kafka Producer Monitoring',
        'QueueSample': 'Queue/Share Group Monitoring'
      };
      
      Object.entries(kafkaChecks).forEach(([eventType, description]) => {
        const found = eventTypes.includes(eventType);
        const volume = eventVolumes[eventType] || 0;
        const status = found ? (volume > 0 ? '✅' : '⚠️ ') : '❌';
        const volumeStr = volume > 0 ? `(${volume.toLocaleString()} events/hr)` : '';
        console.log(`${status} ${description}: ${found ? eventType : 'Not found'} ${volumeStr}`);
      });
      
      // Save results
      const outputData = {
        timestamp: new Date().toISOString(),
        accountId,
        totalEventTypes: eventTypes.length,
        eventTypes: eventTypes.map(et => ({
          name: et,
          volume: eventVolumes[et] || 0
        })),
        categories,
        kafkaMonitoringStatus: Object.entries(kafkaChecks).map(([et, desc]) => ({
          eventType: et,
          description: desc,
          found: eventTypes.includes(et),
          volume: eventVolumes[et] || 0
        }))
      };
      
      const outputPath = `event-types-discovery-${accountId}-${Date.now()}.json`;
      fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
      console.log(chalk.green(`\n✅ Full results saved to: ${outputPath}\n`));
      
    } else {
      console.log(chalk.red('No event types found'));
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

// Run the discovery
discoverAllEvents().catch(console.error);