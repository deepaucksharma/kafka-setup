/**
 * Dashboard Integration Module
 * Connects discovery results to the DashBuilder dashboard generation system
 */

const path = require('path');
const fs = require('fs');
const { logger } = require('./logger');

class DashboardIntegration {
  constructor(config = {}) {
    this.config = {
      dashboardGeneratorPath: config.dashboardGeneratorPath || 
        path.join(__dirname, '../../../dashboard-generator'),
      templatesPath: config.templatesPath || 
        path.join(__dirname, '../../../dashboard-generator/templates'),
      ...config
    };
    
    // Load dashboard generator
    try {
      const DashboardGenerator = require(path.join(this.config.dashboardGeneratorPath, 'index.js'));
      this.dashboardGenerator = new DashboardGenerator(this.config);
    } catch (error) {
      logger.warn('Dashboard Generator not found, using standalone mode', error.message);
      this.dashboardGenerator = null;
    }
  }
  
  /**
   * Generate dashboard configuration from discovery results
   * @param {Object} discoveries - Discovery results from DiscoveryPlatform
   * @returns {Object} Dashboard configuration
   */
  async generateDashboardConfig(discoveries) {
    logger.info('Generating dashboard configuration from discoveries');
    
    const dashboardConfig = {
      name: `Discovery Dashboard - ${discoveries.accountId || 'Unknown'}`,
      description: `Auto-generated dashboard from discovery on ${new Date().toISOString()}`,
      permissions: 'PUBLIC_READ_WRITE',
      pages: []
    };
    
    // Page 1: Overview
    const overviewPage = this.createOverviewPage(discoveries);
    if (overviewPage.widgets.length > 0) {
      dashboardConfig.pages.push(overviewPage);
    }
    
    // Page 2: Event Types Analysis
    const eventTypesPage = this.createEventTypesPage(discoveries);
    if (eventTypesPage.widgets.length > 0) {
      dashboardConfig.pages.push(eventTypesPage);
    }
    
    // Page 3: Metrics Analysis
    if (discoveries.metrics && discoveries.metrics.length > 0) {
      const metricsPage = this.createMetricsPage(discoveries);
      dashboardConfig.pages.push(metricsPage);
    }
    
    // Page 4: Traces & Services
    if (discoveries.traces) {
      const tracesPage = this.createTracesPage(discoveries);
      dashboardConfig.pages.push(tracesPage);
    }
    
    // Page 5: Logs Analysis
    if (discoveries.logs) {
      const logsPage = this.createLogsPage(discoveries);
      dashboardConfig.pages.push(logsPage);
    }
    
    // Page 6: Custom Insights
    if (discoveries.insights && discoveries.insights.length > 0) {
      const insightsPage = this.createInsightsPage(discoveries);
      dashboardConfig.pages.push(insightsPage);
    }
    
    // Page 7: Relationships
    if (discoveries.relationships && discoveries.relationships.length > 0) {
      const relationshipsPage = this.createRelationshipsPage(discoveries);
      dashboardConfig.pages.push(relationshipsPage);
    }
    
    return dashboardConfig;
  }
  
  createOverviewPage(discoveries) {
    const widgets = [];
    const gridY = 0;
    let currentY = 0;
    
    // Summary Stats Widget
    widgets.push({
      title: 'Discovery Summary',
      configuration: {
        markdown: {
          text: this.generateSummaryMarkdown(discoveries)
        }
      },
      layout: { column: 1, row: currentY + 1, width: 4, height: 3 }
    });
    
    // Top Event Types by Volume
    if (discoveries.eventTypes && discoveries.eventTypes.length > 0) {
      const topEventTypes = discoveries.eventTypes
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 10);
      
      widgets.push({
        title: 'Top Event Types by Volume',
        configuration: {
          bar: {
            queries: [{
              query: `SELECT count(*) FROM ${topEventTypes.map(e => e.name).join(', ')} FACET eventType() SINCE 1 day ago`,
              accountId: this.config.accountId
            }]
          }
        },
        layout: { column: 5, row: currentY + 1, width: 4, height: 3 }
      });
    }
    
