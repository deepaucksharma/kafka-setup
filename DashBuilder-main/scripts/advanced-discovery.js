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

class AdvancedDiscovery {
  constructor() {
    this.client = new NerdGraphClient(config);
    this.data = {
      eventTypes: {},
      metrics: {},
      entities: {},
      relationships: [],
      insights: [],
      dashboards: []
    };
    this.queryCache = new Map();
    this.progress = { current: 0, total: 0 };
  }

  // Enhanced event type discovery with data volume
  async discoverEventTypes() {
    console.log('\n🔍 Phase 1: Deep Event Type Discovery...');
    
    const eventQuery = 'SHOW EVENT TYPES SINCE 7 days ago';
    const events = await this.runCachedQuery(eventQuery);
    
    if (!events?.results) return;
    
    for (const event of events.results) {
      const eventType = event.eventType;
      if (!eventType) continue;
      
      console.log(`\n  📊 Analyzing ${eventType}...`);
      
      // Get event volume
      const volumeQuery = `SELECT count(*) as volume FROM ${eventType} SINCE 1 day ago`;
      const volumeResult = await this.runCachedQuery(volumeQuery);
      const volume = volumeResult?.results?.[0]?.volume || 0;
      
      if (volume === 0) {
        console.log(`    ⚠️ No data in last 24 hours, skipping`);
        continue;
      }
      
      console.log(`    ✓ Volume: ${volume.toLocaleString()} events`);
      
      // Get attributes with intelligent sampling
      const attributes = await this.discoverAttributesForEvent(eventType, volume);
      
      // Analyze data patterns
      const patterns = await this.analyzeDataPatterns(eventType, attributes);
      
      this.data.eventTypes[eventType] = {
        volume,
        attributes,
        patterns,
        queries: []
      };
    }
  }

  // Intelligent attribute discovery with sampling
  async discoverAttributesForEvent(eventType, volume) {
    const attributes = {
      numeric: {},
      string: {},
      boolean: {},
      timestamp: []
    };
    
    // Use sampling for high-volume events
    const sampleSize = volume > 100000 ? 'LIMIT 1000' : '';
    
    try {
      // Get all attributes
      const keysetQuery = `SELECT keyset() FROM ${eventType} SINCE 1 day ago ${sampleSize}`;
      const keysetResult = await this.runCachedQuery(keysetQuery);
      
      if (!keysetResult?.results?.length) return attributes;
      
      // Aggregate all keys from results
      const allKeys = new Set();
      keysetResult.results.forEach(r => {
        Object.keys(r).forEach(key => {
          if (key !== 'keyset') allKeys.add(key);
        });
      });
      
      console.log(`    ✓ Found ${allKeys.size} unique attributes`);
      
      // Classify attributes in batches
      const keyArray = Array.from(allKeys);
      for (let i = 0; i < keyArray.length; i += 10) {
        const batch = keyArray.slice(i, i + 10);
        await this.classifyAttributeBatch(eventType, batch, attributes);
      }
      
    } catch (error) {
      console.log(`    ❌ Error discovering attributes: ${error.message}`);
    }
    
    return attributes;
  }

