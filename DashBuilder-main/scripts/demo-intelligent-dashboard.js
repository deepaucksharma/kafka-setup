#!/usr/bin/env node

/**
 * Demo Intelligent Dashboard Capabilities
 * Shows the intelligent dashboard features without making API calls
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

console.log(chalk.bold.blue('\n🧠 Intelligent Dashboard Builder Demo\n'));

console.log(chalk.white('The Intelligent Dashboard Builder provides:\n'));

// Feature 1: Metric Categorization
console.log(chalk.bold.yellow('1. Automatic Metric Categorization'));
console.log(chalk.gray('   Analyzes metric names to determine type and optimal visualization:\n'));

const sampleMetrics = [
  { name: 'broker.messagesInPerSecond', category: 'throughput', viz: 'line chart' },
  { name: 'request.avgTimeFetch', category: 'latency', viz: 'histogram' },
  { name: 'request.produceRequestsFailedPerSecond', category: 'error', viz: 'line with threshold' },
  { name: 'cpuPercent', category: 'utilization', viz: 'gauge' },
  { name: 'queue.size', category: 'gauge', viz: 'billboard' },
  { name: 'broker.bytesInPerSecond', category: 'bytes', viz: 'area chart' }
];

sampleMetrics.forEach(m => {
  console.log(chalk.gray(`   • ${m.name}`));
  console.log(chalk.green(`     → Category: ${m.category}, Visualization: ${m.viz}`));
});

// Feature 2: Golden Signals
console.log(chalk.bold.yellow('\n2. Golden Signals Mapping'));
console.log(chalk.gray('   Maps metrics to Google SRE\'s four golden signals:\n'));

const goldenSignals = {
  'Latency': ['request.avgTimeFetch', 'request.avgTimeProduceRequest', 'consumer.avgFetchLatency'],
  'Traffic': ['broker.messagesInPerSecond', 'broker.bytesInPerSecond', 'consumer.messageRate'],
  'Errors': ['request.produceRequestsFailedPerSecond', 'consumer.requestsExpiredPerSecond'],
  'Saturation': ['request.handlerIdle', 'queue.size', 'cpuPercent', 'memoryUsedPercent']
};

Object.entries(goldenSignals).forEach(([signal, metrics]) => {
  console.log(chalk.white(`   ${signal}:`));
  metrics.forEach(m => console.log(chalk.gray(`     • ${m}`)));
});

// Feature 3: Correlation Detection
console.log(chalk.bold.yellow('\n3. Correlation Detection'));
console.log(chalk.gray('   Identifies relationships between metrics:\n'));

const correlations = [
  { metric1: 'broker.messagesInPerSecond', metric2: 'broker.bytesInPerSecond', correlation: 0.92, type: 'Traffic correlation' },
  { metric1: 'cpuPercent', metric2: 'request.avgTimeFetch', correlation: 0.78, type: 'Resource impact' },
  { metric1: 'queue.size', metric2: 'oldest.message.age.seconds', correlation: 0.85, type: 'Queue behavior' }
];

correlations.forEach(c => {
  console.log(chalk.gray(`   • ${c.metric1} ↔ ${c.metric2}`));
  console.log(chalk.green(`     Correlation: ${c.correlation}, Type: ${c.type}`));
});

// Feature 4: Dashboard Structure
console.log(chalk.bold.yellow('\n4. Intelligent Dashboard Structure'));
console.log(chalk.gray('   Creates optimal page layout:\n'));

const dashboardStructure = {
  pages: [
    {
      name: 'Golden Signals Overview',
      widgets: [
        'Latency Trends (P95)',
        'Traffic Volume',
        'Error Rate',
        'Resource Saturation'
      ]
    },
    {
      name: 'Kafka Broker Performance',
      widgets: [
        'Broker Throughput',
        'Message Rate by Broker',
        'Request Latency Heatmap',
        'Broker Health Table'
      ]
    },
    {
      name: 'Consumer Analysis',
      widgets: [
        'Consumer Lag by Group',
        'Message Processing Rate',
        'Consumer Group Health',
        'Lag Trend Analysis'
      ]
    },
    {
      name: 'Anomaly Detection',
      widgets: [
        'Baseline Comparison',
        'Anomaly Score Timeline',
        'Predicted vs Actual',
        'Alert Recommendations'
      ]
    }
  ]
};

dashboardStructure.pages.forEach(page => {
  console.log(chalk.white(`   ${page.name}:`));
  page.widgets.forEach(w => console.log(chalk.gray(`     • ${w}`)));
});

// Feature 5: Insights Generation
console.log(chalk.bold.yellow('\n5. Automated Insights'));
console.log(chalk.gray('   Generates actionable recommendations:\n'));

const insights = [
  { severity: 'high', message: 'Missing error rate monitoring for consumer groups', type: 'gap' },
  { severity: 'medium', message: 'Strong correlation between CPU usage and request latency suggests resource constraints', type: 'correlation' },
  { severity: 'low', message: 'broker.messagesInPerSecond follows a daily pattern - use seasonal baselines for alerting', type: 'pattern' }
];

insights.forEach(i => {
  const icon = i.severity === 'high' ? '🔴' : i.severity === 'medium' ? '🟡' : '🟢';
  console.log(chalk.gray(`   ${icon} ${i.message}`));
});

// Feature 6: Alert Suggestions
console.log(chalk.bold.yellow('\n6. Smart Alert Recommendations'));
console.log(chalk.gray('   Suggests alerts based on metric analysis:\n'));

const alertSuggestions = [
  {
    name: 'Kafka Producer Error Rate',
    condition: 'request.produceRequestsFailedPerSecond > 5',
    window: '5 minutes',
    priority: 'critical'
  },
  {
    name: 'Consumer Lag Threshold',
    condition: 'consumer.lag > 10000',
    window: '10 minutes',
    priority: 'high'
  },
  {
    name: 'Broker CPU Saturation',
    condition: 'cpuPercent > 80',
    window: '5 minutes',
    priority: 'medium'
  }
];

alertSuggestions.forEach(a => {
  console.log(chalk.gray(`   • ${a.name}`));
  console.log(chalk.green(`     Condition: ${a.condition}`));
  console.log(chalk.green(`     Window: ${a.window}, Priority: ${a.priority}`));
});

// Example Dashboard Configuration
console.log(chalk.bold.cyan('\n📊 Example Dashboard Configuration:\n'));

const exampleDashboard = {
  name: 'Intelligent Kafka Dashboard - 2025-06-03',
  description: 'Auto-generated dashboard with intelligent metric analysis',
  pages: [
    {
      name: 'Golden Signals Overview',
      widgets: [
        {
          title: 'Latency Trends (P95)',
          type: 'line',
          query: 'SELECT percentile(request.avgTimeFetch, 95) FROM KafkaBrokerSample TIMESERIES AUTO'
        },
        {
          title: 'Traffic Volume',
          type: 'area',
          query: 'SELECT rate(sum(broker.messagesInPerSecond), 1 minute) FROM KafkaBrokerSample TIMESERIES AUTO'
        },
        {
          title: 'Error Rate',
          type: 'line',
          query: 'SELECT percentage(count(*), WHERE request.produceRequestsFailedPerSecond > 0) FROM KafkaBrokerSample TIMESERIES AUTO'
        }
      ]
    }
  ]
};

console.log(chalk.white('Dashboard: ' + exampleDashboard.name));
console.log(chalk.gray('Description: ' + exampleDashboard.description));
console.log(chalk.gray('\nSample Widgets:'));
exampleDashboard.pages[0].widgets.forEach(w => {
  console.log(chalk.gray(`  • ${w.title} (${w.type})`));
  console.log(chalk.gray(`    Query: ${w.query}`));
});

// Usage
console.log(chalk.bold.blue('\n📝 Usage:\n'));
console.log(chalk.white('1. Basic intelligent dashboard:'));
console.log(chalk.gray('   node scripts/test-intelligent-dashboard.js\n'));

console.log(chalk.white('2. With Kafka discovery:'));
console.log(chalk.gray('   node scripts/run-intelligent-kafka-dashboard.js\n'));

console.log(chalk.white('3. Programmatic usage:'));
console.log(chalk.gray(`   const builder = new IntelligentDashboardBuilder(config);
   const result = await builder.buildDashboards(discoveries);\n`));

// Save demo output
const demoOutput = {
  features: {
    metricCategorization: sampleMetrics,
    goldenSignals,
    correlations,
    dashboardStructure,
    insights,
    alertSuggestions
  },
  exampleDashboard,
  timestamp: new Date().toISOString()
};

const outputPath = path.join(__dirname, 'intelligent-dashboard-demo.json');
fs.writeFileSync(outputPath, JSON.stringify(demoOutput, null, 2));

console.log(chalk.gray(`💾 Demo data saved to: ${outputPath}\n`));

console.log(chalk.bold.green('✨ The Intelligent Dashboard Builder transforms raw metrics into actionable insights!\n'));