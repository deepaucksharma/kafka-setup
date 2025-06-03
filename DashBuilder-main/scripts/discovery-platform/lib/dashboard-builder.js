const { logger } = require('./logger');

class DashboardBuilder {
  constructor({ client, config }) {
    this.client = client;
    this.config = config;
    
    this.defaultPermissions = 'PUBLIC_READ_WRITE';
    this.maxWidgetsPerPage = config.maxWidgetsPerPage || 12;
    this.maxPagesPerDashboard = config.maxPagesPerDashboard || 10;
  }
  
  async build(discoveries) {
    logger.info('Building dashboard from discoveries');
    
    const dashboard = {
      name: `Discovery Dashboard - ${new Date().toISOString().split('T')[0]}`,
      description: `Auto-generated dashboard from discovery in account ${this.config.accountId}`,
      permissions: this.defaultPermissions,
      pages: []
    };
    
    // Create pages based on discovered data
    const pages = [];
    
    // Overview page
    const overviewPage = this.createOverviewPage(discoveries);
    if (overviewPage.widgets.length > 0) {
      pages.push(overviewPage);
    }
    
    // Event types page
    const eventTypesPage = this.createEventTypesPage(discoveries);
    if (eventTypesPage.widgets.length > 0) {
      pages.push(eventTypesPage);
    }
    
    // Metrics page
    if (discoveries.metrics && discoveries.metrics.length > 0) {
      const metricsPage = this.createMetricsPage(discoveries);
      pages.push(metricsPage);
    }
    
    // Insights page
    if (discoveries.insights && discoveries.insights.length > 0) {
      const insightsPage = this.createInsightsPage(discoveries);
      pages.push(insightsPage);
    }
    
    dashboard.pages = pages.slice(0, this.maxPagesPerDashboard);
    
    // Deploy the dashboard
    try {
      const result = await this.deployDashboard(dashboard);
      
      return {
        dashboard,
        url: result.url,
        guid: result.guid
      };
    } catch (error) {
      logger.error('Failed to deploy dashboard', error);
      throw error;
    }
  }
  
  createOverviewPage(discoveries) {
    const widgets = [];
    
    // Summary widget
    widgets.push({
      title: 'Discovery Summary',
      configuration: {
        markdown: {
          text: this.createSummaryMarkdown(discoveries)
        }
      },
      layout: { column: 1, row: 1, width: 4, height: 3 }
    });
    
    // Event volume chart
    if (discoveries.eventTypes.length > 0) {
      const topEventTypes = discoveries.eventTypes
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 10)
        .map(et => et.name);
      
      widgets.push({
        title: 'Event Volume Distribution',
        configuration: {
          bar: {
            queries: [{
              query: `SELECT count(*) FROM ${topEventTypes.join(', ')} FACET eventType() SINCE 1 day ago`,
              accountId: this.config.accountId
            }]
          }
        },
        layout: { column: 5, row: 1, width: 8, height: 3 }
      });
    }
    
    // Key metrics
    if (discoveries.queries && discoveries.queries.length > 0) {
      const overviewQueries = discoveries.queries
        .filter(q => q.category === 'overview')
        .slice(0, 3);
      
      overviewQueries.forEach((query, index) => {
        widgets.push({
          title: query.title,
          configuration: {
            [this.getVisualizationType(query.visualization)]: {
              queries: [{
                query: query.query,
                accountId: this.config.accountId
              }]
            }
          },
          layout: { 
            column: 1 + (index * 4), 
            row: 4, 
            width: 4, 
            height: 3 
          }
        });
      });
    }
    
