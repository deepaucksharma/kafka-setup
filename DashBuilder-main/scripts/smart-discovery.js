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

class SmartDiscovery {
  constructor(options = {}) {
    this.client = new NerdGraphClient(config);
    this.options = {
      timeRange: options.timeRange || '1 day ago',
      maxAttributes: options.maxAttributes || 10,
      maxEventTypes: options.maxEventTypes || 20,
      maxQueries: options.maxQueries || 50,
      quickMode: options.quickMode || false
    };
    
    this.discoveries = {
      summary: {},
      eventTypes: {},
      metrics: {},
      dashboardConfig: null
    };
    
    this.queryCount = 0;
    this.startTime = Date.now();
  }

  // Quick discovery of what data exists
  async quickDiscovery() {
    console.log('🚀 Smart Data Discovery');
    console.log(`📊 Account: ${config.accountId}`);
    console.log(`⏱️  Mode: ${this.options.quickMode ? 'Quick' : 'Full'}`);
    console.log(`📅 Time Range: ${this.options.timeRange}\n`);

    // Phase 1: Get event types with volumes
    console.log('📊 Phase 1: Event Type Discovery...');
    const eventTypes = await this.discoverEventTypesWithVolume();
    
    // Phase 2: Quick metric discovery
    console.log('\n📈 Phase 2: Metric Discovery...');
    await this.quickMetricDiscovery();
    
    // Phase 3: Smart attribute discovery (top event types only)
    console.log('\n🔍 Phase 3: Smart Attribute Discovery...');
    await this.smartAttributeDiscovery(eventTypes.slice(0, 5));
    
    // Phase 4: Generate dashboard
    console.log('\n🎨 Phase 4: Dashboard Generation...');
    const dashboard = await this.generateSmartDashboard();
    
    // Save results
    this.saveResults();
    
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(`\n✅ Discovery completed in ${duration} seconds`);
    console.log(`📊 Total queries executed: ${this.queryCount}`);
    
    return dashboard;
  }

  // Discover event types with volume in one query
  async discoverEventTypesWithVolume() {
    try {
      // Get all event types with their volumes in a single query
      const query = `
        SELECT count(*) as volume 
        FROM Entity, EntityAudits, InfrastructureEvent, Metric, Public_APICall, 
             Relationship, SystemSample, Transaction, ProcessSample, NetworkSample,
             StorageSample, ContainerSample, LoadBalancerSample, NrAuditEvent, 
             NrConsumption, NrdbQuery, TestEvent
        FACET eventType() 
        SINCE ${this.options.timeRange}
        LIMIT ${this.options.maxEventTypes}
      `;
      
      const result = await this.runQuery(query);
      
      if (!result?.results) return [];
      
      const eventTypes = result.results
        .filter(r => r.volume > 0)
        .sort((a, b) => b.volume - a.volume)
        .map(r => ({
          name: r.facet,
          volume: r.volume
        }));
      
      console.log(`✅ Found ${eventTypes.length} event types with data`);
      eventTypes.slice(0, 10).forEach(e => {
        console.log(`  - ${e.name}: ${e.volume.toLocaleString()} events`);
      });
      
      // Store discoveries
      eventTypes.forEach(e => {
        this.discoveries.eventTypes[e.name] = {
          volume: e.volume,
          attributes: {},
          queries: []
        };
      });
      
      return eventTypes;
    } catch (error) {
      console.error('❌ Error discovering event types:', error.message);
      return [];
    }
  }

  // Quick metric discovery
  async quickMetricDiscovery() {
    try {
      // Get metric categories and counts
      const query = `
        SELECT uniqueCount(metricName) as count 
        FROM Metric 
        FACET instrumentation.provider, instrumentation.source 
        SINCE ${this.options.timeRange}
        LIMIT 20
      `;
      
      const result = await this.runQuery(query);
      
      if (result?.results) {
        console.log('✅ Metric sources found:');
        result.results.forEach(r => {
          if (r.count > 0) {
            const provider = r['instrumentation.provider'] || 'unknown';
            const source = r['instrumentation.source'] || 'unknown';
            console.log(`  - ${provider}/${source}: ${r.count} metrics`);
          }
        });
      }
      
      // Get top metrics
      const topMetricsQuery = `
        SELECT count(*) as usage 
        FROM Metric 
        FACET metricName 
        SINCE ${this.options.timeRange}
        LIMIT 20
      `;
      
      const topMetrics = await this.runQuery(topMetricsQuery);
      if (topMetrics?.results) {
        this.discoveries.metrics.top = topMetrics.results.map(r => ({
          name: r.facet,
          usage: r.usage
        }));
      }
      
    } catch (error) {
      console.error('❌ Error discovering metrics:', error.message);
    }
  }