    // Data Points Distribution
    if (discoveries.eventTypes && discoveries.eventTypes.length > 0) {
      const attributeCounts = discoveries.eventTypes.map(et => ({
        name: et.name,
        attributes: Object.keys(et.attributes || {}).length
      }));
      
      widgets.push({
        title: 'Attributes per Event Type',
        configuration: {
          line: {
            queries: [{
              query: `SELECT ${attributeCounts.map(ac => 
                `${ac.attributes} as '${ac.name}'`
              ).join(', ')} FROM Transaction SINCE 1 minute ago`,
              accountId: this.config.accountId
            }]
          }
        },
        layout: { column: 9, row: currentY + 1, width: 4, height: 3 }
      });
    }
    
    currentY += 3;
    
    // Key Metrics Overview
    if (discoveries.metrics && discoveries.metrics.length > 0) {
      const metricGroups = discoveries.metrics.map(g => 
        `'${g.name}': ${g.totalMetrics}`
      ).join(', ');
      
      widgets.push({
        title: 'Metric Groups',
        configuration: {
          pie: {
            queries: [{
              query: `SELECT ${metricGroups} FROM Transaction SINCE 1 minute ago`,
              accountId: this.config.accountId
            }]
          }
        },
        layout: { column: 1, row: currentY + 1, width: 6, height: 3 }
      });
    }
    
