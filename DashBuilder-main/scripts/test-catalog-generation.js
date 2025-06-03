#!/usr/bin/env node

/**
 * Test Dynamic Metrics Catalog Generation
 * Tests the catalog page generation without deploying to New Relic
 */

const dotenv = require('dotenv');
const path = require('path');
const chalk = require('chalk');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const IntelligentDashboardBuilder = require('./discovery-platform/lib/intelligent-dashboard-builder');

async function testCatalogGeneration() {
  console.log(chalk.bold.blue('\n🧪 Testing Dynamic Metrics Catalog Generation\n'));
  
  const config = {
    accountId: process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID || '3630072',
    apiKey: process.env.UKEY || process.env.NEW_RELIC_API_KEY || 'test-key',
    enableAnomalyDetection: true,
    enableCorrelations: true
  };
  
  console.log(chalk.gray(`Account: ${config.accountId}`));
  
  try {
    // Create sample discovery results with various metric types
    const discoveryResults = {
      timestamp: new Date().toISOString(),
      accountId: config.accountId,
      eventTypes: [
        {
          name: 'KafkaBrokerSample',
          count: 1000,
          volume: 1000,
          attributes: [
            { name: 'broker.messagesInPerSecond', type: 'number' },
            { name: 'broker.bytesInPerSecond', type: 'number' },
            { name: 'broker.bytesOutPerSecond', type: 'number' },
            { name: 'request.avgTimeFetch', type: 'number' },
            { name: 'request.avgTimeProduceRequest', type: 'number' },
            { name: 'request.produceRequestsFailedPerSecond', type: 'number' },
            { name: 'request.handlerIdle', type: 'number' },
            { name: 'replication.unreplicatedPartitions', type: 'number' },
            { name: 'replication.isrShrinksPerSecond', type: 'number' },
            { name: 'consumer.requestsExpiredPerSecond', type: 'number' },
            { name: 'connection.count', type: 'number' },
            { name: 'broker.logFlushPerSecond', type: 'number' }
          ]
        },
        {
          name: 'SystemSample',
          count: 2000,
          volume: 2000,
          attributes: [
            { name: 'cpuPercent', type: 'number' },
            { name: 'memoryUsedPercent', type: 'number' },
            { name: 'diskUsedPercent', type: 'number' },
            { name: 'networkReceiveBytesPerSecond', type: 'number' },
            { name: 'networkTransmitBytesPerSecond', type: 'number' }
          ]
        }
      ],
      metrics: [
        { name: 'kafka_server_BrokerState', type: 'metric', unit: 'gauge' },
        { name: 'kafka_sharegroup_records_unacked', type: 'metric', unit: 'count' },
        { name: 'kafka_sharegroup_oldest_unacked_ms', type: 'metric', unit: 'milliseconds' },
        { name: 'kafka_consumer_ConsumerLag', type: 'metric', unit: 'count' },
        { name: 'newrelic.goldenmetrics.infra.kafkabroker.leaderElectionRate', type: 'metric', unit: 'per_second' }
      ]
    };
    
    console.log(chalk.white('📊 Test Data Summary:'));
    console.log(chalk.gray(`  • Event Types: ${discoveryResults.eventTypes.length}`));
    console.log(chalk.gray(`  • Total Attributes: ${discoveryResults.eventTypes.reduce((sum, et) => sum + et.attributes.length, 0)}`));
    console.log(chalk.gray(`  • Metrics: ${discoveryResults.metrics.length}`));
    
    // Initialize builder
    const builder = new IntelligentDashboardBuilder(config);
    
    // Step 1: Analyze metrics
    console.log(chalk.yellow('\n📊 Analyzing metrics...'));
    const analysis = await builder.analyzeMetrics(discoveryResults);
    
    console.log(chalk.white('\nAnalysis Results:'));
    console.log(chalk.gray('Categories:'));
    Object.entries(analysis.categories).forEach(([category, metrics]) => {
      if (metrics.length > 0) {
        console.log(chalk.gray(`  • ${category}: ${metrics.length} metrics`));
      }
    });
    
    console.log(chalk.gray('\nGolden Signals:'));
    Object.entries(analysis.goldenSignals).forEach(([signal, metrics]) => {
      if (metrics.length > 0) {
        console.log(chalk.gray(`  • ${signal}: ${metrics.length} metrics`));
      }
    });
    
    // Step 2: Generate dashboard plan
    console.log(chalk.yellow('\n📊 Generating dashboard plan...'));
    const correlations = await builder.detectCorrelations(analysis);
    const plan = builder.generateDashboardPlan(analysis, correlations);
    
    console.log(chalk.white('\nDashboard Plan:'));
    console.log(chalk.gray(`  • Pages: ${plan.pages.length}`));
    plan.pages.forEach(page => {
      console.log(chalk.gray(`    - ${page.name} (${page.sections.length} sections)`));
    });
    
    // Step 3: Build dashboard configuration (without deploying)
    console.log(chalk.yellow('\n📊 Building dashboard configuration...'));
    const widgetPages = await builder.createOptimizedWidgets(plan, analysis);
    const dashboardConfig = builder.buildDashboardConfig(widgetPages, analysis);
    
    // Step 4: Verify catalog page
    console.log(chalk.bold.blue('\n🔍 Verifying Dynamic Metrics Catalog:\n'));
    
    const catalogPage = dashboardConfig.pages.find(p => p.name === 'All Metrics Catalog');
    
    if (catalogPage) {
      console.log(chalk.green('✅ Dynamic catalog page successfully generated!'));
      console.log(chalk.white('\nCatalog Page Details:'));
      console.log(chalk.gray(`  • Name: ${catalogPage.name}`));
      console.log(chalk.gray(`  • Description: ${catalogPage.description}`));
      console.log(chalk.gray(`  • Total Widgets: ${catalogPage.widgets.length}`));
      
      // Analyze widget types
      const widgetAnalysis = {
        byVisualization: {},
        byCategory: {},
        byTitle: []
      };
      
      catalogPage.widgets.forEach(widget => {
        // Count by visualization type
        const vizType = widget.visualization?.id || 'unknown';
        widgetAnalysis.byVisualization[vizType] = (widgetAnalysis.byVisualization[vizType] || 0) + 1;
        
        // Extract category from title
        if (widget.title) {
          widgetAnalysis.byTitle.push(widget.title);
          const categoryMatch = widget.title.match(/[📈📊⏱️❌🔥🔢🎯💾🔌💼]\s+(\w+)/);
          if (categoryMatch) {
            const category = categoryMatch[1].toLowerCase();
            widgetAnalysis.byCategory[category] = (widgetAnalysis.byCategory[category] || 0) + 1;
          }
        }
      });
      
      console.log(chalk.white('\nWidget Breakdown:'));
      console.log(chalk.gray('By Visualization Type:'));
      Object.entries(widgetAnalysis.byVisualization).forEach(([viz, count]) => {
        console.log(chalk.gray(`  • ${viz}: ${count}`));
      });
      
      console.log(chalk.gray('\nBy Category:'));
      Object.entries(widgetAnalysis.byCategory).forEach(([category, count]) => {
        console.log(chalk.gray(`  • ${category}: ${count}`));
      });
      
      console.log(chalk.gray('\nWidget Titles:'));
      widgetAnalysis.byTitle.forEach(title => {
        console.log(chalk.gray(`  • ${title}`));
      });
      
      // Check for specific features
      console.log(chalk.white('\n✨ Dynamic Features:'));
      
      const hasOverview = catalogPage.widgets.some(w => w.title?.includes('Complete Metrics Catalog'));
      console.log(chalk.gray(`  ${hasOverview ? '✅' : '❌'} Overview widget with catalog summary`));
      
      const hasTable = catalogPage.widgets.some(w => w.visualization?.id === 'viz.table');
      console.log(chalk.gray(`  ${hasTable ? '✅' : '❌'} Comprehensive metrics table`));
      
      const hasMarkdown = catalogPage.widgets.some(w => w.visualization?.id === 'viz.markdown');
      console.log(chalk.gray(`  ${hasMarkdown ? '✅' : '❌'} Markdown overview`));
      
      const hasDynamicQueries = catalogPage.widgets.some(w => 
        w.rawConfiguration?.nrqlQueries?.[0]?.query?.includes('TIMESERIES')
      );
      console.log(chalk.gray(`  ${hasDynamicQueries ? '✅' : '❌'} Dynamic NRQL queries`));
      
      // Sample a few widgets
      console.log(chalk.white('\n📋 Sample Widget Configurations:'));
      catalogPage.widgets.slice(0, 3).forEach((widget, idx) => {
        console.log(chalk.gray(`\nWidget ${idx + 1}:`));
        console.log(chalk.gray(`  Title: ${widget.title}`));
        console.log(chalk.gray(`  Visualization: ${widget.visualization?.id}`));
        if (widget.rawConfiguration?.nrqlQueries?.[0]?.query) {
          const query = widget.rawConfiguration.nrqlQueries[0].query;
          console.log(chalk.gray(`  Query: ${query.substring(0, 100)}...`));
        }
      });
      
    } else {
      console.log(chalk.red('❌ Dynamic catalog page not found in dashboard configuration'));
    }
    
    // Save the dashboard configuration for inspection
    const outputPath = path.join(__dirname, `test-catalog-config-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify({
      dashboardConfig,
      analysis: {
        categories: Object.keys(analysis.categories),
        goldenSignals: Object.keys(analysis.goldenSignals),
        totalMetrics: Object.values(analysis.categories).reduce((sum, arr) => sum + arr.length, 0)
      }
    }, null, 2));
    
    console.log(chalk.gray(`\n💾 Full configuration saved to: ${outputPath}`));
    
    console.log(chalk.bold.cyan('\n✨ Catalog generation test completed successfully!\n'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Error:'), error.message);
    console.error(chalk.gray('\nStack trace:'), error.stack);
    process.exit(1);
  }
}

// Run the test
testCatalogGeneration().catch(console.error);