#!/usr/bin/env node

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { NerdGraphClient } = require('./src/core/api-client.js');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const config = {
  apiKey: process.env.UKEY || process.env.NEW_RELIC_API_KEY,
  accountId: process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID
};

// Query templates for common use cases
const queryTemplates = {
  'system-health': {
    name: 'System Health Dashboard',
    description: 'Monitor system CPU, memory, disk, and network',
    queries: [
      {
        title: 'CPU Usage Over Time',
        query: 'SELECT average(cpuPercent) FROM SystemSample TIMESERIES AUTO',
        visualization: 'viz.line'
      },
      {
        title: 'Memory Usage Over Time',
        query: 'SELECT average(memoryUsedPercent) FROM SystemSample TIMESERIES AUTO',
        visualization: 'viz.line'
      },
      {
        title: 'Top Hosts by CPU',
        query: 'SELECT average(cpuPercent) FROM SystemSample FACET hostname LIMIT 10',
        visualization: 'viz.bar'
      },
      {
        title: 'Disk Usage by Host',
        query: 'SELECT average(diskUsedPercent) FROM SystemSample FACET hostname WHERE diskUsedPercent IS NOT NULL',
        visualization: 'viz.table'
      }
    ]
  },
  'kafka-monitoring': {
    name: 'Kafka Monitoring Dashboard',
    description: 'Monitor Kafka brokers, topics, and consumer groups',
    queries: [
      {
        title: 'Kafka Broker Status',
        query: 'SELECT latest(kafka_server_BrokerState) FROM Metric FACET host',
        visualization: 'viz.billboard'
      },
      {
        title: 'Messages In Per Second',
        query: 'SELECT rate(sum(kafka_server_BrokerTopicMetrics_MessagesInPerSec), 1 second) FROM Metric TIMESERIES',
        visualization: 'viz.line'
      },
      {
        title: 'Consumer Lag by Group',
        query: 'SELECT latest(kafka_consumer_ConsumerLag) FROM Metric FACET consumer_group, topic',
        visualization: 'viz.table'
      },
      {
        title: 'Share Group Unacked Messages',
        query: 'SELECT latest(kafka_sharegroup_records_unacked) FROM Metric FACET group, topic, partition',
        visualization: 'viz.bar'
      }
    ]
  },
  'application-performance': {
    name: 'Application Performance Dashboard',
    description: 'Monitor application response time, throughput, and errors',
    queries: [
      {
        title: 'Response Time',
        query: 'SELECT average(duration) FROM Transaction TIMESERIES AUTO',
        visualization: 'viz.line'
      },
      {
        title: 'Throughput (RPM)',
        query: 'SELECT rate(count(*), 1 minute) FROM Transaction TIMESERIES AUTO',
        visualization: 'viz.line'
      },
      {
        title: 'Error Rate',
        query: 'SELECT percentage(count(*), WHERE error IS true) FROM Transaction',
        visualization: 'viz.billboard'
      },
      {
        title: 'Top Transactions',
        query: 'SELECT average(duration), count(*) FROM Transaction FACET name LIMIT 10',
        visualization: 'viz.table'
      }
    ]
  },
  'infrastructure-overview': {
    name: 'Infrastructure Overview Dashboard',
    description: 'High-level infrastructure metrics and health',
    queries: [
      {
        title: 'Host Count',
        query: 'SELECT uniqueCount(hostname) FROM SystemSample',
        visualization: 'viz.billboard'
      },
      {
        title: 'Average CPU Across Fleet',
        query: 'SELECT average(cpuPercent) FROM SystemSample',
        visualization: 'viz.billboard'
      },
      {
        title: 'Average Memory Across Fleet',
        query: 'SELECT average(memoryUsedPercent) FROM SystemSample',
        visualization: 'viz.billboard'
      },
      {
        title: 'CPU by Host Over Time',
        query: 'SELECT average(cpuPercent) FROM SystemSample FACET hostname TIMESERIES AUTO',
        visualization: 'viz.line'
      }
    ]
  }
};

// Interactive prompt
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise(resolve => rl.question(query, resolve));

class QueryAndDashboard {
  constructor() {
    this.client = new NerdGraphClient(config);
    this.queries = [];
  }

  async runQuery(query, title = 'Query Result') {
    console.log(`\n🔍 Running: ${query}`);
    
    try {
      const result = await this.client.nrql(config.accountId, query);
      
      if (result.results && result.results.length > 0) {
        console.log('✅ Success! Results:');
        console.log(JSON.stringify(result.results.slice(0, 5), null, 2));
        
        if (result.results.length > 5) {
          console.log(`... and ${result.results.length - 5} more results`);
        }
        
        // Store for dashboard creation
        this.queries.push({ title, query, results: result.results });
        return true;
      } else {
        console.log('ℹ️ No results found');
        return false;
      }
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      return false;
    }
  }