  // Classify a batch of attributes
  async classifyAttributeBatch(eventType, attributeBatch, attributes) {
    for (const attr of attributeBatch) {
      try {
        // Skip problematic attributes
        if (this.isProblematicAttribute(attr)) continue;
        
        // Check if numeric
        const numQuery = `SELECT min(${attr}) as min, max(${attr}) as max, average(${attr}) as avg FROM ${eventType} WHERE ${attr} IS NOT NULL SINCE 1 hour ago`;
        const numResult = await this.runCachedQuery(numQuery);
        
        if (numResult?.results?.[0]?.avg !== null) {
          attributes.numeric[attr] = {
            min: numResult.results[0].min,
            max: numResult.results[0].max,
            avg: numResult.results[0].avg
          };
        } else {
          // Check cardinality for string attributes
          const cardQuery = `SELECT uniqueCount(${attr}) as cardinality FROM ${eventType} WHERE ${attr} IS NOT NULL SINCE 1 hour ago`;
          const cardResult = await this.runCachedQuery(cardQuery);
          const cardinality = cardResult?.results?.[0]?.cardinality || 0;
          
          if (cardinality > 0) {
            // Get sample values for low cardinality
            if (cardinality <= 100) {
              const samplesQuery = `SELECT uniques(${attr}, 10) as samples FROM ${eventType} WHERE ${attr} IS NOT NULL SINCE 1 hour ago`;
              const samplesResult = await this.runCachedQuery(samplesQuery);
              
              attributes.string[attr] = {
                cardinality,
                samples: samplesResult?.results?.[0]?.samples || []
              };
              
              // Check if boolean
              if (cardinality === 2 && attributes.string[attr].samples.every(v => 
                ['true', 'false', '0', '1'].includes(String(v).toLowerCase())
              )) {
                attributes.boolean[attr] = attributes.string[attr];
                delete attributes.string[attr];
              }
            } else {
              attributes.string[attr] = { cardinality, samples: [] };
            }
          }
        }
        
        // Check if timestamp
        if (attr.toLowerCase().includes('time') || attr.toLowerCase().includes('date')) {
          attributes.timestamp.push(attr);
        }
        
      } catch (error) {
        // Silent fail for individual attributes
      }
    }
  }

  // Analyze data patterns
  async analyzeDataPatterns(eventType, attributes) {
    const patterns = {
      timeDistribution: null,
      topDimensions: [],
      anomalies: []
    };
    
    // Time distribution
    try {
      const timeQuery = `SELECT count(*) FROM ${eventType} TIMESERIES 1 hour SINCE 1 day ago`;
      const timeResult = await this.runCachedQuery(timeQuery);
      if (timeResult?.results) {
        patterns.timeDistribution = timeResult.results;
      }
    } catch (error) {}
    
    // Find best dimensions for faceting
    const goodFacets = Object.entries(attributes.string)
      .filter(([attr, data]) => data.cardinality > 1 && data.cardinality <= 50)
      .map(([attr]) => attr)
      .slice(0, 5);
    
    for (const facet of goodFacets) {
      try {
        const facetQuery = `SELECT count(*) FROM ${eventType} FACET ${facet} SINCE 1 hour ago LIMIT 10`;
        const facetResult = await this.runCachedQuery(facetQuery);
        if (facetResult?.results?.length > 1) {
          patterns.topDimensions.push({
            attribute: facet,
            distribution: facetResult.results
          });
        }
      } catch (error) {}
    }
    
    return patterns;
  }

  // Discover metrics with categorization
  async discoverMetrics() {
    console.log('\n📈 Phase 2: Metric Discovery and Categorization...');
    
    try {
      // Get all metrics with dimensions
      const metricQuery = `
        SELECT uniques(metricName, 1000) as metrics, 
               uniques(instrumentation.provider, 10) as providers,
               uniques(instrumentation.source, 10) as sources
        FROM Metric 
        SINCE 1 day ago
      `;
      const result = await this.runCachedQuery(metricQuery);
      
      if (!result?.results?.[0]) return;
      
      const metrics = result.results[0].metrics || [];
      const providers = result.results[0].providers || [];
      const sources = result.results[0].sources || [];
      
      console.log(`  ✓ Found ${metrics.length} metrics`);
      console.log(`  ✓ Providers: ${providers.join(', ')}`);
      console.log(`  ✓ Sources: ${sources.join(', ')}`);
      
      // Categorize metrics
      const categories = this.categorizeMetrics(metrics);
      
      // Analyze each category
      for (const [category, metricList] of Object.entries(categories)) {
        if (metricList.length > 0) {
          console.log(`\n  📊 ${category}: ${metricList.length} metrics`);
          
          // Get sample values for top metrics
          const topMetrics = metricList.slice(0, 5);
          const metricData = await this.analyzeMetrics(topMetrics);
          
          this.data.metrics[category] = {
            count: metricList.length,
            metrics: metricList,
            topMetrics: metricData
          };
        }
      }
      
    } catch (error) {
      console.error('  ❌ Error discovering metrics:', error.message);
    }
  }

