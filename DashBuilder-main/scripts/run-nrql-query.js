#!/usr/bin/env node

const dotenv = require('dotenv');
const path = require('path');
const { NerdGraphClient } = require('./src/core/api-client.js');

// Load environment variables from parent .env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Map env vars
const config = {
  apiKey: process.env.UKEY || process.env.NEW_RELIC_API_KEY,
  accountId: process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID,
  region: process.env.NEW_RELIC_REGION || 'US'
};

// Check for required config
if (!config.apiKey || !config.accountId) {
  console.error('❌ Missing required environment variables');
  console.error('Please ensure UKEY/NEW_RELIC_API_KEY and ACC/NEW_RELIC_ACCOUNT_ID are set');
  process.exit(1);
}

// Get query from command line
const query = process.argv[2];
if (!query) {
  console.log('Usage: node run-nrql-query.js "YOUR NRQL QUERY"');
  console.log('Example: node run-nrql-query.js "SELECT count(*) FROM Transaction SINCE 1 hour ago"');
  process.exit(1);
}

async function runQuery() {
  try {
    console.log('🔍 Running NRQL query...');
    console.log(`📊 Account: ${config.accountId}`);
    console.log(`🔎 Query: ${query}\n`);

    const client = new NerdGraphClient(config);
    const result = await client.nrql(config.accountId, query);

    console.log('✅ Query executed successfully!\n');
    
    // Display results
    if (result.results && result.results.length > 0) {
      console.log('📊 Results:');
      console.log(JSON.stringify(result.results, null, 2));
      
      // Display metadata if available
      if (result.metadata) {
        console.log('\n📋 Metadata:');
        console.log(`  - Event Types: ${result.metadata.eventTypes?.join(', ') || 'N/A'}`);
        console.log(`  - Facets: ${result.metadata.facets?.join(', ') || 'N/A'}`);
        console.log(`  - Time Window: ${result.metadata.beginTime} to ${result.metadata.endTime}`);
      }
    } else {
      console.log('ℹ️ Query returned no results');
    }
    
    // Display performance info if available
    if (result.performanceStats) {
      console.log('\n⚡ Performance:');
      console.log(`  - Inspected Count: ${result.performanceStats.inspectedCount || 'N/A'}`);
      console.log(`  - Wall Clock Time: ${result.performanceStats.wallClockTime || 'N/A'}ms`);
    }

  } catch (error) {
    console.error('❌ Error executing query:', error.message);
    if (error.response?.data) {
      console.error('API Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Run the query
runQuery();