  // Smart attribute discovery - only for top event types
  async smartAttributeDiscovery(topEventTypes) {
    for (const eventType of topEventTypes) {
      if (!eventType.name) continue;
      
      console.log(`\n  Analyzing ${eventType.name}...`);
      
      try {
        // Get a sample to find attributes
        const sampleQuery = `
          SELECT * 
          FROM ${eventType.name} 
          SINCE ${this.options.timeRange}
          LIMIT 1
        `;
        
        const sample = await this.runQuery(sampleQuery);
        if (!sample?.results?.[0]) continue;
        
        const attributes = Object.keys(sample.results[0])
          .filter(k => !['timestamp', 'endTime', 'beginTime'].includes(k));
        
        console.log(`    ✓ Found ${attributes.length} attributes`);
        
        // Analyze top attributes only
        const topAttrs = attributes.slice(0, this.options.maxAttributes);
        
        for (const attr of topAttrs) {
          await this.analyzeAttribute(eventType.name, attr);
        }
        
      } catch (error) {
        console.log(`    ⚠️ Skipped: ${error.message}`);
      }
    }
  }

  // Analyze single attribute efficiently
  async analyzeAttribute(eventType, attribute) {
    try {
      // Check if numeric with a simple query
      const checkQuery = `
        SELECT average(${attribute}) as avg,
               uniqueCount(${attribute}) as cardinality
        FROM ${eventType} 
        WHERE ${attribute} IS NOT NULL
        SINCE ${this.options.timeRange}
      `;
      
      const result = await this.runQuery(checkQuery);
      if (!result?.results?.[0]) return;
      
      const isNumeric = result.results[0].avg !== null;
      const cardinality = result.results[0].cardinality || 0;
      
      if (!this.discoveries.eventTypes[eventType].attributes) {
        this.discoveries.eventTypes[eventType].attributes = {};
      }
      
      this.discoveries.eventTypes[eventType].attributes[attribute] = {
        type: isNumeric ? 'numeric' : 'string',
        cardinality: cardinality
      };
      
      // Generate queries for good attributes
      if (isNumeric && !attribute.includes('id')) {
        this.discoveries.eventTypes[eventType].queries.push({
          title: `${this.humanize(attribute)} Trend`,
          query: `SELECT average(${attribute}) FROM ${eventType} TIMESERIES AUTO SINCE ${this.options.timeRange}`,
          viz: 'viz.line'
        });
      } else if (!isNumeric && cardinality > 1 && cardinality <= 20) {
        this.discoveries.eventTypes[eventType].queries.push({
          title: `By ${this.humanize(attribute)}`,
          query: `SELECT count(*) FROM ${eventType} FACET ${attribute} SINCE ${this.options.timeRange}`,
          viz: 'viz.bar'
        });
      }
      
    } catch (error) {
      // Silent fail for problematic attributes
    }
  }

