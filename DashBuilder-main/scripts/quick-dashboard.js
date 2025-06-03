#!/usr/bin/env node

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { NerdGraphClient } = require('./src/core/api-client.js');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const config = {
  apiKey: process.env.UKEY || process.env.NEW_RELIC_API_KEY,
  accountId: process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID
};

// Dashboard templates
const templates = {
  'system': {
    name: 'System Health Dashboard',
    queries: [
      { title: 'CPU Usage', query: 'SELECT average(cpuPercent) FROM SystemSample TIMESERIES', viz: 'viz.line' },
      { title: 'Memory Usage', query: 'SELECT average(memoryUsedPercent) FROM SystemSample TIMESERIES', viz: 'viz.line' },
      { title: 'Host Count', query: 'SELECT uniqueCount(hostname) FROM SystemSample', viz: 'viz.billboard' },
      { title: 'CPU by Host', query: 'SELECT average(cpuPercent) FROM SystemSample FACET hostname', viz: 'viz.bar' }
    ]
  },
  'kafka': {
    name: 'Kafka Monitoring Dashboard',
    queries: [
      { title: 'Broker State', query: "SELECT latest(value) FROM Metric WHERE metricName = 'kafka_server_BrokerState' FACET host", viz: 'viz.billboard' },
      { title: 'Messages In Rate', query: "SELECT rate(sum(value), 1 second) FROM Metric WHERE metricName = 'kafka_server_BrokerTopicMetrics_MessagesInPerSec' TIMESERIES", viz: 'viz.line' },
      { title: 'Share Group Unacked', query: "SELECT latest(kafka_sharegroup_records_unacked) FROM Metric FACET group, topic", viz: 'viz.table' },
      { title: 'Consumer Lag', query: "SELECT latest(value) FROM Metric WHERE metricName = 'kafka_consumer_ConsumerLag' FACET consumer_group", viz: 'viz.bar' }
    ]
  },
  'app': {
    name: 'Application Performance Dashboard',
    queries: [
      { title: 'Response Time', query: 'SELECT average(duration) FROM Transaction TIMESERIES', viz: 'viz.line' },
      { title: 'Throughput', query: 'SELECT rate(count(*), 1 minute) FROM Transaction TIMESERIES', viz: 'viz.line' },
      { title: 'Error Rate', query: 'SELECT percentage(count(*), WHERE error IS true) FROM Transaction', viz: 'viz.billboard' },
      { title: 'Top Transactions', query: 'SELECT average(duration) FROM Transaction FACET name LIMIT 10', viz: 'viz.table' }
    ]
  }
};

