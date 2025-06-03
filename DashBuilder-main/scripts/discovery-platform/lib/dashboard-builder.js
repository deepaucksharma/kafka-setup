const { logger } = require('./logger');

class DashboardBuilder {
  constructor({ client, config }) {
    this.client = client;
    this.config = config;
  }
  
  async build(discoveries) {
    try {
      logger.info('Building comprehensive dashboard from discoveries');
      
      const pages = [];
      
      // Create overview page
      pages.push(this.createOverviewPage(discoveries));
      
      // Create pages for top event types
      const topEventTypes = discoveries.eventTypes
        .sort((a, b) => b.volume - a.volume)
        .slice(0, this.config.maxPagesPerDashboard - 3); // Reserve space for other pages
      
      topEventTypes.forEach(eventType => {
        const page = this.createEventTypePage(eventType, discoveries.queries);
        if (page.widgets.length > 0) {
          pages.push(page);
        }
      });
      
      // Create metrics page if metrics discovered
      if (discoveries.metrics.length > 0) {
        pages.push(this.createMetricsPage(discoveries.metrics, discoveries.queries));
      }
      
      // Create insights page
      if (discoveries.insights.length > 0) {
        pages.push(this.createInsightsPage(discoveries));
      }
      
      // Create specialized pages based on discovered data
      const specializedPages = this.createSpecializedPages(discoveries);
      pages.push(...specializedPages);
      
      // Build dashboard object
      const dashboard = {
        name: `Data Discovery Dashboard - ${new Date().toISOString().split('T')[0]}`,
        description: `Comprehensive dashboard for account ${this.config.accountId} with ${discoveries.eventTypes.length} event types and ${discoveries.metrics.reduce((sum, g) => sum + g.metrics.length, 0)} metrics`,
        permissions: 'PUBLIC_READ_WRITE',
        pages: pages.slice(0, this.config.maxPagesPerDashboard)
      };
      
      // Create dashboard via API
      const result = await this.createDashboard(dashboard);
      
      if (result) {
        discoveries.dashboard = dashboard;
        discoveries.dashboardGuid = result.guid;
        return {
          guid: result.guid,
          name: result.name,
          url: `https://one.newrelic.com/redirect/entity/${result.guid}`
        };
      }
      
    } catch (error) {
      logger.error('Error building dashboard', error);
      throw error;
    }
  }
  
  createOverviewPage(discoveries) {
    const widgets = [];
    let row = 1;
    
    // Summary statistics
    widgets.push({
      title: 'Discovery Summary',
      visualization: { id: 'viz.billboard' },
      layout: { column: 1, row, height: 3, width: 4 },
      rawConfiguration: {
        nrqlQueries: [{
          accountId: parseInt(this.config.accountId),
          query: `SELECT ${discoveries.eventTypes.length} as 'Event Types', ${discoveries.metrics.reduce((sum, g) => sum + g.metrics.length, 0)} as 'Metrics', ${discoveries.queries.length} as 'Generated Queries', ${discoveries.insights.length} as 'Insights' SINCE 1 minute ago`
        }]
      }
    });
    
    // Data volume by event type
    const topEventTypes = discoveries.eventTypes
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10);
    
