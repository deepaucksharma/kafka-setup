#!/usr/bin/env node

/**
 * Test Kafka Intelligent Dashboard
 * Simplified script to test intelligent dashboard generation with Kafka data
 */

const dotenv = require('dotenv');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Import required components
const { NerdGraphClient } = require('./src/core/api-client');
const IntelligentDashboardBuilder = require('./discovery-platform/lib/intelligent-dashboard-builder');

async function testKafkaIntelligentDashboard() {
  console.log(chalk.bold.blue('\n🚀 Testing Kafka Intelligent Dashboard\n'));
  
  const config = {
    accountId: process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID,
    apiKey: process.env.UKEY || process.env.NEW_RELIC_API_KEY,
    enableAnomalyDetection: true,
    enableCorrelations: true
  };
  
  if (!config.accountId || !config.apiKey) {
    console.error(chalk.red('Missing account ID or API key'));
    process.exit(1);
  }
  
  console.log(chalk.gray(`Account: ${config.accountId}`));
  
  const spinner = ora('Discovering Kafka data...').start();
  
  try {
    // Initialize client
    const client = new NerdGraphClient({
      apiKey: config.apiKey,
      region: 'US'
    });
    
    // Step 1: Discover available Kafka data
    spinner.text = 'Checking for Kafka event types...';
    
    const eventTypeQuery = `
      SELECT count(*) 
      FROM KafkaBrokerSample, SystemSample, NetworkSample, StorageSample, Metric
      FACET eventType()
      SINCE 1 hour ago
    `;
    
    const eventTypeResult = await client.nrql(config.accountId, eventTypeQuery);
    
    if (!eventTypeResult?.results) {
      throw new Error('No data found in account');
    }
    
    // Step 2: Get sample data for each event type
    spinner.text = 'Analyzing event type attributes...';
    
    const eventTypes = [];
    
    for (const result of eventTypeResult.results) {
      const eventType = result.facet[0];
      const count = result.count;
      
      // Get sample and attributes
      const sampleQuery = `SELECT * FROM ${eventType} LIMIT 1 SINCE 1 hour ago`;
      const sample = await client.nrql(config.accountId, sampleQuery);
      
      if (sample?.results?.[0]) {
        const attributes = Object.keys(sample.results[0])
          .filter(key => key !== 'timestamp' && key !== 'eventType')
          .map(key => ({
            name: key,
            type: typeof sample.results[0][key],
            sampleValue: sample.results[0][key]
          }));
        
        eventTypes.push({
          name: eventType,
          count,
          volume: count,
          attributes
        });
      }
    }
    
    spinner.succeed('Data discovery completed');
    
    // Display discovered data
    console.log(chalk.bold.white('\n📊 Discovered Data:\n'));
    eventTypes.forEach(et => {
      console.log(chalk.white(`${et.name}:`));
      console.log(chalk.gray(`  Events: ${et.count.toLocaleString()}`));
      console.log(chalk.gray(`  Attributes: ${et.attributes.length}`));
    });
    
    // Step 3: Get Kafka-specific metrics
    spinner.start('Discovering Kafka metrics...');
    
    const metricsQuery = `
      SELECT uniques(metricName, 100) 
      FROM Metric 
      WHERE metricName LIKE '%kafka%' OR metricName LIKE '%newrelic.goldenmetrics%'
      SINCE 1 hour ago
    `;
    
    const metricsResult = await client.nrql(config.accountId, metricsQuery);
    const metrics = metricsResult?.results?.[0]?.['uniques.metricName'] || [];
    
    spinner.succeed(`Found ${metrics.length} Kafka-related metrics`);
    
    // Step 4: Build discovery results object
    const discoveryResults = {
      timestamp: new Date().toISOString(),
      accountId: config.accountId,
      eventTypes,
      metrics: metrics.map(name => ({
        name,
        type: 'metric',
        unit: name.includes('PerSecond') ? 'per_second' : 
              name.includes('Percent') ? 'percent' : 
              name.includes('Bytes') ? 'bytes' : 'unknown'
      })),
      relationships: []
    };
    
    // Add Kafka-specific relationships if we have the data
    if (eventTypes.find(et => et.name === 'KafkaBrokerSample')) {
      discoveryResults.relationships.push({
        from: 'KafkaBrokerSample',
        to: 'SystemSample',
        type: 'runs_on'
      });
    }
    
    console.log(chalk.yellow('\n📊 Generating intelligent dashboard...\n'));
    
    // Step 5: Generate intelligent dashboard
    const builder = new IntelligentDashboardBuilder(config);
    const dashboardResult = await builder.buildDashboards(discoveryResults);
    
    console.log(chalk.green('✅ Intelligent dashboard created successfully!\n'));
    
    // Display results
    console.log(chalk.bold.white('📊 Dashboard Information:'));
    console.log(chalk.gray(`  • Name: ${dashboardResult.dashboard.name}`));
    console.log(chalk.gray(`  • GUID: ${dashboardResult.dashboard.guid}`));
    console.log(chalk.gray(`  • URL: ${dashboardResult.dashboard.url}`));
    
    // Verify dynamic catalog page
    console.log(chalk.bold.yellow('\n🔍 Verifying Dynamic Metrics Catalog:'));
    
    // Check if catalog page was created
    const dashboardConfig = await builder.buildDashboardConfig(
      await builder.createOptimizedWidgets(
        builder.generateDashboardPlan(dashboardResult.analysis, dashboardResult.correlations),
        dashboardResult.analysis
      ),
      dashboardResult.analysis
    );
    
    const catalogPage = dashboardConfig.pages.find(p => p.name === 'All Metrics Catalog');
    
    if (catalogPage) {
      console.log(chalk.green('✅ Dynamic catalog page found!'));
      console.log(chalk.gray(`  • Widgets: ${catalogPage.widgets.length}`));
      
      // Show widget breakdown by type
      const widgetsByViz = {};
      catalogPage.widgets.forEach(w => {
        const viz = w.visualization?.id || 'unknown';
        widgetsByViz[viz] = (widgetsByViz[viz] || 0) + 1;
      });
      
      console.log(chalk.gray('  • Widget types:'));
      Object.entries(widgetsByViz).forEach(([viz, count]) => {
        console.log(chalk.gray(`    - ${viz}: ${count}`));
      });
      
      // Show categories covered
      const categoriesInCatalog = new Set();
      catalogPage.widgets.forEach(w => {
        if (w.title && w.title.includes(' - ')) {
          const match = w.title.match(/[📈📊⏱️❌🔥🔢🎯💾🔌💼]\s+(\w+)/);
          if (match) categoriesInCatalog.add(match[1]);
        }
      });
      
      if (categoriesInCatalog.size > 0) {
        console.log(chalk.gray(`  • Categories: ${Array.from(categoriesInCatalog).join(', ')}`));
      }
    } else {
      console.log(chalk.red('❌ Dynamic catalog page not found'));
    }
    
    // Display analysis
    if (dashboardResult.analysis) {
      console.log(chalk.bold.white('\n🔍 Analysis Results:'));
      
      // Categories
      if (dashboardResult.analysis.categories) {
        console.log(chalk.white('\nMetric Categories:'));
        Object.entries(dashboardResult.analysis.categories).forEach(([category, items]) => {
          console.log(chalk.gray(`  • ${category}: ${items.length} metrics`));
        });
      }
      
      // Golden signals
      if (dashboardResult.analysis.goldenSignals) {
        console.log(chalk.white('\nGolden Signals:'));
        Object.entries(dashboardResult.analysis.goldenSignals).forEach(([signal, metrics]) => {
          if (metrics.length > 0) {
            console.log(chalk.gray(`  • ${signal}: ${metrics.length} metrics`));
          }
        });
      }
    }
    
    // Display correlations
    if (dashboardResult.correlations?.strong?.length > 0) {
      console.log(chalk.bold.white('\n🔗 Correlations:'));
      dashboardResult.correlations.strong.slice(0, 3).forEach(corr => {
        console.log(chalk.gray(`  • ${corr.metric1} ↔ ${corr.metric2}`));
      });
    }
    
    // Display insights
    if (dashboardResult.insights?.length > 0) {
      console.log(chalk.bold.white('\n💡 Insights:'));
      dashboardResult.insights.forEach(insight => {
        const icon = insight.severity === 'high' ? '🔴' : 
                    insight.severity === 'medium' ? '🟡' : '🟢';
        console.log(chalk.gray(`  ${icon} ${insight.message}`));
      });
    }
    
    // Save results
    const outputPath = path.join(__dirname, `kafka-intelligent-dashboard-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify({
      config: { accountId: config.accountId },
      discoveryResults,
      dashboardResult: {
        dashboard: dashboardResult.dashboard,
        analysis: dashboardResult.analysis,
        correlations: dashboardResult.correlations,
        insights: dashboardResult.insights
      }
    }, null, 2));
    
    console.log(chalk.gray(`\n💾 Results saved to: ${outputPath}`));
    
    console.log(chalk.bold.cyan('\n✨ Dashboard generation complete!\n'));
    
  } catch (error) {
    spinner.fail('Dashboard generation failed');
    console.error(chalk.red('\n❌ Error:'), error.message);
    
    if (error.stack) {
      console.error(chalk.gray('\nStack trace:'));
      console.error(chalk.gray(error.stack));
    }
    
    // Provide specific troubleshooting based on error
    console.log(chalk.yellow('\n🔧 Troubleshooting:\n'));
    
    if (error.message.includes('queries') || error.message.includes('nrql_queries')) {
      console.log(chalk.gray('  • Dashboard API may have changed'));
      console.log(chalk.gray('  • Try updating the widget configuration format'));
    } else if (error.message.includes('permission')) {
      console.log(chalk.gray('  • Verify API key has dashboard creation permissions'));
    } else if (error.message.includes('No data found')) {
      console.log(chalk.gray('  • Check that the account has Kafka data'));
      console.log(chalk.gray('  • Try running: node scripts/simple-event-discovery.js'));
    }
    
    process.exit(1);
  }
}

// Run the test
testKafkaIntelligentDashboard().catch(console.error);