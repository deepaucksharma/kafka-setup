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

// NRQL query examples
const examples = {
  'discovery': {
    'Show all event types': 'SHOW EVENT TYPES',
    'Show event types with data': 'SHOW EVENT TYPES SINCE 1 week ago',
    'Show attributes for an event': 'SELECT keyset() FROM SystemSample SINCE 1 hour ago',
    'Count events by type': 'SELECT count(*) FROM Metric, SystemSample, InfrastructureEvent FACET eventType() SINCE 1 day ago'
  },
  'system': {
    'System CPU usage': 'SELECT average(cpuPercent) FROM SystemSample TIMESERIES SINCE 1 hour ago',
    'System memory usage': 'SELECT average(memoryUsedPercent) FROM SystemSample TIMESERIES SINCE 1 hour ago',
    'Hosts by CPU': 'SELECT average(cpuPercent) FROM SystemSample FACET hostname SINCE 1 hour ago',
    'Disk usage': 'SELECT average(diskUsedPercent) FROM SystemSample FACET hostname, diskMountPoint SINCE 1 hour ago'
  },
  'metrics': {
    'List all metrics': 'SELECT uniques(metricName) FROM Metric SINCE 1 hour ago LIMIT 100',
    'Metric values': 'SELECT average(value) FROM Metric FACET metricName SINCE 1 hour ago',
    'Metrics by source': 'SELECT count(*) FROM Metric FACET instrumentation.source SINCE 1 hour ago'
  },
  'kafka': {
    'Kafka metrics': 'SELECT uniques(metricName) FROM Metric WHERE metricName LIKE \'kafka%\' SINCE 1 hour ago',
    'Share group metrics': 'SELECT latest(value) FROM Metric WHERE metricName LIKE \'%sharegroup%\' FACET metricName SINCE 1 hour ago',
    'Kafka brokers': 'SELECT count(*) FROM Metric WHERE metricName = \'kafka.broker.BytesInPerSec\' FACET host SINCE 1 hour ago'
  },
  'consumption': {
    'Data ingestion': 'SELECT sum(GigabytesIngested) FROM NrConsumption WHERE productLine = \'DataPlatform\' FACET usageMetric SINCE 1 week ago',
    'Query count': 'SELECT count(*) FROM NrdbQuery FACET query SINCE 1 hour ago LIMIT 10',
    'API calls': 'SELECT count(*) FROM Public_APICall FACET requestUri SINCE 1 hour ago'
  }
};

async function runExample(category, name, query) {
  const client = new NerdGraphClient(config);
  
  console.log(`\n📌 ${category.toUpperCase()} - ${name}`);
  console.log(`🔎 Query: ${query}`);
  
  try {
    const result = await client.nrql(config.accountId, query);
    
    if (result.results && result.results.length > 0) {
      console.log('✅ Results:');
      
      // Format output based on result size
      if (result.results.length <= 5) {
        console.log(JSON.stringify(result.results, null, 2));
      } else {
        console.log(`   Found ${result.results.length} results. Showing first 5:`);
        console.log(JSON.stringify(result.results.slice(0, 5), null, 2));
      }
    } else {
      console.log('ℹ️ No results found');
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

async function main() {
  if (!config.apiKey || !config.accountId) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }

  console.log('🚀 New Relic NRQL Query Examples');
  console.log(`📊 Account ID: ${config.accountId}\n`);

  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Run all examples
    console.log('Running all example queries...\n');
    
    for (const [category, queries] of Object.entries(examples)) {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`Category: ${category.toUpperCase()}`);
      console.log('='.repeat(50));
      
      for (const [name, query] of Object.entries(queries)) {
        await runExample(category, name, query);
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  } else if (args[0] === 'list') {
    // List categories
    console.log('Available categories:');
    Object.keys(examples).forEach(cat => {
      console.log(`  - ${cat}`);
    });
  } else if (examples[args[0]]) {
    // Run specific category
    const category = args[0];
    console.log(`Running ${category} queries...\n`);
    
    for (const [name, query] of Object.entries(examples[category])) {
      await runExample(category, name, query);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } else {
    // Custom query
    const query = args.join(' ');
    await runExample('custom', 'User Query', query);
  }
}

// Run examples
main().catch(console.error);