    if (topEventTypes.length > 0) {
      const eventTypeList = topEventTypes.map(e => e.name).join(', ');
      widgets.push({
        title: 'Data Volume by Event Type',
        visualization: { id: 'viz.pie' },
        layout: { column: 5, row, height: 3, width: 4 },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(this.config.accountId),
            query: `SELECT count(*) FROM ${eventTypeList} FACET eventType() SINCE 1 day ago`
          }]
        }
      });
    }
    
    // Data quality score
    widgets.push({
      title: 'Data Quality Score',
      visualization: { id: 'viz.billboard' },
      layout: { column: 9, row, height: 3, width: 4 },
      rawConfiguration: {
        nrqlQueries: [{
          accountId: parseInt(this.config.accountId),
          query: `SELECT ${Math.round(discoveries.quality?.score || 85)} as 'Quality Score %' SINCE 1 minute ago`
        }],
        thresholds: [
          { value: 90, severity: 'success' },
          { value: 70, severity: 'warning' },
          { value: 0, severity: 'critical' }
        ]
      }
    });
    
    row += 3;
    
    // Event timeline
    const timelineEvents = topEventTypes.slice(0, 5).map(e => e.name).join(', ');
    if (timelineEvents) {
      widgets.push({
        title: 'Event Volume Timeline',
        visualization: { id: 'viz.line' },
        layout: { column: 1, row, height: 3, width: 12 },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(this.config.accountId),
            query: `SELECT count(*) FROM ${timelineEvents} TIMESERIES 1 hour SINCE 1 day ago`
          }]
        }
      });
      row += 3;
    }
    
    // Top insights
    if (discoveries.insights.length > 0) {
      const insightsList = discoveries.insights
        .slice(0, 5)
        .map((insight, i) => `'${i + 1}. ${insight.title}'`)
        .join(', ');
      
      widgets.push({
        title: 'Key Insights',
        visualization: { id: 'viz.table' },
        layout: { column: 1, row, height: 3, width: 12 },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(this.config.accountId),
            query: `SELECT ${insightsList} SINCE 1 minute ago`
          }]
        }
      });
    }
    
    return {
      name: 'Overview',
      description: 'High-level summary of discovered data',
      widgets
    };
  }
  
  createEventTypePage(eventType, allQueries) {
    const widgets = [];
    let row = 1;
    
    // Get queries for this event type
    const eventQueries = allQueries
      .filter(q => q.category === eventType.name)
      .slice(0, this.config.maxWidgetsPerPage);
    
    // Event summary
    widgets.push({
      title: `${eventType.name} Summary`,
      visualization: { id: 'viz.billboard' },
      layout: { column: 1, row, height: 3, width: 4 },
      rawConfiguration: {
        nrqlQueries: [{
          accountId: parseInt(this.config.accountId),
          query: `SELECT count(*) as 'Total Events', uniqueCount(entity.guid) as 'Entities', ${Object.keys(eventType.attributes).length} as 'Attributes' FROM ${eventType.name} SINCE 1 hour ago`
        }]
      }
    });
    
    // Add widgets from generated queries
    let column = 5;
    eventQueries.forEach((query, index) => {
      if (widgets.length >= this.config.maxWidgetsPerPage) return;
      
      widgets.push({
        title: query.title,
        visualization: { id: query.visualization },
        layout: {
          column,
          row,
          height: 3,
          width: 4
        },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(this.config.accountId),
            query: query.query
          }]
        }
      });
      
      column += 4;
      if (column > 12) {
        column = 1;
        row += 3;
      }
    });
    
    // Add attribute distribution if space available
    if (widgets.length < this.config.maxWidgetsPerPage - 2) {
      const stringAttrs = Object.entries(eventType.attributes)
        .filter(([_, info]) => info.type === 'string' && info.cardinality < 20)
        .slice(0, 2);
      
      stringAttrs.forEach(([attr, info]) => {
        if (widgets.length >= this.config.maxWidgetsPerPage) return;
        
        widgets.push({
          title: `Distribution by ${this.humanize(attr)}`,
          visualization: { id: 'viz.pie' },
          layout: {
            column: column,
            row: row,
            height: 3,
            width: 4
          },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: parseInt(this.config.accountId),
              query: `SELECT count(*) FROM ${eventType.name} FACET ${attr} SINCE 1 hour ago LIMIT 10`
            }]
          }
        });
        
        column += 4;
        if (column > 12) {
          column = 1;
          row += 3;
        }
      });
    }
    
    return {
      name: this.humanize(eventType.name),
      description: `Detailed view of ${eventType.name} data`,
      widgets
    };
  }
  
  createMetricsPage(metricGroups, allQueries) {
    const widgets = [];
    let row = 1;
    
    // Metrics overview
    const totalMetrics = metricGroups.reduce((sum, g) => sum + (g.statistics?.totalMetrics || 0), 0);
    widgets.push({
      title: 'Metrics Overview',
      visualization: { id: 'viz.billboard' },
      layout: { column: 1, row, height: 3, width: 4 },
      rawConfiguration: {
        nrqlQueries: [{
          accountId: parseInt(this.config.accountId),
          query: `SELECT ${totalMetrics} as 'Total Metrics', ${metricGroups.length} as 'Metric Groups' SINCE 1 minute ago`
        }]
      }
    });
    
    // Add metric queries
    const metricQueries = allQueries
      .filter(q => q.category === 'Metrics')
      .slice(0, this.config.maxWidgetsPerPage - 1);
    
    let column = 5;
    metricQueries.forEach(query => {
      if (widgets.length >= this.config.maxWidgetsPerPage) return;
      
      widgets.push({
        title: query.title,
        visualization: { id: query.visualization },
        layout: {
          column,
          row,
          height: 3,
          width: column === 5 ? 8 : 4
        },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(this.config.accountId),
            query: query.query
          }]
        }
      });
      
      if (column === 5) {
        row += 3;
        column = 1;
      } else {
        column += 4;
        if (column > 12) {
          column = 1;
          row += 3;
        }
      }
    });
    
    return {
      name: 'Metrics',
      description: 'Overview of all discovered metrics',
      widgets
    };
  }
  
  createInsightsPage(discoveries) {
    const widgets = [];
    let row = 1;
    
    // Group insights by category
    const insightsByCategory = {};
    discoveries.insights.forEach(insight => {
      const category = insight.category || 'general';
      if (!insightsByCategory[category]) {
        insightsByCategory[category] = [];
      }
      insightsByCategory[category].push(insight);
    });
    
    // Create widgets for each category
    Object.entries(insightsByCategory).forEach(([category, insights]) => {
      if (widgets.length >= this.config.maxWidgetsPerPage) return;
      
      const insightTexts = insights
        .slice(0, 5)
        .map((insight, i) => `'${insight.type}: ${insight.title}'`)
        .join(', ');
      
      widgets.push({
        title: `${this.humanize(category)} Insights`,
        visualization: { id: 'viz.table' },
        layout: {
          column: 1,
          row,
          height: 3,
          width: 12
        },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(this.config.accountId),
            query: `SELECT ${insightTexts} SINCE 1 minute ago`
          }]
        }
      });
      
      row += 3;
    });
    
    // Add recommendations if available
    if (discoveries.recommendations && discoveries.recommendations.length > 0) {
      const recommendationTexts = discoveries.recommendations
        .slice(0, 5)
        .map((rec, i) => `'${i + 1}. ${rec.title} (${rec.priority} priority)'`)
        .join(', ');
      
      widgets.push({
        title: 'Recommendations',
        visualization: { id: 'viz.table' },
        layout: {
          column: 1,
          row,
          height: 3,
          width: 12
        },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(this.config.accountId),
            query: `SELECT ${recommendationTexts} SINCE 1 minute ago`
          }]
        }
      });
    }
    
    return {
      name: 'Insights & Recommendations',
      description: 'Key findings and actionable recommendations',
      widgets
    };
  }
  
  createSpecializedPages(discoveries) {
    const pages = [];
    
    // Kafka page if Kafka data exists
    const kafkaData = this.extractKafkaData(discoveries);
    if (kafkaData.hasData) {
      pages.push(this.createKafkaPage(kafkaData, discoveries.queries));
    }
    
    // APM page if application data exists
    const apmData = this.extractAPMData(discoveries);
    if (apmData.hasData) {
      pages.push(this.createAPMPage(apmData, discoveries.queries));
    }
    
    // Infrastructure page if infra data exists
    const infraData = this.extractInfraData(discoveries);
    if (infraData.hasData) {
      pages.push(this.createInfraPage(infraData, discoveries.queries));
    }
    
    return pages;
  }
  
  createKafkaPage(kafkaData, allQueries) {
    const widgets = [];
    let row = 1;
    
    // Kafka ecosystem health
    widgets.push({
      title: 'Kafka Ecosystem Health',
      visualization: { id: 'viz.billboard' },
      layout: { column: 1, row, height: 3, width: 12 },
      rawConfiguration: {
        nrqlQueries: [{
          accountId: parseInt(this.config.accountId),
          query: `
            SELECT 
              latest(broker.bytesInPerSecond) as 'Broker Throughput (bytes/sec)',
              sum(queue.size) as 'Total Unacked Messages',
              uniqueCount(share.group.name) as 'Active Share Groups',
              max(oldest.message.age.seconds) as 'Max Message Age (sec)'
            FROM KafkaBrokerSample, QueueSample 
            WHERE provider = 'kafka' OR clusterName IS NOT NULL
            SINCE 5 minutes ago
          `
        }]
      }
    });
    
    row += 3;
    
    // Add Kafka-specific queries
    const kafkaQueries = allQueries
      .filter(q => q.category === 'QueueSample' || q.category === 'KafkaBrokerSample' || q.title.toLowerCase().includes('kafka'))
      .slice(0, this.config.maxWidgetsPerPage - 1);
    
    let column = 1;
    kafkaQueries.forEach(query => {
      if (widgets.length >= this.config.maxWidgetsPerPage) return;
      
      widgets.push({
        title: query.title,
        visualization: { id: query.visualization },
        layout: {
          column,
          row,
          height: 3,
          width: 6
        },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(this.config.accountId),
            query: query.query
          }]
        }
      });
      
      column += 6;
      if (column > 12) {
        column = 1;
        row += 3;
      }
    });
    
    return {
      name: 'Kafka Monitoring',
      description: 'Comprehensive Kafka and Share Groups monitoring',
      widgets
    };
  }
  
  createAPMPage(apmData, allQueries) {
    const widgets = [];
    let row = 1;
    
    // Golden signals
    widgets.push({
      title: 'Application Golden Signals',
      visualization: { id: 'viz.line' },
      layout: { column: 1, row, height: 3, width: 12 },
      rawConfiguration: {
        nrqlQueries: [{
          accountId: parseInt(this.config.accountId),
          query: `
            SELECT 
              rate(count(*), 1 minute) as 'Throughput (rpm)',
              average(duration) * 1000 as 'Latency (ms)',
              percentage(count(*), WHERE error IS true) as 'Error Rate %'
            FROM Transaction 
            TIMESERIES 5 minutes 
            SINCE 1 hour ago
          `
        }]
      }
    });
    
    row += 3;
    
    // Add APM-specific queries
    const apmQueries = allQueries
      .filter(q => ['Transaction', 'Span', 'Specialized'].includes(q.category) && q.title.includes('Application'))
      .slice(0, this.config.maxWidgetsPerPage - 1);
    
    let column = 1;
    apmQueries.forEach(query => {
      if (widgets.length >= this.config.maxWidgetsPerPage) return;
      
      const width = query.visualization === 'viz.table' ? 12 : 6;
      
      widgets.push({
        title: query.title,
        visualization: { id: query.visualization },
        layout: {
          column,
          row,
          height: 3,
          width
        },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(this.config.accountId),
            query: query.query
          }]
        }
      });
      
      column += width;
      if (column > 12) {
        column = 1;
        row += 3;
      }
    });
    
    return {
      name: 'Application Performance',
      description: 'Application performance monitoring and analysis',
      widgets
    };
  }
  
  createInfraPage(infraData, allQueries) {
    const widgets = [];
    let row = 1;
    
    // Infrastructure overview
    widgets.push({
      title: 'Infrastructure Health Overview',
      visualization: { id: 'viz.billboard' },
      layout: { column: 1, row, height: 3, width: 12 },
      rawConfiguration: {
        nrqlQueries: [{
          accountId: parseInt(this.config.accountId),
          query: `
            SELECT 
              average(cpuPercent) as 'Avg CPU %',
              average(memoryUsedPercent) as 'Avg Memory %',
              average(diskUsedPercent) as 'Avg Disk %',
              uniqueCount(hostname) as 'Active Hosts'
            FROM SystemSample 
            SINCE 5 minutes ago
          `
        }]
      }
    });
    
    row += 3;
    
    // Add infrastructure queries
    const infraQueries = allQueries
      .filter(q => ['SystemSample', 'ProcessSample', 'NetworkSample', 'Specialized'].includes(q.category) && q.title.includes('Infrastructure'))
      .slice(0, this.config.maxWidgetsPerPage - 1);
    
    let column = 1;
    infraQueries.forEach(query => {
      if (widgets.length >= this.config.maxWidgetsPerPage) return;
      
      widgets.push({
        title: query.title,
        visualization: { id: query.visualization },
        layout: {
          column,
          row,
          height: 3,
          width: 6
        },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(this.config.accountId),
            query: query.query
          }]
        }
      });
      
      column += 6;
      if (column > 12) {
        column = 1;
        row += 3;
      }
    });
    
    return {
      name: 'Infrastructure',
      description: 'Infrastructure monitoring and resource utilization',
      widgets
    };
  }
  
  extractKafkaData(discoveries) {
    const kafkaEventTypes = discoveries.eventTypes.filter(e => 
      e.name.toLowerCase().includes('kafka') || e.name === 'QueueSample'
    );
    
    return {
      hasData: kafkaEventTypes.length > 0,
      eventTypes: kafkaEventTypes
    };
  }
  
  extractAPMData(discoveries) {
    const apmEventTypes = discoveries.eventTypes.filter(e => 
      ['Transaction', 'Span', 'TransactionError'].includes(e.name)
    );
    
    return {
      hasData: apmEventTypes.length > 0,
      eventTypes: apmEventTypes
    };
  }
  
  extractInfraData(discoveries) {
    const infraEventTypes = discoveries.eventTypes.filter(e => 
      ['SystemSample', 'ProcessSample', 'NetworkSample', 'ContainerSample'].includes(e.name)
    );
    
    return {
      hasData: infraEventTypes.length > 0,
      eventTypes: infraEventTypes
    };
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
    
    try {
      const response = await this.client.query(mutation, {
        accountId: parseInt(this.config.accountId),
        dashboard
      });
      
      if (response.dashboardCreate?.entityResult) {
        logger.info('Dashboard created successfully', {
          guid: response.dashboardCreate.entityResult.guid,
          name: response.dashboardCreate.entityResult.name
        });
        return response.dashboardCreate.entityResult;
      }
      
      if (response.dashboardCreate?.errors) {
        logger.error('Dashboard creation errors', response.dashboardCreate.errors);
        throw new Error(response.dashboardCreate.errors[0]?.description || 'Dashboard creation failed');
      }
      
    } catch (error) {
      logger.error('Failed to create dashboard', error);
      throw error;
    }
  }
  
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
}

module.exports = DashboardBuilder;