async function createDashboard(client, name, queries) {
  const dashboard = {
    name: `${name} - ${new Date().toISOString().split('T')[0]}`,
    description: 'Created with Quick Dashboard tool',
    permissions: 'PUBLIC_READ_WRITE',
    pages: [{
      name: 'Main',
      description: 'Dashboard metrics',
      widgets: queries.map((q, i) => ({
        title: q.title,
        visualization: { id: q.viz || 'viz.table' },
        layout: {
          column: (i % 3) * 4 + 1,
          row: Math.floor(i / 3) * 3 + 1,
          height: 3,
          width: 4
        },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(config.accountId),
            query: q.query
          }]
        }
      }))
    }]
  };

  console.log('\n📊 Creating dashboard...');
  
  try {
    const mutation = `
      mutation CreateDashboard($accountId: Int!, $dashboard: DashboardInput!) {
        dashboardCreate(accountId: $accountId, dashboard: $dashboard) {
          entityResult {
            guid
            name
          }
          errors {
            description
            type
          }
        }
      }
    `;

    const response = await client.query(mutation, {
      accountId: parseInt(config.accountId),
      dashboard
    });

    if (response.dashboardCreate?.entityResult) {
      const result = response.dashboardCreate.entityResult;
      console.log('✅ Dashboard created successfully!');
      console.log(`📊 Name: ${result.name}`);
      console.log(`🔗 URL: https://one.newrelic.com/dashboards/detail/${result.guid}`);
      
      // Save config
      const filename = `dashboard-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`;
      fs.writeFileSync(filename, JSON.stringify(dashboard, null, 2));
      console.log(`💾 Config saved to: ${filename}`);
      
      return result;
    } else if (response.dashboardCreate?.errors) {
      console.error('❌ Dashboard creation errors:');
      response.dashboardCreate.errors.forEach(err => {
        console.error(`   - ${err.type}: ${err.description}`);
      });
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  return null;
}

async function runTemplate(templateName) {
  const template = templates[templateName];
  if (!template) {
    console.error(`❌ Unknown template: ${templateName}`);
    console.log('Available templates:', Object.keys(templates).join(', '));
    return;
  }

  const client = new NerdGraphClient(config);
  console.log(`\n🚀 Creating ${template.name}...`);
  
  // Test queries first
  console.log('\n📋 Testing queries...');
  for (const q of template.queries) {
    process.stdout.write(`  ${q.title}... `);
    try {
      const result = await client.nrql(config.accountId, q.query);
      if (result.results) {
        console.log('✅');
      } else {
        console.log('⚠️ No data');
      }
    } catch (error) {
      console.log(`❌ ${error.message}`);
    }
  }

  // Create dashboard
  await createDashboard(client, template.name, template.queries);
}

async function runCustom(query, title = 'Custom Query') {
  const client = new NerdGraphClient(config);
  
  console.log(`\n🔍 Running: ${query}`);
  try {
    const result = await client.nrql(config.accountId, query);
    
    if (result.results && result.results.length > 0) {
      console.log('✅ Results:');
      console.log(JSON.stringify(result.results.slice(0, 10), null, 2));
      
      if (result.results.length > 10) {
        console.log(`... and ${result.results.length - 10} more results`);
      }
      
      // Ask if user wants to create dashboard
      console.log('\n💡 To create a dashboard with this query, use:');
      console.log(`   node quick-dashboard.js create "${query}" "${title}"`);
    } else {
      console.log('ℹ️ No results found');
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

async function createSingle(query, title) {
  const client = new NerdGraphClient(config);
  await createDashboard(client, title, [{ title, query, viz: 'viz.table' }]);
}

async function main() {
  if (!config.apiKey || !config.accountId) {
    console.error('❌ Missing required environment variables');
    console.error('Please ensure UKEY and ACC are set in ../.env file');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const command = args[0];

  console.log('🚀 Quick Dashboard Creator');
  console.log(`📊 Account: ${config.accountId}`);

  switch (command) {
    case 'list':
      console.log('\nAvailable templates:');
      Object.entries(templates).forEach(([key, t]) => {
        console.log(`  ${key}: ${t.name}`);
      });
      break;
      
    case 'system':
    case 'kafka':
    case 'app':
      await runTemplate(command);
      break;
      
    case 'query':
      if (!args[1]) {
        console.error('❌ Please provide a query');
        process.exit(1);
      }
      await runCustom(args[1], args[2]);
      break;
      
    case 'create':
      if (!args[1]) {
        console.error('❌ Please provide a query');
        process.exit(1);
      }
      await createSingle(args[1], args[2] || 'Custom Dashboard');
      break;
      
    default:
      console.log(`
Usage:
  node quick-dashboard.js list                     # List templates
  node quick-dashboard.js <template>               # Create dashboard from template
  node quick-dashboard.js query "<NRQL>"           # Run a query
  node quick-dashboard.js create "<NRQL>" "Title"  # Create dashboard from query

Templates: ${Object.keys(templates).join(', ')}

Examples:
  node quick-dashboard.js system
  node quick-dashboard.js query "SELECT count(*) FROM SystemSample"
  node quick-dashboard.js create "SELECT average(cpuPercent) FROM SystemSample TIMESERIES" "CPU Monitor"
`);
  }
}

main().catch(console.error);