  // Categorize metrics by pattern
  categorizeMetrics(metrics) {
    const categories = {
      system: [],
      application: [],
      kafka: [],
      database: [],
      network: [],
      custom: [],
      other: []
    };
    
    metrics.forEach(metric => {
      const lower = metric.toLowerCase();
      
      if (lower.includes('system') || lower.includes('cpu') || lower.includes('memory') || lower.includes('disk')) {
        categories.system.push(metric);
      } else if (lower.includes('kafka')) {
        categories.kafka.push(metric);
      } else if (lower.includes('db') || lower.includes('database') || lower.includes('sql')) {
        categories.database.push(metric);
      } else if (lower.includes('network') || lower.includes('http') || lower.includes('tcp')) {
        categories.network.push(metric);
      } else if (lower.includes('apm') || lower.includes('transaction') || lower.includes('error')) {
        categories.application.push(metric);
      } else if (lower.includes('custom')) {
        categories.custom.push(metric);
      } else {
        categories.other.push(metric);
      }
    });
    
    return categories;
  }

  // Analyze specific metrics
  async analyzeMetrics(metrics) {
    const analyzed = [];
    
    for (const metric of metrics) {
      try {
        const query = `
          SELECT average(value) as avg, 
                 min(value) as min, 
                 max(value) as max,
                 latest(value) as latest
          FROM Metric 
          WHERE metricName = '${metric}' 
          SINCE 1 hour ago
        `;
        const result = await this.runCachedQuery(query);
        
        if (result?.results?.[0]) {
          analyzed.push({
            metric,
            stats: result.results[0]
          });
        }
      } catch (error) {}
    }
    
    return analyzed;
  }

  // Generate intelligent dashboard queries
  generateDashboards() {
    console.log('\n🎨 Phase 3: Generating Intelligent Dashboards...');
    
    const dashboards = [];
    
    // 1. Overview Dashboard
    dashboards.push(this.generateOverviewDashboard());
    
    // 2. Performance Dashboard (if applicable)
    if (this.hasPerformanceData()) {
      dashboards.push(this.generatePerformanceDashboard());
    }
    
    // 3. Infrastructure Dashboard (if applicable)
    if (this.hasInfrastructureData()) {
      dashboards.push(this.generateInfrastructureDashboard());
    }
    
    // 4. Custom dashboards for high-volume event types
    const topEventTypes = Object.entries(this.data.eventTypes)
      .sort((a, b) => b[1].volume - a[1].volume)
      .slice(0, 3);
    
    topEventTypes.forEach(([eventType, data]) => {
      dashboards.push(this.generateEventTypeDashboard(eventType, data));
    });
    
    // 5. Metrics Dashboard
    if (Object.keys(this.data.metrics).length > 0) {
      dashboards.push(this.generateMetricsDashboard());
    }
    
    this.data.dashboards = dashboards;
    console.log(`  ✓ Generated ${dashboards.length} dashboard configurations`);
  }

  // Generate overview dashboard
  generateOverviewDashboard() {
    const queries = [];
    const eventTypes = Object.keys(this.data.eventTypes);
    
    // Total events
    queries.push({
      title: 'Total Events (24h)',
      query: `SELECT count(*) FROM ${eventTypes.join(', ')} SINCE 1 day ago`,
      viz: 'viz.billboard'
    });
    
    // Event distribution
    queries.push({
      title: 'Event Distribution',
      query: `SELECT count(*) FROM ${eventTypes.join(', ')} FACET eventType() SINCE 1 day ago`,
      viz: 'viz.pie'
    });
    
    // Timeline
    queries.push({
      title: 'Event Timeline',
      query: `SELECT count(*) FROM ${eventTypes.join(', ')} TIMESERIES 1 hour SINCE 1 day ago`,
      viz: 'viz.line'
    });
    
    // Top event types by volume
    queries.push({
      title: 'Top Event Types by Volume',
      query: `SELECT count(*) FROM ${eventTypes.join(', ')} FACET eventType() SINCE 1 day ago LIMIT 10`,
      viz: 'viz.bar'
    });
    
    return {
      name: 'Data Overview',
      description: 'High-level view of all data in the account',
      queries
    };
  }