  async createDashboard(name, queries) {
    const dashboard = {
      name: name || `Dashboard - ${new Date().toISOString().split('T')[0]}`,
      description: 'Created with Query and Dashboard tool',
      permissions: 'PUBLIC_READ_WRITE',
      pages: [{
        name: 'Main',
        description: 'Auto-generated from queries',
        widgets: queries.map((q, index) => ({
          title: q.title,
          visualization: { id: q.visualization || 'viz.table' },
          layout: {
            column: (index % 3) * 4 + 1,
            row: Math.floor(index / 3) * 3 + 1,
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

      const response = await this.client.query(mutation, {
        accountId: parseInt(config.accountId),
        dashboard
      });

      if (response.dashboardCreate?.entityResult) {
        const result = response.dashboardCreate.entityResult;
        console.log('✅ Dashboard created successfully!');
        console.log(`📊 Name: ${result.name}`);
        console.log(`🔗 URL: https://one.newrelic.com/dashboards/detail/${result.guid}`);
        
        // Save dashboard config
        const filename = `dashboard-${Date.now()}.json`;
        fs.writeFileSync(filename, JSON.stringify(dashboard, null, 2));
        console.log(`💾 Dashboard config saved to: ${filename}`);
        
        return result;
      } else {
        throw new Error('Dashboard creation failed');
      }
    } catch (error) {
      console.error('❌ Error creating dashboard:', error.message);
      return null;
    }
  }

  async interactiveMode() {
    console.log('\n🚀 New Relic Query & Dashboard Builder');
    console.log('=====================================\n');

    const choice = await question(`Choose an option:
1. Run a custom query
2. Use a query template
3. Create dashboard from saved queries
4. Exit

Your choice (1-4): `);

    switch (choice) {
      case '1':
        await this.customQueryMode();
        break;
      case '2':
        await this.templateMode();
        break;
      case '3':
        await this.createDashboardMode();
        break;
      case '4':
        console.log('👋 Goodbye!');
        process.exit(0);
      default:
        console.log('Invalid choice');
    }

    // Continue loop
    await this.interactiveMode();
  }

  async customQueryMode() {
    const query = await question('\nEnter your NRQL query: ');
    const title = await question('Enter a title for this query (optional): ');
    
    await this.runQuery(query, title || 'Custom Query');
    
    const save = await question('\nSave this query for dashboard? (y/n): ');
    if (save.toLowerCase() !== 'y') {
      const index = this.queries.findIndex(q => q.query === query);
      if (index > -1) this.queries.splice(index, 1);
    }
  }

  async templateMode() {
    console.log('\nAvailable templates:');
    Object.entries(queryTemplates).forEach(([key, template], index) => {
      console.log(`${index + 1}. ${template.name} - ${template.description}`);
    });

    const choice = await question('\nSelect template (number): ');
    const templates = Object.values(queryTemplates);
    const template = templates[parseInt(choice) - 1];

    if (!template) {
      console.log('Invalid selection');
      return;
    }

    console.log(`\n📋 Running ${template.name} queries...`);
    
    for (const queryDef of template.queries) {
      await this.runQuery(queryDef.query, queryDef.title);
      this.queries[this.queries.length - 1].visualization = queryDef.visualization;
    }

    const create = await question('\nCreate dashboard from these queries? (y/n): ');
    if (create.toLowerCase() === 'y') {
      await this.createDashboard(template.name, this.queries.slice(-template.queries.length));
    }
  }

  async createDashboardMode() {
    if (this.queries.length === 0) {
      console.log('\nNo saved queries. Run some queries first!');
      return;
    }

    console.log('\nSaved queries:');
    this.queries.forEach((q, index) => {
      console.log(`${index + 1}. ${q.title}`);
    });

    const name = await question('\nEnter dashboard name: ');
    await this.createDashboard(name, this.queries);
  }

  async runBatch(templateName) {
    const template = queryTemplates[templateName];
    if (!template) {
      console.error(`Template '${templateName}' not found`);
      console.log('Available templates:', Object.keys(queryTemplates).join(', '));
      return;
    }

    console.log(`\n📋 Running ${template.name}...`);
    
    const queries = [];
    for (const queryDef of template.queries) {
      console.log(`\n🔍 ${queryDef.title}`);
      const success = await this.runQuery(queryDef.query, queryDef.title);
      if (success) {
        queries.push({
          ...queryDef,
          ...this.queries[this.queries.length - 1]
        });
      }
    }

    if (queries.length > 0) {
      console.log(`\n✅ Successfully ran ${queries.length} queries`);
      const create = await question('\nCreate dashboard? (y/n): ');
      if (create.toLowerCase() === 'y') {
        await this.createDashboard(template.name, queries);
      }
    }
  }
}

// Main execution
async function main() {
  if (!config.apiKey || !config.accountId) {
    console.error('❌ Missing required environment variables');
    console.error('Please ensure UKEY and ACC are set in ../.env file');
    process.exit(1);
  }

  const tool = new QueryAndDashboard();
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Interactive mode
    await tool.interactiveMode();
  } else if (args[0] === 'template' && args[1]) {
    // Run specific template
    await tool.runBatch(args[1]);
  } else if (args[0] === 'query' && args[1]) {
    // Run single query
    await tool.runQuery(args[1], args[2] || 'Query Result');
  } else if (args[0] === 'list') {
    // List templates
    console.log('Available templates:');
    Object.entries(queryTemplates).forEach(([key, template]) => {
      console.log(`  ${key}: ${template.name}`);
    });
  } else {
    console.log(`Usage:
  node query-and-dashboard.js                    # Interactive mode
  node query-and-dashboard.js list               # List templates
  node query-and-dashboard.js template <name>    # Run template
  node query-and-dashboard.js query "<NRQL>"     # Run single query
  
Templates: ${Object.keys(queryTemplates).join(', ')}`);
  }

  rl.close();
}

main().catch(console.error);