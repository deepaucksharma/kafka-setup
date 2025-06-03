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

class ExhaustiveDiscovery {
  constructor() {
    this.client = new NerdGraphClient(config);
    this.discoveries = {
      eventTypes: [],
      metrics: [],
      entities: [],
      attributes: {},
      queries: []
    };
    this.cache = new Map();
  }

  // Step 1: Discover all event types with data
  async discoverEventTypes() {
    console.log('\n📊 Phase 1: Discovering Event Types...');
    
    try {
      const query = 'SHOW EVENT TYPES SINCE 1 day ago';
      const result = await this.runQuery(query);
      
      if (result?.results) {
        this.discoveries.eventTypes = result.results
          .map(r => r.eventType)
          .filter(e => e && !e.startsWith('Nr')); // Filter out internal NR events initially
        
        console.log(`✅ Found ${this.discoveries.eventTypes.length} event types with data`);
        
        // Also check for NR events that might be useful
        const nrEvents = result.results
          .map(r => r.eventType)
          .filter(e => e && e.startsWith('Nr'));
        
        console.log(`📌 Also found ${nrEvents.length} New Relic internal events`);
        
        // Add select NR events that are useful
        const usefulNrEvents = ['NrdbQuery', 'NrConsumption', 'NrAuditEvent'];
        nrEvents.forEach(event => {
          if (usefulNrEvents.includes(event)) {
            this.discoveries.eventTypes.push(event);
          }
        });
      }
    } catch (error) {
      console.error('❌ Error discovering event types:', error.message);
    }
  }

  // Step 2: Discover attributes for each event type
  async discoverAttributes() {
    console.log('\n🔍 Phase 2: Discovering Attributes for Each Event Type...');
    
    for (const eventType of this.discoveries.eventTypes) {
      console.log(`\n  Analyzing ${eventType}...`);
      
      try {
        // Get keyset (all attributes)
        const keysetQuery = `SELECT keyset() FROM ${eventType} SINCE 1 day ago LIMIT 1`;
        const keysetResult = await this.runQuery(keysetQuery);
        
        if (keysetResult?.results?.[0]) {
          const attributes = Object.keys(keysetResult.results[0])
            .filter(attr => attr !== 'keyset');
          
          this.discoveries.attributes[eventType] = {
            allAttributes: attributes,
            numericAttributes: [],
            stringAttributes: [],
            sampleValues: {}
          };
          
          console.log(`    ✓ Found ${attributes.length} attributes`);
          
          // Classify attributes and get sample values
          await this.classifyAttributes(eventType, attributes.slice(0, 20)); // Limit to first 20 for performance
        }
      } catch (error) {
        console.log(`    ❌ Error: ${error.message}`);
      }
    }
  }

  // Step 3: Classify attributes as numeric or string
  async classifyAttributes(eventType, attributes) {
    const eventData = this.discoveries.attributes[eventType];
    
    for (const attr of attributes) {
      try {
        // Try numeric operations
        const numQuery = `SELECT average(${attr}), min(${attr}), max(${attr}) FROM ${eventType} WHERE ${attr} IS NOT NULL SINCE 1 day ago`;
        const numResult = await this.runQuery(numQuery);
        
        if (numResult?.results?.[0] && numResult.results[0][`average.${attr}`] !== null) {
          eventData.numericAttributes.push(attr);
          eventData.sampleValues[attr] = {
            type: 'numeric',
            avg: numResult.results[0][`average.${attr}`],
            min: numResult.results[0][`min.${attr}`],
            max: numResult.results[0][`max.${attr}`]
          };
        } else {
          // Try string operations
          const strQuery = `SELECT uniques(${attr}, 5) FROM ${eventType} WHERE ${attr} IS NOT NULL SINCE 1 day ago`;
          const strResult = await this.runQuery(strQuery);
          
          if (strResult?.results?.[0]) {
            eventData.stringAttributes.push(attr);
            eventData.sampleValues[attr] = {
              type: 'string',
              samples: strResult.results[0][`uniques.${attr}`] || []
            };
          }
        }
      } catch (error) {
        // Attribute might have special characters or be invalid
        console.log(`      ⚠️ Skipping ${attr}: ${error.message}`);
      }
    }
  }

  // Step 4: Discover all metrics
  async discoverMetrics() {
    console.log('\n📈 Phase 3: Discovering Metrics...');
    
    try {
      const query = 'SELECT uniques(metricName, 1000) FROM Metric SINCE 1 day ago';
      const result = await this.runQuery(query);
      
      if (result?.results?.[0]) {
        this.discoveries.metrics = result.results[0]['uniques.metricName'] || [];
        console.log(`✅ Found ${this.discoveries.metrics.length} unique metrics`);
        
        // Group metrics by prefix
        const metricGroups = {};
        this.discoveries.metrics.forEach(metric => {
          const prefix = metric.split(/[._]/)[0];
          if (!metricGroups[prefix]) metricGroups[prefix] = [];
          metricGroups[prefix].push(metric);
        });
        
        console.log('\n📊 Metric Groups:');
        Object.entries(metricGroups).forEach(([prefix, metrics]) => {
          console.log(`  ${prefix}: ${metrics.length} metrics`);
        });
      }
    } catch (error) {
      console.error('❌ Error discovering metrics:', error.message);
    }
  }