    return {
      name: 'Overview',
      description: 'High-level summary of discovered data',
      widgets
    };
  }
  
  createEventTypesPage(discoveries) {
    const widgets = [];
    let currentY = 0;
    
    if (!discoveries.eventTypes || discoveries.eventTypes.length === 0) {
      return { name: 'Event Types', widgets: [] };
    }
    
    // Process each event type
    discoveries.eventTypes.slice(0, 10).forEach((eventType, index) => {
      if (index % 2 === 0) currentY += 3;
      
      const column = (index % 2) * 6 + 1;
      
      // Create widget for each event type
      widgets.push({
        title: `${eventType.name} Overview`,
        configuration: {
          billboard: {
            queries: [{
              query: `SELECT count(*) as 'Events', uniqueCount(entity.guid) as 'Entities' FROM ${eventType.name} SINCE 1 hour ago`,
              accountId: this.config.accountId
            }]
          }
        },
        layout: { column, row: currentY - 2, width: 6, height: 3 }
      });
    });
    
    return {
      name: 'Event Types',
      description: 'Detailed view of discovered event types',
      widgets
    };
  }
  
  createMetricsPage(discoveries) {
    const widgets = [];
    let currentY = 0;
    
    discoveries.metrics.forEach((metricGroup, groupIndex) => {
      // Group header
      widgets.push({
        title: `${metricGroup.name} Metrics (${metricGroup.totalMetrics} total)`,
        configuration: {
          markdown: {
            text: `### ${metricGroup.name} Metrics\n\nAnalyzed ${metricGroup.analyzedMetrics} of ${metricGroup.totalMetrics} metrics in this group.`
          }
        },
        layout: { column: 1, row: currentY + 1, width: 12, height: 1 }
      });
      
      currentY += 1;
      
      // Sample metrics from group
      metricGroup.metrics.slice(0, 4).forEach((metric, index) => {
        const column = (index % 2) * 6 + 1;
        if (index % 2 === 0 && index > 0) currentY += 3;
        
        widgets.push({
          title: metric.name,
          configuration: {
            line: {
              queries: [{
                query: `SELECT average(value) FROM Metric WHERE metricName = '${metric.name}' TIMESERIES SINCE 1 hour ago`,
                accountId: this.config.accountId
              }]
            }
          },
          layout: { column, row: currentY + 1, width: 6, height: 3 }
        });
      });
      
      currentY += 3;
    });
    
    return {
      name: 'Metrics',
      description: 'Discovered metrics grouped by category',
      widgets
    };
  }
  
  createTracesPage(discoveries) {
    const widgets = [];
    let currentY = 0;
    
    if (!discoveries.traces) {
      return { name: 'Traces', widgets: [] };
    }
    
    // Trace Statistics
    if (discoveries.traces.statistics) {
      widgets.push({
        title: 'Trace Statistics',
        configuration: {
          billboard: {
            queries: [{
              query: `SELECT count(*) as 'Spans', uniqueCount(trace.id) as 'Traces', uniqueCount(service.name) as 'Services' FROM Span SINCE 1 hour ago`,
              accountId: this.config.accountId
            }]
          }
        },
        layout: { column: 1, row: 1, width: 12, height: 2 }
      });
      currentY = 2;
    }
    
    // Service Map
    if (discoveries.traces.services && discoveries.traces.services.length > 0) {
      widgets.push({
        title: 'Service Overview',
        configuration: {
          table: {
            queries: [{
              query: `SELECT average(duration) as 'Avg Duration', percentage(count(*), WHERE error IS true) as 'Error Rate', count(*) as 'Transactions' FROM Transaction FACET service.name SINCE 1 hour ago LIMIT 20`,
              accountId: this.config.accountId
            }]
          }
        },
        layout: { column: 1, row: currentY + 1, width: 6, height: 4 }
      });
      
      // Top Operations
      if (discoveries.traces.operations && discoveries.traces.operations.length > 0) {
        widgets.push({
          title: 'Top Operations',
          configuration: {
            bar: {
              queries: [{
                query: `SELECT count(*) FROM Span FACET name SINCE 1 hour ago LIMIT 10`,
                accountId: this.config.accountId
              }]
            }
          },
          layout: { column: 7, row: currentY + 1, width: 6, height: 4 }
        });
      }
    }
    
    return {
      name: 'Traces & Services',
      description: 'Distributed tracing and service analysis',
      widgets
    };
  }
  
  createLogsPage(discoveries) {
    const widgets = [];
    let currentY = 0;
    
    if (!discoveries.logs) {
      return { name: 'Logs', widgets: [] };
    }
    
    // Log Statistics
    if (discoveries.logs.statistics) {
      widgets.push({
        title: 'Log Volume',
        configuration: {
          area: {
            queries: [{
              query: `SELECT count(*) FROM Log TIMESERIES SINCE 1 day ago`,
              accountId: this.config.accountId
            }]
          }
        },
        layout: { column: 1, row: 1, width: 8, height: 3 }
      });
      
      // Log Levels
      if (discoveries.logs.levels && discoveries.logs.levels.length > 0) {
        widgets.push({
          title: 'Log Levels',
          configuration: {
            pie: {
              queries: [{
                query: `SELECT count(*) FROM Log FACET level SINCE 1 hour ago`,
                accountId: this.config.accountId
              }]
            }
          },
          layout: { column: 9, row: 1, width: 4, height: 3 }
        });
      }
    }
    
    currentY = 3;
    
    // Log Patterns
    if (discoveries.logs.patterns && discoveries.logs.patterns.length > 0) {
      widgets.push({
        title: 'Log Patterns',
        configuration: {
          bar: {
            queries: [{
              query: `SELECT count(*) FROM Log WHERE message IS NOT NULL FACET cases(WHERE message LIKE '%error%' AS 'Errors', WHERE message LIKE '%warn%' AS 'Warnings', WHERE message LIKE '%exception%' AS 'Exceptions') SINCE 1 hour ago`,
              accountId: this.config.accountId
            }]
          }
        },
        layout: { column: 1, row: currentY + 1, width: 12, height: 3 }
      });
    }
    
    return {
      name: 'Logs',
      description: 'Log analysis and patterns',
      widgets
    };
  }
  
  createInsightsPage(discoveries) {
    const widgets = [];
    let currentY = 0;
    
    // Group insights by type
    const insightGroups = {};
    discoveries.insights.forEach(insight => {
      const type = insight.type || 'general';
      if (!insightGroups[type]) insightGroups[type] = [];
      insightGroups[type].push(insight);
    });
    
    Object.entries(insightGroups).forEach(([type, insights]) => {
      // Insights markdown widget
      const markdownText = insights.map(insight => 
        `### ${insight.title}\n${insight.description}\n\n**Impact**: ${insight.impact || 'Unknown'}\n\n---`
      ).join('\n');
      
      widgets.push({
        title: `${type.charAt(0).toUpperCase() + type.slice(1)} Insights`,
        configuration: {
          markdown: { text: markdownText }
        },
        layout: { column: 1, row: currentY + 1, width: 12, height: 4 }
      });
      
      currentY += 4;
      
      // Add related queries if available
      insights.forEach((insight, index) => {
        if (insight.query) {
          widgets.push({
            title: `${insight.title} - Analysis`,
            configuration: {
              line: {
                queries: [{
                  query: insight.query,
                  accountId: this.config.accountId
                }]
              }
            },
            layout: { 
              column: (index % 2) * 6 + 1, 
              row: currentY + 1, 
              width: 6, 
              height: 3 
            }
          });
          
          if (index % 2 === 1) currentY += 3;
        }
      });
    });
    
    return {
      name: 'Insights',
      description: 'Key insights discovered from data analysis',
      widgets
    };
  }
  
  createRelationshipsPage(discoveries) {
    const widgets = [];
    let currentY = 0;
    
    discoveries.relationships.forEach((relationship, index) => {
      widgets.push({
        title: `${relationship.source} → ${relationship.target}`,
        configuration: {
          markdown: {
            text: `### Relationship: ${relationship.type}\n\n**Confidence**: ${relationship.confidence}%\n\n${relationship.description || ''}`
          }
        },
        layout: { 
          column: 1, 
          row: currentY + 1, 
          width: 4, 
          height: 2 
        }
      });
      
      if (relationship.query) {
        widgets.push({
          title: `${relationship.source} & ${relationship.target} Correlation`,
          configuration: {
            line: {
              queries: [{
                query: relationship.query,
                accountId: this.config.accountId
              }]
            }
          },
          layout: { 
            column: 5, 
            row: currentY + 1, 
            width: 8, 
            height: 3 
          }
        });
      }
      
      currentY += 3;
    });
    
    return {
      name: 'Relationships',
      description: 'Discovered relationships between data sources',
      widgets
    };
  }
  
  generateSummaryMarkdown(discoveries) {
    const stats = [];
    
    stats.push('## Discovery Summary\n');
    stats.push(`**Account ID**: ${discoveries.accountId || 'Unknown'}`);
    stats.push(`**Discovery Date**: ${new Date().toISOString()}`);
    stats.push(`**Event Types**: ${discoveries.eventTypes?.length || 0}`);
    stats.push(`**Total Attributes**: ${discoveries.eventTypes?.reduce((sum, et) => 
      sum + Object.keys(et.attributes || {}).length, 0) || 0}`);
    stats.push(`**Metrics Discovered**: ${discoveries.metrics?.reduce((sum, g) => 
      sum + g.totalMetrics, 0) || 0}`);
    
    if (discoveries.traces?.statistics) {
      stats.push(`**Services**: ${discoveries.traces.statistics.serviceCount || 0}`);
      stats.push(`**Traces**: ${discoveries.traces.statistics.traceCount || 0}`);
    }
    
    if (discoveries.logs?.statistics) {
      stats.push(`**Log Events**: ${discoveries.logs.statistics.logCount || 0}`);
    }
    
    stats.push(`\n**Insights Generated**: ${discoveries.insights?.length || 0}`);
    stats.push(`**Relationships Found**: ${discoveries.relationships?.length || 0}`);
    
    return stats.join('\n');
  }
  
  /**
   * Deploy dashboard using the DashBuilder system
   * @param {Object} dashboardConfig - Dashboard configuration
   * @returns {Object} Deployment result
   */
  async deployDashboard(dashboardConfig) {
    if (!this.dashboardGenerator) {
      throw new Error('Dashboard Generator not available. Please ensure DashBuilder is properly installed.');
    }
    
    try {
      logger.info('Deploying dashboard using DashBuilder');
      
      // Use the dashboard generator to create and deploy
      const result = await this.dashboardGenerator.createDashboard(dashboardConfig);
      
      logger.info('Dashboard deployed successfully', { 
        dashboardId: result.dashboardId,
        url: result.url 
      });
      
      return result;
      
    } catch (error) {
      logger.error('Failed to deploy dashboard', error);
      throw error;
    }
  }
  
  /**
   * Export dashboard configuration to file
   * @param {Object} dashboardConfig - Dashboard configuration
   * @param {string} outputPath - Output file path
   */
  async exportDashboard(dashboardConfig, outputPath) {
    try {
      const outputDir = path.dirname(outputPath);
      fs.mkdirSync(outputDir, { recursive: true });
      
      fs.writeFileSync(
        outputPath, 
        JSON.stringify(dashboardConfig, null, 2)
      );
      
      logger.info(`Dashboard configuration exported to ${outputPath}`);
      
      // Also create a template file that can be used with dashgen CLI
      const templatePath = outputPath.replace('.json', '-template.json');
      const template = {
        name: dashboardConfig.name,
        description: dashboardConfig.description,
        template: 'discovery',
        config: dashboardConfig
      };
      
      fs.writeFileSync(
        templatePath,
        JSON.stringify(template, null, 2)
      );
      
      logger.info(`Dashboard template exported to ${templatePath}`);
      
    } catch (error) {
      logger.error('Failed to export dashboard', error);
      throw error;
    }
  }
}

module.exports = DashboardIntegration;