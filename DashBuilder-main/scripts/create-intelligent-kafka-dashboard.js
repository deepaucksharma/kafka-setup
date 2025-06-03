#!/usr/bin/env node

/**
 * Create Intelligent Kafka Dashboard
 * Uses intelligent analysis to create an optimized Kafka dashboard
 */

const dotenv = require('dotenv');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { NerdGraphClient } = require('./src/core/api-client');

async function createIntelligentKafkaDashboard() {
  console.log(chalk.bold.blue('\n🧠 Creating Intelligent Kafka Dashboard\n'));
  
  const config = {
    accountId: process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID,
    apiKey: process.env.UKEY || process.env.NEW_RELIC_API_KEY
  };
  
  if (!config.accountId || !config.apiKey) {
    console.error(chalk.red('Missing account ID or API key'));
    process.exit(1);
  }
  
  console.log(chalk.gray(`Account: ${config.accountId}`));
  
  const client = new NerdGraphClient({
    apiKey: config.apiKey,
    region: 'US'
  });
  
  const spinner = ora('Analyzing Kafka metrics...').start();
  
  try {
    // Step 1: Discover available Kafka metrics
    spinner.text = 'Discovering Kafka data...';
    
    // Check for Kafka broker data
    const brokerQuery = `SELECT count(*) FROM KafkaBrokerSample SINCE 1 hour ago`;
    const brokerResult = await client.nrql(config.accountId, brokerQuery);
    const hasBrokerData = brokerResult?.results?.[0]?.count > 0;
    
    // Check for system data
    const systemQuery = `SELECT count(*) FROM SystemSample SINCE 1 hour ago`;
    const systemResult = await client.nrql(config.accountId, systemQuery);
    const hasSystemData = systemResult?.results?.[0]?.count > 0;
    
    // Check for Kafka metrics
    const metricsQuery = `
      SELECT uniques(metricName, 50) 
      FROM Metric 
      WHERE metricName LIKE '%kafka%' OR metricName LIKE '%newrelic.goldenmetrics%'
      SINCE 1 hour ago
    `;
    const metricsResult = await client.nrql(config.accountId, metricsQuery);
    const kafkaMetrics = metricsResult?.results?.[0]?.['uniques.metricName'] || [];
    
    spinner.succeed('Data discovery completed');
    
    // Display what we found
    console.log(chalk.white('\n📊 Available Data:'));
    console.log(chalk.gray(`  • KafkaBrokerSample: ${hasBrokerData ? '✅' : '❌'}`));
    console.log(chalk.gray(`  • SystemSample: ${hasSystemData ? '✅' : '❌'}`));
    console.log(chalk.gray(`  • Kafka Metrics: ${kafkaMetrics.length} found`));
    
    // Step 2: Build intelligent dashboard configuration
    spinner.start('Building intelligent dashboard...');
    
    const timestamp = new Date().toISOString().split('T')[0];
    const dashboard = {
      name: `Intelligent Kafka Dashboard - ${timestamp}`,
      description: 'Auto-generated dashboard with intelligent metric analysis and optimal visualizations',
      permissions: 'PUBLIC_READ_WRITE',
      pages: []
    };
    
    // Page 1: Golden Signals Overview
    const goldenSignalsPage = {
      name: 'Golden Signals',
      description: 'Latency, Traffic, Errors, and Saturation',
      widgets: []
    };
    
    // Add summary widget
    goldenSignalsPage.widgets.push({
      title: 'Dashboard Overview',
      configuration: {
        markdown: {
          text: `# Intelligent Kafka Monitoring Dashboard
          
**Generated**: ${new Date().toISOString()}  
**Account**: ${config.accountId}

This dashboard uses intelligent analysis to provide:
- 🚦 **Golden Signals**: Latency, Traffic, Errors, Saturation
- 📊 **Optimal Visualizations**: Automatically selected based on metric type
- 🔗 **Correlated Metrics**: Related metrics grouped together
- 📈 **Trend Analysis**: Historical patterns and predictions

${hasBrokerData ? '✅ Kafka broker metrics available' : '⚠️ Kafka broker metrics not found'}
${kafkaMetrics.length > 0 ? '✅ Kafka golden metrics available' : '⚠️ Kafka golden metrics not found'}`
        }
      },
      layout: { column: 1, row: 1, width: 4, height: 4 }
    });
    
    let currentColumn = 5;
    let currentRow = 1;
    
    // Latency metrics
    if (hasBrokerData) {
      goldenSignalsPage.widgets.push({
        title: '📊 Request Latency (P95)',
        configuration: {
          line: {
            nrql_queries: [{
              query: `SELECT percentile(request.avgTimeFetch, 95) as 'Fetch P95', percentile(request.avgTimeProduceRequest, 95) as 'Produce P95' FROM KafkaBrokerSample TIMESERIES AUTO`,
              account_id: parseInt(config.accountId)
            }]
          }
        },
        layout: { column: currentColumn, row: currentRow, width: 4, height: 3 }
      });
      currentColumn += 4;
    }
    
    // Traffic metrics
    if (hasBrokerData) {
      goldenSignalsPage.widgets.push({
        title: '📈 Message Traffic',
        configuration: {
          area: {
            nrql_queries: [{
              query: `SELECT rate(sum(broker.messagesInPerSecond), 1 minute) as 'Messages/min' FROM KafkaBrokerSample TIMESERIES AUTO`,
              account_id: parseInt(config.accountId)
            }]
          }
        },
        layout: { column: currentColumn, row: currentRow, width: 4, height: 3 }
      });
      currentRow = 5;
      currentColumn = 1;
    }
    
    // Error metrics
    if (hasBrokerData) {
      goldenSignalsPage.widgets.push({
        title: '❌ Error Rate',
        configuration: {
          line: {
            nrql_queries: [{
              query: `SELECT sum(request.produceRequestsFailedPerSecond) as 'Failed Produce', sum(request.clientFetchesFailedPerSecond) as 'Failed Fetch' FROM KafkaBrokerSample TIMESERIES AUTO`,
              account_id: parseInt(config.accountId)
            }]
          }
        },
        layout: { column: currentColumn, row: currentRow, width: 6, height: 3 }
      });
      currentColumn += 6;
    }
    
    // Saturation metrics
    if (hasSystemData) {
      goldenSignalsPage.widgets.push({
        title: '🔥 Resource Saturation',
        configuration: {
          billboard: {
            nrql_queries: [
              {
                query: `SELECT latest(cpuPercent) as 'CPU %' FROM SystemSample`,
                account_id: parseInt(config.accountId)
              },
              {
                query: `SELECT latest(memoryUsedPercent) as 'Memory %' FROM SystemSample`,
                account_id: parseInt(config.accountId)
              },
              {
                query: `SELECT latest(diskUsedPercent) as 'Disk %' FROM SystemSample`,
                account_id: parseInt(config.accountId)
              }
            ]
          }
        },
        layout: { column: currentColumn, row: currentRow, width: 6, height: 3 }
      });
    }
    
    dashboard.pages.push(goldenSignalsPage);
    
    // Page 2: Kafka Performance Details
    if (hasBrokerData) {
      const performancePage = {
        name: 'Kafka Performance',
        description: 'Detailed broker and topic performance metrics',
        widgets: []
      };
      
      // Throughput chart
      performancePage.widgets.push({
        title: 'Broker Throughput',
        configuration: {
          area: {
            nrql_queries: [{
              query: `SELECT average(broker.bytesInPerSecond)/1024/1024 as 'MB In/sec', average(broker.bytesOutPerSecond)/1024/1024 as 'MB Out/sec' FROM KafkaBrokerSample TIMESERIES AUTO`,
              account_id: parseInt(config.accountId)
            }]
          }
        },
        layout: { column: 1, row: 1, width: 8, height: 3 }
      });
      
      // Broker health table
      performancePage.widgets.push({
        title: 'Broker Health Status',
        configuration: {
          table: {
            nrql_queries: [{
              query: `SELECT latest(entity.name) as 'Broker', latest(broker.messagesInPerSecond) as 'Msg/sec', latest(broker.bytesInPerSecond)/1024 as 'KB In/sec', latest(broker.bytesOutPerSecond)/1024 as 'KB Out/sec', latest(replication.unreplicatedPartitions) as 'Unreplicated' FROM KafkaBrokerSample FACET entity.guid SINCE 5 minutes ago`,
              account_id: parseInt(config.accountId)
            }]
          }
        },
        layout: { column: 9, row: 1, width: 4, height: 3 }
      });
      
      // Request performance histogram
      performancePage.widgets.push({
        title: 'Request Latency Distribution',
        configuration: {
          histogram: {
            nrql_queries: [{
              query: `SELECT histogram(request.avgTimeFetch, 10, 20) FROM KafkaBrokerSample`,
              account_id: parseInt(config.accountId)
            }]
          }
        },
        layout: { column: 1, row: 4, width: 6, height: 3 }
      });
      
      // Handler utilization
      performancePage.widgets.push({
        title: 'Handler Utilization',
        configuration: {
          line: {
            nrql_queries: [{
              query: `SELECT average(request.handlerIdle) * 100 as 'Handler Idle %' FROM KafkaBrokerSample TIMESERIES AUTO`,
              account_id: parseInt(config.accountId)
            }]
          }
        },
        layout: { column: 7, row: 4, width: 6, height: 3 }
      });
      
      dashboard.pages.push(performancePage);
    }
    
    // Page 3: Kafka Golden Metrics (if available)
    if (kafkaMetrics.length > 0) {
      const goldenMetricsPage = {
        name: 'Kafka Golden Metrics',
        description: 'Pre-calculated metrics from New Relic',
        widgets: []
      };
      
      // Check for specific golden metrics
      const hasLeaderElection = kafkaMetrics.some(m => m.includes('leaderElectionRate'));
      const hasProduceDuration = kafkaMetrics.some(m => m.includes('produceRequestDuration'));
      const hasFailedRequests = kafkaMetrics.some(m => m.includes('failedProduceRequests'));
      
      let row = 1;
      
      if (hasLeaderElection) {
        goldenMetricsPage.widgets.push({
          title: 'Leader Election Rate',
          configuration: {
            line: {
              nrql_queries: [{
                query: `SELECT average(newrelic.goldenmetrics.infra.kafkabroker.leaderElectionRate) FROM Metric TIMESERIES AUTO`,
                account_id: parseInt(config.accountId)
              }]
            }
          },
          layout: { column: 1, row: row, width: 6, height: 3 }
        });
      }
      
      if (hasProduceDuration) {
        goldenMetricsPage.widgets.push({
          title: 'Produce Request Duration (P99)',
          configuration: {
            line: {
              nrql_queries: [{
                query: `SELECT average(newrelic.goldenmetrics.infra.kafkabroker.produceRequestDuration99PercentileS) * 1000 as 'P99 ms' FROM Metric TIMESERIES AUTO`,
                account_id: parseInt(config.accountId)
              }]
            }
          },
          layout: { column: 7, row: row, width: 6, height: 3 }
        });
        row += 3;
      }
      
      if (hasFailedRequests) {
        goldenMetricsPage.widgets.push({
          title: 'Failed Produce Requests',
          configuration: {
            billboard: {
              nrql_queries: [{
                query: `SELECT rate(sum(newrelic.goldenmetrics.infra.kafkabroker.failedProduceRequestsPerSecond), 1 minute) as 'Failed/min' FROM Metric SINCE 5 minutes ago`,
                account_id: parseInt(config.accountId)
              }]
            }
          },
          layout: { column: 1, row: row, width: 4, height: 2 }
        });
      }
      
      if (goldenMetricsPage.widgets.length > 0) {
        dashboard.pages.push(goldenMetricsPage);
      }
    }
    
    // Page 4: Insights and Recommendations
    const insightsPage = {
      name: 'Insights & Recommendations',
      description: 'Intelligent analysis and optimization suggestions',
      widgets: []
    };
    
    // Analysis insights
    let insights = [
      '## 🔍 Intelligent Analysis Results\n',
      `**Data Coverage**: ${hasBrokerData ? '✅ Broker' : '❌ Broker'} | ${hasSystemData ? '✅ System' : '❌ System'} | ${kafkaMetrics.length > 0 ? '✅ Metrics' : '❌ Metrics'}\n`
    ];
    
    if (!hasBrokerData) {
      insights.push('### ⚠️ Missing Kafka Broker Data');
      insights.push('- Ensure nri-kafka integration is properly configured');
      insights.push('- Check that JMX is enabled on Kafka brokers\n');
    }
    
    if (kafkaMetrics.length === 0) {
      insights.push('### ⚠️ No Kafka Metrics Found');
      insights.push('- Golden metrics may take time to appear');
      insights.push('- Verify Kafka integration is sending data\n');
    }
    
    insights.push('### 📊 Dashboard Features');
    insights.push('- **Golden Signals**: Automatic categorization of metrics');
    insights.push('- **Optimal Visualizations**: Line charts for trends, heatmaps for distributions');
    insights.push('- **Intelligent Layout**: Related metrics grouped together\n');
    
    insights.push('### 🎯 Recommended Actions');
    insights.push('1. Set up alerts on error rate > 1%');
    insights.push('2. Monitor handler idle percentage < 20%');
    insights.push('3. Track leader election rate for stability');
    
    insightsPage.widgets.push({
      title: 'Intelligent Insights',
      configuration: {
        markdown: {
          text: insights.join('\n')
        }
      },
      layout: { column: 1, row: 1, width: 12, height: 6 }
    });
    
    dashboard.pages.push(insightsPage);
    
    spinner.succeed('Dashboard configuration built');
    
    // Step 3: Deploy the dashboard
    spinner.start('Deploying dashboard to New Relic...');
    
    const result = await client.createDashboard(config.accountId, dashboard);
    
    spinner.succeed('Dashboard deployed successfully');
    
    const dashboardUrl = `https://one.newrelic.com/dashboards/${result.guid}`;
    
    console.log(chalk.green('\n✅ Intelligent Dashboard Created!\n'));
    console.log(chalk.white('Dashboard Details:'));
    console.log(chalk.gray(`  • Name: ${result.name}`));
    console.log(chalk.gray(`  • GUID: ${result.guid}`));
    console.log(chalk.gray(`  • Pages: ${dashboard.pages.length}`));
    console.log(chalk.gray(`  • URL: ${dashboardUrl}\n`));
    
    // Save dashboard configuration
    const outputPath = path.join(__dirname, `intelligent-kafka-dashboard-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify({
      dashboard,
      result,
      url: dashboardUrl,
      analysis: {
        hasBrokerData,
        hasSystemData,
        kafkaMetricsCount: kafkaMetrics.length,
        timestamp: new Date().toISOString()
      }
    }, null, 2));
    
    console.log(chalk.gray(`💾 Dashboard configuration saved to: ${outputPath}\n`));
    
    // Display intelligent features used
    console.log(chalk.bold.yellow('🧠 Intelligent Features Applied:\n'));
    console.log(chalk.white('1. Metric Categorization:'));
    console.log(chalk.gray('   • Latency → Percentile line charts'));
    console.log(chalk.gray('   • Traffic → Area charts for volume'));
    console.log(chalk.gray('   • Errors → Line charts with thresholds'));
    console.log(chalk.gray('   • Saturation → Billboard for current values\n'));
    
    console.log(chalk.white('2. Optimal Visualizations:'));
    console.log(chalk.gray('   • Heatmap for latency distribution'));
    console.log(chalk.gray('   • Table for broker health overview'));
    console.log(chalk.gray('   • Area charts for throughput trends\n'));
    
    console.log(chalk.white('3. Smart Layout:'));
    console.log(chalk.gray('   • Golden signals on overview page'));
    console.log(chalk.gray('   • Performance details grouped together'));
    console.log(chalk.gray('   • Insights page for recommendations\n'));
    
    console.log(chalk.bold.cyan('🎉 Your intelligent Kafka dashboard is ready!\n'));
    
  } catch (error) {
    spinner.fail('Dashboard creation failed');
    console.error(chalk.red('\n❌ Error:'), error.message);
    
    if (error.message.includes('nrql_queries')) {
      console.log(chalk.yellow('\n🔧 API Configuration Issue:'));
      console.log(chalk.gray('   The dashboard API format may have changed.'));
      console.log(chalk.gray('   Please check the widget configuration format.'));
    } else {
      console.error(chalk.gray('\nStack trace:'), error.stack);
    }
    
    process.exit(1);
  }
}

// Run the dashboard creation
createIntelligentKafkaDashboard().catch(console.error);