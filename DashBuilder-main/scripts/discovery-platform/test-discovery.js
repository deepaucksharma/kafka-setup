#!/usr/bin/env node

/**
 * Test script for the Discovery Platform
 * Demonstrates various discovery scenarios and configurations
 */

const DiscoveryPlatform = require('./index');
const path = require('path');

// Test configurations
const testScenarios = [
  {
    name: 'Quick Kafka Discovery',
    config: {
      maxEventTypesToProcess: 10,
      maxAttributesPerEventType: 20,
      generateDashboard: true,
      discoverMetrics: true,
      discoverLogs: false,
      discoverTraces: false
    },
    description: 'Fast discovery focused on Kafka-related data'
  },
  
  {
    name: 'Full Discovery with Low Rate Limit',
    config: {
      maxConcurrentQueries: 5,
      queriesPerMinute: 1000,
      queryTimeout: 45000,
      maxEventTypesToProcess: 30,
      generateDashboard: true
    },
    description: 'Conservative discovery for accounts with rate limit concerns'
  },
  
  {
    name: 'Metrics-Only Discovery',
    config: {
      discoverMetrics: true,
      discoverTraces: false,
      discoverLogs: false,
      discoverCustomEvents: false,
      maxEventTypesToProcess: 5,
      generateDashboard: false
    },
    description: 'Focus only on metric discovery'
  },
  
  {
    name: 'High-Performance Discovery',
    config: {
      maxConcurrentQueries: 20,
      queriesPerMinute: 2500,
      parallelBatchSize: 10,
      maxAttributesPerEventType: 50,
      enableCache: true,
      cacheSize: 2000
    },
    description: 'Maximum performance configuration'
  }
];

async function runTest(scenario) {
  console.log('\n' + '='.repeat(60));
  console.log(`🧪 Test Scenario: ${scenario.name}`);
  console.log(`📝 Description: ${scenario.description}`);
  console.log('='.repeat(60) + '\n');
  
  const platform = new DiscoveryPlatform(scenario.config);
  
  // Set up event listeners
  let discoveryCount = 0;
  let errorCount = 0;
  const startTime = Date.now();
  
  platform.on('discovery', ({ type, data }) => {
    discoveryCount++;
    console.log(`✅ Discovered ${type}: ${data.name || data}`);
  });
  
  platform.on('error', (error) => {
    errorCount++;
    console.error(`❌ Error: ${error.message}`);
  });
  
  platform.on('rateLimitReached', ({ waitTime }) => {
    console.log(`⏸️  Rate limit reached, waiting ${Math.round(waitTime / 1000)}s`);
  });
  
  try {
    const results = await platform.discover();
    const duration = (Date.now() - startTime) / 1000;
    
    console.log('\n' + '-'.repeat(40));
    console.log('📊 Test Results:');
    console.log(`  Duration: ${duration.toFixed(1)}s`);
    console.log(`  Event Types: ${results.eventTypes.length}`);
    console.log(`  Metrics: ${results.metrics.length} groups`);
    console.log(`  Queries Generated: ${results.queries.length}`);
    console.log(`  Insights: ${results.insights.length}`);
    console.log(`  Discoveries: ${discoveryCount}`);
    console.log(`  Errors: ${errorCount}`);
    console.log(`  Dashboard: ${results.dashboardUrl || 'Not created'}`);
    console.log('-'.repeat(40));
    
    return { success: true, duration, results };
    
  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runAllTests() {
  console.log('🚀 Starting Discovery Platform Tests');
  console.log(`📍 Account: ${process.env.NEW_RELIC_ACCOUNT_ID || process.env.ACC}`);
  
  const results = [];
  
  for (const scenario of testScenarios) {
    const result = await runTest(scenario);
    results.push({
      scenario: scenario.name,
      ...result
    });
    
    // Wait between tests to avoid overwhelming the API
    if (testScenarios.indexOf(scenario) < testScenarios.length - 1) {
      console.log('\n⏳ Waiting 30 seconds before next test...\n');
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary:');
  console.log('='.repeat(60));
  
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    const duration = result.duration ? `${result.duration.toFixed(1)}s` : 'N/A';
    console.log(`${status} ${result.scenario}: ${duration}`);
  });
  
  const successCount = results.filter(r => r.success).length;
  console.log(`\nTotal: ${successCount}/${results.length} tests passed`);
}

// Run specific test or all tests
const testName = process.argv[2];

if (testName) {
  const scenario = testScenarios.find(s => 
    s.name.toLowerCase().includes(testName.toLowerCase())
  );
  
  if (scenario) {
    runTest(scenario).catch(console.error);
  } else {
    console.error(`Test scenario not found: ${testName}`);
    console.log('Available scenarios:');
    testScenarios.forEach(s => console.log(`  - ${s.name}`));
  }
} else {
  runAllTests().catch(console.error);
}