  // Step 5: Generate intelligent queries based on discoveries
  generateQueries() {
    console.log('\n🧠 Phase 4: Generating Intelligent Queries...');
    
    // For each event type, generate relevant queries
    for (const eventType of this.discoveries.eventTypes) {
      const eventData = this.discoveries.attributes[eventType];
      if (!eventData) continue;
      
      // Count query
      this.discoveries.queries.push({
        title: `${eventType} Count`,
        query: `SELECT count(*) FROM ${eventType} SINCE 1 day ago`,
        eventType,
        visualization: 'viz.billboard'
      });
      
      // Time series count
      this.discoveries.queries.push({
        title: `${eventType} Over Time`,
        query: `SELECT count(*) FROM ${eventType} TIMESERIES AUTO SINCE 1 day ago`,
        eventType,
        visualization: 'viz.line'
      });
      
      // Numeric attributes - averages
      eventData.numericAttributes.slice(0, 5).forEach(attr => {
        this.discoveries.queries.push({
          title: `${eventType} - Average ${this.humanize(attr)}`,
          query: `SELECT average(${attr}) FROM ${eventType} TIMESERIES AUTO SINCE 1 day ago`,
          eventType,
          visualization: 'viz.line'
        });
      });
      
      // String attributes - top values
      eventData.stringAttributes.slice(0, 3).forEach(attr => {
        if (this.isGoodFacet(attr)) {
          this.discoveries.queries.push({
            title: `${eventType} by ${this.humanize(attr)}`,
            query: `SELECT count(*) FROM ${eventType} FACET ${attr} SINCE 1 day ago LIMIT 10`,
            eventType,
            visualization: 'viz.bar'
          });
        }
      });
      
      // Special handling for specific event types
      this.addSpecialQueries(eventType, eventData);
    }
    
    // Metric queries
    const metricGroups = this.groupMetrics();
    Object.entries(metricGroups).slice(0, 10).forEach(([prefix, metrics]) => {
      if (metrics.length > 0) {
        this.discoveries.queries.push({
          title: `${this.humanize(prefix)} Metrics`,
          query: `SELECT average(value) FROM Metric WHERE metricName IN (${metrics.slice(0, 5).map(m => `'${m}'`).join(',')}) FACET metricName TIMESERIES AUTO SINCE 1 day ago`,
          eventType: 'Metric',
          visualization: 'viz.line'
        });
      }
    });
    
    console.log(`✅ Generated ${this.discoveries.queries.length} queries`);
  }

  // Add special queries for known event types
  addSpecialQueries(eventType, eventData) {
    switch(eventType) {
      case 'SystemSample':
        this.discoveries.queries.push({
          title: 'CPU and Memory Usage',
          query: 'SELECT average(cpuPercent) as "CPU %", average(memoryUsedPercent) as "Memory %" FROM SystemSample TIMESERIES AUTO SINCE 1 day ago',
          eventType,
          visualization: 'viz.line'
        });
        break;
        
      case 'Transaction':
        this.discoveries.queries.push({
          title: 'Application Performance',
          query: 'SELECT average(duration) as "Avg Duration", percentile(duration, 95) as "95th Percentile" FROM Transaction TIMESERIES AUTO SINCE 1 day ago',
          eventType,
          visualization: 'viz.line'
        });
        if (eventData.stringAttributes.includes('name')) {
          this.discoveries.queries.push({
            title: 'Slowest Transactions',
            query: 'SELECT average(duration) FROM Transaction FACET name SINCE 1 day ago LIMIT 10',
            eventType,
            visualization: 'viz.bar'
          });
        }
        break;
        
      case 'ProcessSample':
        this.discoveries.queries.push({
          title: 'Top Processes by CPU',
          query: 'SELECT average(cpuPercent) FROM ProcessSample FACET processDisplayName SINCE 1 day ago LIMIT 10',
          eventType,
          visualization: 'viz.bar'
        });
        break;
    }
  }

