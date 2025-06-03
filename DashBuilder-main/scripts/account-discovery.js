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

class AccountDiscovery {
  constructor() {
    this.client = new NerdGraphClient(config);
    this.data = {
      eventTypes: [],
      metrics: [],
      samples: {},
      dashboards: []
    };
  }

  async discover() {
    console.log('🔍 Account Data Discovery');
    console.log(`📊 Account: ${config.accountId}\n`);

    // Step 1: Find event types
    console.log('📌 Step 1: Discovering Event Types...');
    await this.findEventTypes();
    
    // Step 2: Sample each event type
    console.log('\n📌 Step 2: Sampling Event Data...');
    await this.sampleEventTypes();
    
    // Step 3: Find metrics
    console.log('\n📌 Step 3: Discovering Metrics...');
    await this.findMetrics();
    
    // Step 4: Create dashboards
    console.log('\n📌 Step 4: Creating Dashboards...');
    await this.createDashboards();
    
    // Save results
    this.saveResults();
  }

  async findEventTypes() {
    try {
      const query = 'SHOW EVENT TYPES SINCE 1 day ago';
      const result = await this.client.nrql(config.accountId, query);
      
      if (result?.results) {
        this.data.eventTypes = result.results
          .map(r => r.eventType)
          .filter(e => e);
        
        console.log(`✅ Found ${this.data.eventTypes.length} event types`);
        
        // Show first 10
        this.data.eventTypes.slice(0, 10).forEach(e => {
          console.log(`  - ${e}`);
        });
        if (this.data.eventTypes.length > 10) {
          console.log(`  ... and ${this.data.eventTypes.length - 10} more`);
        }
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }

  async sampleEventTypes() {
    // Sample top event types
    const typesToSample = this.data.eventTypes.slice(0, 10);
    
    for (const eventType of typesToSample) {
      console.log(`\n  Sampling ${eventType}...`);
      
      try {
        // Get count
        const countQuery = `SELECT count(*) FROM ${eventType} SINCE 1 hour ago`;
        const countResult = await this.client.nrql(config.accountId, countQuery);
        const count = countResult?.results?.[0]?.count || 0;
        
        if (count === 0) {
          console.log(`    ⚠️ No recent data`);
          continue;
        }
        
        console.log(`    ✓ Count: ${count.toLocaleString()}`);
        
        // Get sample
        const sampleQuery = `SELECT * FROM ${eventType} LIMIT 1`;
        const sampleResult = await this.client.nrql(config.accountId, sampleQuery);
        
        if (sampleResult?.results?.[0]) {
          const attrs = Object.keys(sampleResult.results[0]);
          console.log(`    ✓ Attributes: ${attrs.length}`);
          
          this.data.samples[eventType] = {
            count,
            attributes: attrs,
            sample: sampleResult.results[0]
          };
          
          // Generate queries
          this.generateQueriesForEventType(eventType, attrs);
        }
      } catch (error) {
        console.log(`    ❌ Error: ${error.message}`);
      }
    }
  }

  generateQueriesForEventType(eventType, attributes) {
    const queries = [];
    
    // Always add count over time
    queries.push({
      title: `${eventType} Count`,
      query: `SELECT count(*) FROM ${eventType} TIMESERIES AUTO SINCE 1 hour ago`,
      viz: 'viz.line'
    });
    
    // Look for numeric attributes
    const numericAttrs = attributes.filter(a => 
      a.includes('percent') || a.includes('count') || 
      a.includes('duration') || a.includes('time') ||
      a.includes('bytes') || a.includes('size')
    ).slice(0, 3);
    
    numericAttrs.forEach(attr => {
      queries.push({
        title: this.humanize(attr),
        query: `SELECT average(${attr}) FROM ${eventType} TIMESERIES AUTO SINCE 1 hour ago`,
        viz: 'viz.line'
      });
    });
    
    // Look for good facets
    const facetAttrs = attributes.filter(a => 
      (a.includes('name') || a.includes('type') || a.includes('host')) &&
      !a.includes('guid') && !a.includes('id')
    ).slice(0, 2);
    
    facetAttrs.forEach(attr => {
      queries.push({
        title: `By ${this.humanize(attr)}`,
        query: `SELECT count(*) FROM ${eventType} FACET ${attr} SINCE 1 hour ago LIMIT 10`,
        viz: 'viz.bar'
      });
    });
    
    if (!this.data.samples[eventType].queries) {
      this.data.samples[eventType].queries = [];
    }
    this.data.samples[eventType].queries.push(...queries);
  }

  async findMetrics() {
    try {
      const query = `SELECT uniques(metricName, 100) FROM Metric SINCE 1 hour ago`;
      const result = await this.client.nrql(config.accountId, query);
      
      if (result?.results?.[0]) {
        this.data.metrics = result.results[0]['uniques.metricName'] || [];
        console.log(`✅ Found ${this.data.metrics.length} metrics`);
        
        // Group by prefix
        const groups = {};
        this.data.metrics.forEach(m => {
          const prefix = m.split(/[._]/)[0];
          groups[prefix] = (groups[prefix] || 0) + 1;
        });
        
        console.log('📊 Metric Groups:');
        Object.entries(groups)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .forEach(([prefix, count]) => {
            console.log(`  - ${prefix}: ${count} metrics`);
          });
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }

  async createDashboards() {
    // Dashboard 1: Overview
    const overviewPages = [{
      name: 'Overview',
      widgets: []
    }];
    
    // Add event type widgets
    let widgetIndex = 0;
    Object.entries(this.data.samples).forEach(([eventType, data]) => {
      if (data.count > 0) {
        overviewPages[0].widgets.push({
          title: `${eventType} Events`,
          visualization: { id: 'viz.billboard' },
          layout: {
            column: (widgetIndex % 3) * 4 + 1,
            row: Math.floor(widgetIndex / 3) * 3 + 1,
            height: 3,
            width: 4
          },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: parseInt(config.accountId),
              query: `SELECT count(*) FROM ${eventType} SINCE 1 hour ago`
            }]
          }
        });
        widgetIndex++;
      }
    });
    
    // Dashboard 2: Detailed pages for each event type
    const detailPages = [];
    Object.entries(this.data.samples).forEach(([eventType, data]) => {
      if (data.queries && data.queries.length > 0) {
        const widgets = data.queries.map((q, i) => ({
          title: q.title,
          visualization: { id: q.viz },
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
        }));
        
        detailPages.push({
          name: this.humanize(eventType),
          widgets
        });
      }
    });
    
    // Create overview dashboard
    if (overviewPages[0].widgets.length > 0) {
      console.log('\n  Creating Overview Dashboard...');
      const overviewDashboard = {
        name: `Data Overview - ${new Date().toISOString().split('T')[0]}`,
        description: 'Overview of all data types',
        permissions: 'PUBLIC_READ_WRITE',
        pages: overviewPages
      };
      
      try {
        const result = await this.createDashboard(overviewDashboard);
        if (result) {
          console.log(`  ✅ Created: ${result.url}`);
          this.data.dashboards.push(result);
        }
      } catch (error) {
        console.log(`  ❌ Failed: ${error.message}`);
      }
    }
    
    // Create detailed dashboard
    if (detailPages.length > 0) {
      console.log('\n  Creating Detailed Dashboard...');
      const detailDashboard = {
        name: `Data Analysis - ${new Date().toISOString().split('T')[0]}`,
        description: 'Detailed analysis by data type',
        permissions: 'PUBLIC_READ_WRITE',
        pages: detailPages.slice(0, 10) // Limit pages
      };
      
      try {
        const result = await this.createDashboard(detailDashboard);
        if (result) {
          console.log(`  ✅ Created: ${result.url}`);
          this.data.dashboards.push(result);
        }
      } catch (error) {
        console.log(`  ❌ Failed: ${error.message}`);
      }
    }
  }

  async createDashboard(dashboard) {
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
      return {
        guid: response.dashboardCreate.entityResult.guid,
        name: response.dashboardCreate.entityResult.name,
        url: `https://one.newrelic.com/dashboards/detail/${response.dashboardCreate.entityResult.guid}`
      };
    }
    
    throw new Error('Dashboard creation failed');
  }

  saveResults() {
    const filename = `account-discovery-${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(this.data, null, 2));
    console.log(`\n💾 Results saved to: ${filename}`);
  }

  humanize(str) {
    return str
      .replace(/([A-Z])/g, ' $1')
      .replace(/[._-]/g, ' ')
      .trim()
      .split(' ')
      .filter(w => w)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
}

// Main
async function main() {
  if (!config.apiKey || !config.accountId) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }

  const discovery = new AccountDiscovery();
  await discovery.discover();
}

main().catch(console.error);