  // Generate performance dashboard
  generatePerformanceDashboard() {
    const queries = [];
    
    if (this.data.eventTypes.Transaction) {
      queries.push({
        title: 'Response Time Trend',
        query: 'SELECT average(duration), percentile(duration, 95) FROM Transaction TIMESERIES AUTO SINCE 1 day ago',
        viz: 'viz.line'
      });
      
      queries.push({
        title: 'Throughput',
        query: 'SELECT rate(count(*), 1 minute) FROM Transaction TIMESERIES AUTO SINCE 1 day ago',
        viz: 'viz.line'
      });
      
      queries.push({
        title: 'Error Rate',
        query: 'SELECT percentage(count(*), WHERE error IS true) FROM Transaction TIMESERIES AUTO SINCE 1 day ago',
        viz: 'viz.line'
      });
    }
    
    // Add APM metrics if available
    const apmMetrics = Object.values(this.data.metrics.application || {})
      .flatMap(m => m.metrics)
      .slice(0, 5);
    
    if (apmMetrics.length > 0) {
      queries.push({
        title: 'Application Metrics',
        query: `SELECT average(value) FROM Metric WHERE metricName IN (${apmMetrics.map(m => `'${m}'`).join(',')}) FACET metricName TIMESERIES AUTO SINCE 1 day ago`,
        viz: 'viz.line'
      });
    }
    
    return {
      name: 'Performance',
      description: 'Application performance metrics',
      queries
    };
  }

  // Generate infrastructure dashboard
  generateInfrastructureDashboard() {
    const queries = [];
    
    if (this.data.eventTypes.SystemSample) {
      queries.push({
        title: 'CPU Usage',
        query: 'SELECT average(cpuPercent) FROM SystemSample TIMESERIES AUTO SINCE 1 day ago',
        viz: 'viz.line'
      });
      
      queries.push({
        title: 'Memory Usage',
        query: 'SELECT average(memoryUsedPercent) FROM SystemSample TIMESERIES AUTO SINCE 1 day ago',
        viz: 'viz.line'
      });
      
      queries.push({
        title: 'Host CPU Rankings',
        query: 'SELECT average(cpuPercent) FROM SystemSample FACET hostname SINCE 1 hour ago',
        viz: 'viz.bar'
      });
    }
    
    // Add system metrics
    const sysMetrics = this.data.metrics.system?.topMetrics || [];
    sysMetrics.forEach(m => {
      queries.push({
        title: this.humanize(m.metric),
        query: `SELECT average(value) FROM Metric WHERE metricName = '${m.metric}' TIMESERIES AUTO SINCE 1 day ago`,
        viz: 'viz.line'
      });
    });
    
    return {
      name: 'Infrastructure',
      description: 'System and infrastructure metrics',
      queries
    };
  }

  // Generate dashboard for specific event type
  generateEventTypeDashboard(eventType, data) {
    const queries = [];
    
    // Volume over time
    queries.push({
      title: `${eventType} Volume`,
      query: `SELECT count(*) FROM ${eventType} TIMESERIES AUTO SINCE 1 day ago`,
      viz: 'viz.line'
    });
    
    // Numeric attributes
    Object.entries(data.attributes.numeric).slice(0, 4).forEach(([attr, stats]) => {
      queries.push({
        title: this.humanize(attr),
        query: `SELECT average(${attr}), max(${attr}) FROM ${eventType} TIMESERIES AUTO SINCE 1 day ago`,
        viz: 'viz.line'
      });
    });
    
    // Top dimensions
    data.patterns.topDimensions.slice(0, 3).forEach(dim => {
      queries.push({
        title: `By ${this.humanize(dim.attribute)}`,
        query: `SELECT count(*) FROM ${eventType} FACET ${dim.attribute} SINCE 1 day ago LIMIT 10`,
        viz: 'viz.bar'
      });
    });
    
    return {
      name: this.humanize(eventType),
      description: `Detailed metrics for ${eventType}`,
      queries
    };
  }

  // Generate metrics dashboard
  generateMetricsDashboard() {
    const queries = [];
    
    Object.entries(this.data.metrics).forEach(([category, data]) => {
      if (data.topMetrics.length > 0) {
        const metricNames = data.topMetrics.map(m => `'${m.metric}'`).join(',');
        queries.push({
          title: `${this.humanize(category)} Metrics`,
          query: `SELECT average(value) FROM Metric WHERE metricName IN (${metricNames}) FACET metricName TIMESERIES AUTO SINCE 1 day ago`,
          viz: 'viz.line'
        });
      }
    });
    
    return {
      name: 'Metrics',
      description: 'All discovered metrics',
      queries
    };
  }