    return {
      name: 'Overview',
      description: 'High-level summary of discovered data',
      widgets: widgets.slice(0, this.maxWidgetsPerPage)
    };
  }
  
  createEventTypesPage(discoveries) {
    const widgets = [];
    
    // Create widgets for top event types
    const topEventTypes = discoveries.eventTypes
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 6);
    
    topEventTypes.forEach((eventType, index) => {
      const row = Math.floor(index / 2) * 3 + 1;
      const column = (index % 2) * 6 + 1;
      
      widgets.push({
        title: `${eventType.name} Activity`,
        configuration: {
          line: {
            queries: [{
              query: `SELECT count(*) FROM ${eventType.name} TIMESERIES AUTO SINCE 1 day ago`,
              accountId: this.config.accountId
            }]
          }
        },
        layout: { column, row, width: 6, height: 3 }
      });
    });
    
    return {
      name: 'Event Types',
      description: 'Activity trends for discovered event types',
      widgets: widgets.slice(0, this.maxWidgetsPerPage)
    };
  }
  
  createMetricsPage(discoveries) {
    const widgets = [];
    let currentRow = 1;
    
    discoveries.metrics.forEach((metricGroup, groupIndex) => {
      if (groupIndex >= 3) return; // Limit to 3 metric groups
      
      // Group header
      widgets.push({
        title: `${metricGroup.name} Metrics`,
        configuration: {
          markdown: {
            text: `### ${metricGroup.name}\n${metricGroup.metrics.length} metrics analyzed`
          }
        },
        layout: { column: 1, row: currentRow, width: 12, height: 1 }
      });
      
      currentRow++;
      
      // Metric charts
      metricGroup.metrics.slice(0, 2).forEach((metric, index) => {
        widgets.push({
          title: this.formatMetricName(metric.name),
          configuration: {
            line: {
              queries: [{
                query: `SELECT average(value) FROM Metric WHERE metricName = '${metric.name}' TIMESERIES AUTO SINCE 1 hour ago`,
                accountId: this.config.accountId
              }]
            }
          },
          layout: { 
            column: index * 6 + 1, 
            row: currentRow, 
            width: 6, 
            height: 3 
          }
        });
      });
      
      currentRow += 3;
    });
    
    return {
      name: 'Metrics',
      description: 'Custom metrics analysis',
      widgets: widgets.slice(0, this.maxWidgetsPerPage)
    };
  }
  
  createInsightsPage(discoveries) {
    const widgets = [];
    
    // Insights summary
    const insightsMarkdown = discoveries.insights
      .slice(0, 10)
      .map((insight, i) => `${i + 1}. **${insight.title}**: ${insight.description}`)
      .join('\n');
    
    widgets.push({
      title: 'Key Insights',
      configuration: {
        markdown: { text: insightsMarkdown }
      },
      layout: { column: 1, row: 1, width: 6, height: 4 }
    });
    
    // Recommendations
    if (discoveries.recommendations) {
      const recsMarkdown = discoveries.recommendations
        .slice(0, 5)
        .map((rec, i) => `${i + 1}. **${rec.title}** (${rec.priority}): ${rec.description}`)
        .join('\n');
      
      widgets.push({
        title: 'Recommendations',
        configuration: {
          markdown: { text: recsMarkdown }
        },
        layout: { column: 7, row: 1, width: 6, height: 4 }
      });
    }
    
    // Insight queries
    const insightQueries = discoveries.insights
      .filter(i => i.query)
      .slice(0, 4);
    
    insightQueries.forEach((insight, index) => {
      const row = 5 + Math.floor(index / 2) * 3;
      const column = (index % 2) * 6 + 1;
      
      widgets.push({
        title: insight.title,
        configuration: {
          billboard: {
            queries: [{
              query: insight.query,
              accountId: this.config.accountId
            }]
          }
        },
        layout: { column, row, width: 6, height: 3 }
      });
    });
    
    return {
      name: 'Insights & Recommendations',
      description: 'Key findings and optimization opportunities',
      widgets: widgets.slice(0, this.maxWidgetsPerPage)
    };
  }
  
  createSummaryMarkdown(discoveries) {
    const lines = [
      '## Discovery Summary',
      '',
      `**Account**: ${this.config.accountId}`,
      `**Date**: ${new Date().toISOString()}`,
      '',
      '### Data Sources',
      `- **Event Types**: ${discoveries.eventTypes.length}`,
      `- **Total Attributes**: ${discoveries.eventTypes.reduce((sum, et) => sum + Object.keys(et.attributes || {}).length, 0)}`,
      `- **Metrics**: ${discoveries.metrics?.reduce((sum, g) => sum + g.totalMetrics, 0) || 0}`,
      `- **Relationships**: ${discoveries.relationships?.length || 0}`,
      `- **Insights**: ${discoveries.insights?.length || 0}`
    ];
    
    return lines.join('\n');
  }
  
  async deployDashboard(dashboard) {
    try {
      const result = await this.client.createDashboard(this.config.accountId, dashboard);
      
      const url = `https://one.newrelic.com/dashboards/${result.guid}`;
      
      logger.info('Dashboard deployed successfully', { 
        guid: result.guid, 
        url 
      });
      
      return {
        guid: result.guid,
        url,
        name: result.name
      };
      
    } catch (error) {
      logger.error('Failed to deploy dashboard', error);
      throw error;
    }
  }
  
  getVisualizationType(vizId) {
    const vizMap = {
      'viz.line': 'line',
      'viz.area': 'area',
      'viz.bar': 'bar',
      'viz.billboard': 'billboard',
      'viz.pie': 'pie',
      'viz.table': 'table',
      'viz.json': 'json'
    };
    
    return vizMap[vizId] || 'line';
  }
  
  formatMetricName(name) {
    return name
      .replace(/[._]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

module.exports = DashboardBuilder;