  // Generate smart dashboard based on discoveries
  async generateSmartDashboard() {
    const pages = [];
    
    // Overview page
    const overviewQueries = [
      {
        title: 'Total Events',
        query: `SELECT count(*) FROM ${Object.keys(this.discoveries.eventTypes).join(', ')} SINCE ${this.options.timeRange}`,
        viz: 'viz.billboard'
      },
      {
        title: 'Event Distribution',
        query: `SELECT count(*) FROM ${Object.keys(this.discoveries.eventTypes).join(', ')} FACET eventType() SINCE ${this.options.timeRange}`,
        viz: 'viz.pie'
      },
      {
        title: 'Event Timeline',
        query: `SELECT count(*) FROM ${Object.keys(this.discoveries.eventTypes).join(', ')} TIMESERIES AUTO SINCE ${this.options.timeRange}`,
        viz: 'viz.line'
      }
    ];
    
    pages.push({
      name: 'Overview',
      widgets: this.createWidgets(overviewQueries)
    });
    
    // Create pages for top event types
    const topEventTypes = Object.entries(this.discoveries.eventTypes)
      .sort((a, b) => b[1].volume - a[1].volume)
      .slice(0, 3);
    
    for (const [eventType, data] of topEventTypes) {
      if (data.queries && data.queries.length > 0) {
        // Add volume query
        const allQueries = [
          {
            title: `${eventType} Volume`,
            query: `SELECT count(*) FROM ${eventType} TIMESERIES AUTO SINCE ${this.options.timeRange}`,
            viz: 'viz.line'
          },
          ...data.queries.slice(0, 5)
        ];
        
        pages.push({
          name: this.humanize(eventType),
          widgets: this.createWidgets(allQueries)
        });
      }
    }
    
    // Metrics page if we have metrics
    if (this.discoveries.metrics.top && this.discoveries.metrics.top.length > 0) {
      const metricQueries = this.discoveries.metrics.top.slice(0, 6).map(m => ({
        title: this.humanize(m.name),
        query: `SELECT average(value) FROM Metric WHERE metricName = '${m.name}' TIMESERIES AUTO SINCE ${this.options.timeRange}`,
        viz: 'viz.line'
      }));
      
      pages.push({
        name: 'Metrics',
        widgets: this.createWidgets(metricQueries)
      });
    }
    
    const dashboard = {
      name: `Smart Discovery - ${new Date().toISOString().split('T')[0]}`,
      description: 'Auto-generated dashboard based on available data',
      permissions: 'PUBLIC_READ_WRITE',
      pages: pages
    };
    
    // Create dashboard
    console.log('\n📊 Creating dashboard...');
    try {
      const result = await this.createDashboard(dashboard);
      if (result) {
        console.log('✅ Dashboard created successfully!');
        console.log(`🔗 URL: ${result.url}`);
        this.discoveries.dashboardConfig = dashboard;
        return result;
      }
    } catch (error) {
      console.error('❌ Error creating dashboard:', error.message);
    }
    
    return null;
  }

  // Helper to create widgets
  createWidgets(queries) {
    return queries.map((q, i) => ({
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
    }));
  }

  // Create dashboard in New Relic
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
    } else if (response.dashboardCreate?.errors) {
      throw new Error(response.dashboardCreate.errors.map(e => e.description).join(', '));
    }
    
    throw new Error('Dashboard creation failed');
  }

  // Run query and track count
  async runQuery(query) {
    this.queryCount++;
    try {
      return await this.client.nrql(config.accountId, query);
    } catch (error) {
      console.log(`    ⚠️ Query failed: ${error.message}`);
      return null;
    }
  }

  // Save discovery results
  saveResults() {
    const filename = `smart-discovery-${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify({
      options: this.options,
      discoveries: this.discoveries,
      queryCount: this.queryCount,
      duration: (Date.now() - this.startTime) / 1000
    }, null, 2));
    console.log(`\n💾 Results saved to: ${filename}`);
  }

  // Utility functions
  humanize(str) {
    return str
      .replace(/([A-Z])/g, ' $1')
      .replace(/[._-]/g, ' ')
      .trim()
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
}

// Main execution
async function main() {
  if (!config.apiKey || !config.accountId) {
    console.error('❌ Missing required environment variables');
    console.error('Please ensure UKEY and ACC are set in ../.env file');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const options = {
    quickMode: args.includes('--quick'),
    timeRange: args.includes('--hour') ? '1 hour ago' : '1 day ago',
    maxAttributes: 10,
    maxEventTypes: 30
  };

  if (args.includes('--help')) {
    console.log(`
Smart Discovery Tool
===================

Efficiently discovers data in your New Relic account and creates dashboards.

Usage:
  node smart-discovery.js           # Full discovery (1 day)
  node smart-discovery.js --quick   # Quick mode (fewer queries)
  node smart-discovery.js --hour    # Last hour only
  node smart-discovery.js --help    # Show this help

Features:
  - Efficient batch queries
  - Smart attribute analysis
  - Automatic dashboard creation
  - Progress tracking
  - Results saved to JSON
`);
    process.exit(0);
  }

  const discovery = new SmartDiscovery(options);
  await discovery.quickDiscovery();
}

main().catch(console.error);