  // Create actual dashboards in New Relic
  async createDashboards() {
    console.log('\n🚀 Phase 4: Creating Dashboards in New Relic...');
    
    for (const dashConfig of this.data.dashboards) {
      console.log(`\n  Creating ${dashConfig.name}...`);
      
      const widgets = dashConfig.queries.map((q, i) => ({
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
      
      const dashboard = {
        name: `Auto-Discovery: ${dashConfig.name} - ${new Date().toISOString().split('T')[0]}`,
        description: dashConfig.description,
        permissions: 'PUBLIC_READ_WRITE',
        pages: [{
          name: dashConfig.name,
          description: dashConfig.description,
          widgets
        }]
      };
      
      try {
        const result = await this.createDashboard(dashboard);
        if (result) {
          console.log(`  ✓ Created: ${result.url}`);
        }
      } catch (error) {
        console.log(`  ❌ Failed: ${error.message}`);
      }
    }
  }

  // Helper methods
  async runCachedQuery(query) {
    if (this.queryCache.has(query)) {
      return this.queryCache.get(query);
    }
    
    try {
      const result = await this.client.nrql(config.accountId, query);
      this.queryCache.set(query, result);
      return result;
    } catch (error) {
      return null;
    }
  }

  isProblematicAttribute(attr) {
    const problematic = ['keyset', 'timestamp', 'entityGuid', 'entity.guid'];
    return problematic.includes(attr);
  }

  humanize(str) {
    return str
      .replace(/([A-Z])/g, ' $1')
      .replace(/[._-]/g, ' ')
      .trim()
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  hasPerformanceData() {
    return this.data.eventTypes.Transaction || 
           this.data.metrics.application?.count > 0;
  }

  hasInfrastructureData() {
    return this.data.eventTypes.SystemSample || 
           this.data.eventTypes.ProcessSample ||
           this.data.metrics.system?.count > 0;
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

  // Save discovery results
  saveResults() {
    const filename = `advanced-discovery-${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(this.data, null, 2));
    console.log(`\n💾 Discovery results saved to: ${filename}`);
  }

  // Main discovery process
  async discover() {
    console.log('🚀 Advanced Data Discovery System');
    console.log(`📊 Account: ${config.accountId}`);
    console.log('This will perform an exhaustive analysis...\n');
    
    const startTime = Date.now();
    
    await this.discoverEventTypes();
    await this.discoverMetrics();
    this.generateDashboards();
    await this.createDashboards();
    this.saveResults();
    
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`\n✅ Discovery completed in ${duration} minutes`);
    
    // Summary
    console.log('\n📊 Discovery Summary:');
    console.log(`  - Event Types: ${Object.keys(this.data.eventTypes).length}`);
    console.log(`  - Total Events: ${Object.values(this.data.eventTypes).reduce((sum, e) => sum + e.volume, 0).toLocaleString()}`);
    console.log(`  - Metrics: ${Object.values(this.data.metrics).reduce((sum, m) => sum + m.count, 0)}`);
    console.log(`  - Dashboards Created: ${this.data.dashboards.length}`);
    console.log(`  - Queries Cached: ${this.queryCache.size}`);
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
  const discovery = new AdvancedDiscovery();
  
  if (args[0] === '--help') {
    console.log(`
Advanced Discovery System
========================

This tool performs exhaustive discovery of all data in your New Relic account
and automatically creates comprehensive dashboards.

Usage:
  node advanced-discovery.js              # Run full discovery
  node advanced-discovery.js --quick      # Quick discovery (last 1 hour)
  node advanced-discovery.js --help       # Show this help

Features:
  - Discovers all event types with data
  - Analyzes attributes and data patterns
  - Categorizes and analyzes metrics
  - Generates intelligent queries
  - Creates multiple focused dashboards
  - Saves results for future reference
`);
    process.exit(0);
  }

  await discovery.discover();
}

main().catch(console.error);