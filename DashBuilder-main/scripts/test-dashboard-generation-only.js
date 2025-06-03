#!/usr/bin/env node

/**
 * Test Dashboard Generation Only
 * Generates dashboard config without deployment to debug the structure
 */

const dotenv = require('dotenv');
const path = require('path');
const chalk = require('chalk');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Import required components
const { NerdGraphClient } = require('./src/core/api-client');
const IntelligentDashboardBuilder = require('./discovery-platform/lib/intelligent-dashboard-builder');

async function testDashboardGeneration() {
  console.log(chalk.bold.blue('\n🧠 Testing Dashboard Generation (No Deployment)\n'));
  
  const config = {
    accountId: process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID,
    apiKey: process.env.UKEY || process.env.NEW_RELIC_API_KEY,
    enableAnomalyDetection: true,
    enableCorrelations: true
  };
  
  console.log(chalk.gray(`Account: ${config.accountId}`));
  
  try {
    // Create minimal discovery results
    const discoveryResults = {
      timestamp: new Date().toISOString(),
      accountId: config.accountId,
      eventTypes: [
        {
          name: 'KafkaBrokerSample',
          count: 185,
          volume: 185,
          attributes: [
            { name: 'broker.bytesInPerSecond', type: 'number' },
            { name: 'broker.bytesOutPerSecond', type: 'number' },
            { name: 'broker.messagesInPerSecond', type: 'number' },
            { name: 'request.avgTimeFetch', type: 'number' },
            { name: 'request.produceRequestsFailedPerSecond', type: 'number' },
            { name: 'request.handlerIdle', type: 'number' }
          ]
        },
        {
          name: 'SystemSample',
          count: 94,
          volume: 94,
          attributes: [
            { name: 'cpuPercent', type: 'number' },
            { name: 'memoryUsedPercent', type: 'number' }
          ]
        }
      ],
      metrics: [
        { name: 'newrelic.goldenmetrics.infra.kafkabroker.leaderElectionRate', type: 'gauge', unit: 'per_second' },
        { name: 'newrelic.goldenmetrics.infra.kafkabroker.incomingMessagesPerSecond', type: 'counter', unit: 'per_second' }
      ]
    };
    
    // Override the deployDashboard method to capture the config
    class TestDashboardBuilder extends IntelligentDashboardBuilder {
      async deployDashboard(dashboardConfig) {
        console.log(chalk.yellow('\n📋 Generated Dashboard Configuration:\n'));
        console.log(JSON.stringify(dashboardConfig, null, 2));
        
        // Save to file
        const outputPath = path.join(__dirname, 'generated-dashboard-config.json');
        fs.writeFileSync(outputPath, JSON.stringify(dashboardConfig, null, 2));
        console.log(chalk.gray(`\n💾 Config saved to: ${outputPath}`));
        
        // Return mock result
        return {
          guid: 'test-guid-123',
          name: dashboardConfig.name,
          url: 'https://one.newrelic.com/dashboards/test-guid-123'
        };
      }
    }
    
    const builder = new TestDashboardBuilder(config);
    const result = await builder.buildDashboards(discoveryResults);
    
    console.log(chalk.green('\n✅ Dashboard generation completed successfully!\n'));
    
    // Display analysis
    if (result.analysis) {
      console.log(chalk.bold.white('📊 Analysis Results:'));
      console.log(chalk.gray(`  • Categories: ${Object.keys(result.analysis.categories).join(', ')}`));
      console.log(chalk.gray(`  • Time Series Metrics: ${result.analysis.timeSeries.length}`));
      
      if (result.analysis.goldenSignals) {
        console.log(chalk.white('\nGolden Signals:'));
        Object.entries(result.analysis.goldenSignals).forEach(([signal, metrics]) => {
          if (metrics.length > 0) {
            console.log(chalk.gray(`  • ${signal}: ${metrics.join(', ')}`));
          }
        });
      }
    }
    
    console.log(chalk.bold.cyan('\n🔍 Next Steps:\n'));
    console.log(chalk.white('1. Review the generated dashboard configuration'));
    console.log(chalk.white('2. Check for any invalid widget structures'));
    console.log(chalk.white('3. Validate NRQL queries in the config'));
    console.log(chalk.white('4. Try deploying manually via API or UI'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Error:'), error.message);
    console.error(chalk.gray(error.stack));
  }
}

// Run the test
testDashboardGeneration().catch(console.error);