  // Step 6: Create comprehensive dashboard
  async createDashboard() {
    console.log('\n📊 Phase 5: Creating Comprehensive Dashboard...');
    
    // Group queries by event type
    const pages = [];
    const eventGroups = {};
    
    this.discoveries.queries.forEach(q => {
      if (!eventGroups[q.eventType]) eventGroups[q.eventType] = [];
      eventGroups[q.eventType].push(q);
    });
    
    // Create a page for each event type with queries
    Object.entries(eventGroups).forEach(([eventType, queries]) => {
      const widgets = queries.slice(0, 12).map((q, i) => ({
        title: q.title,
        visualization: { id: q.visualization },
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
      
      if (widgets.length > 0) {
        pages.push({
          name: this.humanize(eventType),
          description: `Metrics and analytics for ${eventType}`,
          widgets
        });
      }
    });
    
    // Add overview page
    const overviewWidgets = [
      {
        title: 'Total Event Types',
        query: `SELECT uniqueCount(eventType()) FROM ${this.discoveries.eventTypes.join(', ')} SINCE 1 day ago`,
        viz: 'viz.billboard'
      },
      {
        title: 'Events by Type',
        query: `SELECT count(*) FROM ${this.discoveries.eventTypes.join(', ')} FACET eventType() SINCE 1 day ago`,
        viz: 'viz.pie'
      },
      {
        title: 'Data Ingestion Timeline',
        query: `SELECT count(*) FROM ${this.discoveries.eventTypes.join(', ')} TIMESERIES 1 hour SINCE 1 day ago`,
        viz: 'viz.line'
      }
    ];
    
    const overviewPage = {
      name: 'Overview',
      description: 'Account data overview',
      widgets: overviewWidgets.map((w, i) => ({
        title: w.title,
        visualization: { id: w.viz },
        layout: {
          column: (i % 3) * 4 + 1,
          row: Math.floor(i / 3) * 3 + 1,
          height: 3,
          width: 4
        },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(config.accountId),
            query: w.query
          }]
        }
      }))
    };
    
    pages.unshift(overviewPage);
    
    const dashboard = {
      name: `Complete Data Discovery - ${new Date().toISOString().split('T')[0]}`,
      description: `Comprehensive dashboard showing all data in account ${config.accountId}`,
      permissions: 'PUBLIC_READ_WRITE',
      pages: pages.slice(0, 10) // Limit to 10 pages
    };
    
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
        console.log('\n✅ Dashboard created successfully!');
        console.log(`📊 Name: ${result.name}`);
        console.log(`🔗 URL: https://one.newrelic.com/dashboards/detail/${result.guid}`);
        
        // Save discovery data
        const filename = `discovery-${Date.now()}.json`;
        fs.writeFileSync(filename, JSON.stringify({
          discoveries: this.discoveries,
          dashboard: dashboard,
          dashboardUrl: `https://one.newrelic.com/dashboards/detail/${result.guid}`
        }, null, 2));
        console.log(`💾 Discovery data saved to: ${filename}`);
        
        return result;
      } else if (response.dashboardCreate?.errors) {
        console.error('❌ Dashboard creation errors:');
        response.dashboardCreate.errors.forEach(err => {
          console.error(`   - ${err.type}: ${err.description}`);
        });
      }
    } catch (error) {
      console.error('❌ Error creating dashboard:', error.message);
    }
  }

  // Helper: Run query with caching
  async runQuery(query) {
    if (this.cache.has(query)) {
      return this.cache.get(query);
    }
    
    try {
      const result = await this.client.nrql(config.accountId, query);
      this.cache.set(query, result);
      return result;
    } catch (error) {
      console.log(`    ⚠️ Query failed: ${error.message}`);
      return null;
    }
  }

  // Helper: Check if attribute is good for faceting
  isGoodFacet(attr) {
    const badFacets = ['id', 'guid', 'timestamp', 'message', 'log', 'stackTrace'];
    return !badFacets.some(bad => attr.toLowerCase().includes(bad));
  }

  // Helper: Humanize attribute names
  humanize(str) {
    return str
      .replace(/([A-Z])/g, ' $1')
      .replace(/[._-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  // Helper: Group metrics by prefix
  groupMetrics() {
    const groups = {};
    this.discoveries.metrics.forEach(metric => {
      const prefix = metric.split(/[._]/)[0];
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(metric);
    });
    return groups;
  }

  // Main discovery process
  async discover() {
    console.log('🚀 Starting Exhaustive Data Discovery');
    console.log(`📊 Account: ${config.accountId}`);
    console.log('This may take several minutes...\n');
    
    const startTime = Date.now();
    
    // Run all discovery phases
    await this.discoverEventTypes();
    await this.discoverAttributes();
    await this.discoverMetrics();
    this.generateQueries();
    await this.createDashboard();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Discovery completed in ${duration} seconds`);
    
    // Summary
    console.log('\n📊 Discovery Summary:');
    console.log(`  - Event Types: ${this.discoveries.eventTypes.length}`);
    console.log(`  - Metrics: ${this.discoveries.metrics.length}`);
    console.log(`  - Generated Queries: ${this.discoveries.queries.length}`);
    console.log(`  - Cache Hits: ${this.cache.size} queries cached`);
  }
}

// Main execution
async function main() {
  if (!config.apiKey || !config.accountId) {
    console.error('❌ Missing required environment variables');
    console.error('Please ensure UKEY and ACC are set in ../.env file');
    process.exit(1);
  }

  const discovery = new ExhaustiveDiscovery();
  await discovery.discover();
}

main().catch(console.error);