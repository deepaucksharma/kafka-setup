#!/usr/bin/env node

/**
 * Run Intelligent Kafka Dashboard Generation
 * Creates a comprehensive dashboard using discovered Kafka metrics
 */

const dotenv = require('dotenv');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Import discovery platform components
const DiscoveryEngine = require('./discovery-platform/lib/discovery-engine');
const DashboardBuilder = require('./discovery-platform/lib/dashboard-builder');
const { NerdGraphClient } = require('./src/core/api-client');

async function runIntelligentKafkaDashboard() {
  console.log(chalk.bold.blue('\n🚀 Intelligent Kafka Dashboard Generation\n'));
  
  const config = {
    accountId: process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID,
    apiKey: process.env.UKEY || process.env.NEW_RELIC_API_KEY,
    enableIntelligentDashboards: true,
    enableAnomalyDetection: true,
    enableCorrelations: true,
    maxConcurrentQueries: 5
  };
  
  if (!config.accountId || !config.apiKey) {
    console.error(chalk.red('Missing account ID or API key'));
    process.exit(1);
  }
  
  console.log(chalk.gray(`Account: ${config.accountId}`));
  console.log(chalk.gray(`Region: US\n`));
  
  const spinner = ora('Initializing discovery platform...').start();
  
  try {
    // Initialize NerdGraph client
    const client = new NerdGraphClient({
      apiKey: config.apiKey,
      region: 'US'
    });
    
    // Initialize discovery engine
    const discoveryEngine = new DiscoveryEngine({
      client,
      config
    });
    
    // Initialize dashboard builder
    const dashboardBuilder = new DashboardBuilder({
      client,
      config
    });
    
    spinner.text = 'Running Kafka metric discovery...';
    
    // Run targeted Kafka discovery
    const discoveryConfig = {
      eventTypes: [
        'KafkaBrokerSample',
        'KafkaTopicSample', 
        'KafkaConsumerSample',
        'KafkaProducerSample',
        'QueueSample'
      ],
      metrics: [
        'kafka',
        'queue',
        'newrelic.goldenmetrics.infra.kafka'
      ],
      timeRange: 'SINCE 1 hour ago',
      includeRelationships: true,
      includeAttributes: true
    };
    
    // Execute discovery
    const discoveries = await discoveryEngine.discover(discoveryConfig);
    
    spinner.succeed('Discovery completed');
    
    // Display discovery results
    console.log(chalk.bold.white('\n📊 Discovery Results:\n'));
    
    if (discoveries.eventTypes && discoveries.eventTypes.length > 0) {
      console.log(chalk.white('Event Types Found:'));
      discoveries.eventTypes.forEach(et => {
        console.log(chalk.gray(`  • ${et.name}: ${et.volume?.toLocaleString() || 'N/A'} events`));
      });
    }
    
    if (discoveries.metrics && discoveries.metrics.length > 0) {
      console.log(chalk.white('\nMetrics Discovered:'));
      const metricCount = discoveries.metrics.reduce((sum, group) => 
        sum + (group.metrics?.length || 0), 0
      );
      console.log(chalk.gray(`  • Total metrics: ${metricCount}`));
      
      discoveries.metrics.forEach(group => {
        if (group.metrics && group.metrics.length > 0) {
          console.log(chalk.gray(`  • ${group.name}: ${group.metrics.length} metrics`));
        }
      });
    }
    
    // Generate intelligent dashboard
    spinner.start('Generating intelligent dashboard...');
    
    const dashboardResult = await dashboardBuilder.build(discoveries);
    
    spinner.succeed('Dashboard generated successfully');
    
    // Display dashboard information
    console.log(chalk.bold.white('\n📊 Dashboard Created:\n'));
    console.log(chalk.gray(`  • Type: ${dashboardResult.type}`));
    console.log(chalk.gray(`  • Name: ${dashboardResult.dashboard?.name || 'N/A'}`));
    console.log(chalk.gray(`  • URL: ${dashboardResult.url}`));
    console.log(chalk.gray(`  • GUID: ${dashboardResult.guid}`));
    
    // Display analysis insights if available
    if (dashboardResult.analysis) {
      console.log(chalk.bold.white('\n🔍 Analysis Insights:\n'));
      
      // Golden signals
      const goldenSignals = dashboardResult.analysis.goldenSignals;
      if (goldenSignals) {
        console.log(chalk.white('Golden Signals Coverage:'));
        console.log(chalk.gray(`  • Latency metrics: ${goldenSignals.latency?.length || 0}`));
        console.log(chalk.gray(`  • Traffic metrics: ${goldenSignals.traffic?.length || 0}`));
        console.log(chalk.gray(`  • Error metrics: ${goldenSignals.errors?.length || 0}`));
        console.log(chalk.gray(`  • Saturation metrics: ${goldenSignals.saturation?.length || 0}`));
      }
      
      // Categories
      if (dashboardResult.analysis.categories) {
        console.log(chalk.white('\nMetric Categories:'));
        Object.entries(dashboardResult.analysis.categories).forEach(([category, metrics]) => {
          console.log(chalk.gray(`  • ${category}: ${metrics.length} metrics`));
        });
      }
    }
    
    // Display correlations if found
    if (dashboardResult.correlations?.strong?.length > 0) {
      console.log(chalk.bold.white('\n🔗 Strong Correlations Found:\n'));
      dashboardResult.correlations.strong.slice(0, 5).forEach(corr => {
        console.log(chalk.gray(`  • ${corr.metric1} ↔ ${corr.metric2}`));
        console.log(chalk.gray(`    Type: ${corr.type}, Confidence: ${(corr.confidence * 100).toFixed(0)}%`));
      });
    }
    
    // Display generated insights
    if (dashboardResult.insights && dashboardResult.insights.length > 0) {
      console.log(chalk.bold.white('\n💡 Generated Insights:\n'));
      dashboardResult.insights.forEach(insight => {
        const icon = insight.severity === 'high' ? '🔴' : 
                    insight.severity === 'medium' ? '🟡' : '🟢';
        console.log(chalk.gray(`  ${icon} ${insight.message}`));
      });
    }
    
    // Save complete results
    const outputData = {
      timestamp: new Date().toISOString(),
      config,
      discoveries,
      dashboardResult
    };
    
    const outputPath = path.join(__dirname, `kafka-intelligent-dashboard-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    
    console.log(chalk.gray(`\n💾 Complete results saved to: ${outputPath}`));
    
    // Show example widgets created
    console.log(chalk.bold.yellow('\n📝 Sample Dashboard Widgets Created:\n'));
    
    // Extract some widget examples
    if (dashboardResult.dashboard?.pages) {
      dashboardResult.dashboard.pages.forEach(page => {
        console.log(chalk.white(`Page: ${page.name}`));
        if (page.widgets && page.widgets.length > 0) {
          page.widgets.slice(0, 3).forEach(widget => {
            console.log(chalk.gray(`  • ${widget.title}`));
          });
        }
      });
    }
    
    // Provide next steps
    console.log(chalk.bold.cyan('\n📋 Next Steps:\n'));
    console.log(chalk.white('1. View your dashboard:'));
    console.log(chalk.gray(`   ${dashboardResult.url}\n`));
    
    console.log(chalk.white('2. Set up recommended alerts:'));
    if (dashboardResult.analysis?.goldenSignals?.errors?.length > 0) {
      console.log(chalk.gray('   • Error rate alerts for critical services'));
    }
    if (dashboardResult.analysis?.goldenSignals?.latency?.length > 0) {
      console.log(chalk.gray('   • Latency threshold alerts'));
    }
    console.log(chalk.gray('   • Resource saturation alerts\n'));
    
    console.log(chalk.white('3. Enable additional monitoring:'));
    if (!discoveries.eventTypes?.find(et => et.name === 'KafkaTopicSample')) {
      console.log(chalk.gray('   • Enable Kafka topic monitoring'));
    }
    if (!discoveries.eventTypes?.find(et => et.name === 'QueueSample')) {
      console.log(chalk.gray('   • Deploy Share Group monitoring'));
    }
    
  } catch (error) {
    spinner.fail('Dashboard generation failed');
    console.error(chalk.red('\n❌ Error:'), error.message);
    
    if (error.stack) {
      console.error(chalk.gray('\nStack trace:'));
      console.error(chalk.gray(error.stack));
    }
    
    // Provide troubleshooting
    console.log(chalk.yellow('\n🔧 Troubleshooting:\n'));
    
    if (error.message.includes('permission')) {
      console.log(chalk.gray('  • Verify API key has dashboard creation permissions'));
    }
    
    if (error.message.includes('not found')) {
      console.log(chalk.gray('  • Check that Kafka integration is properly configured'));
      console.log(chalk.gray('  • Ensure data is being collected (may take 5-10 minutes)'));
    }
    
    if (error.message.includes('network')) {
      console.log(chalk.gray('  • Check network connectivity to New Relic API'));
    }
    
    console.log(chalk.gray('\n  • Run with DEBUG=* for detailed logs'));
    
    process.exit(1);
  }
}

// Run the intelligent dashboard generation
runIntelligentKafkaDashboard().catch(console.error);