/**
 * DashboardBuilder - Unified dashboard creation with intelligent features
 * 
 * Consolidates the best patterns from multiple implementations:
 * - Intelligent metric discovery and query generation
 * - Template-based quick creation
 * - Process-aware optimization (NRDOT v2)
 * - Advanced layout optimization
 * - Comprehensive validation
 */

const Joi = require('joi');
const QueryBuilder = require('./QueryBuilder');
const MetricDiscovery = require('./MetricDiscovery');
const LayoutOptimizer = require('./LayoutOptimizer');
const { dashboardSchema } = require('../utils/validators');
const logger = require('../utils/logger');
const rateLimiter = require('../utils/rateLimiter');

class DashboardBuilder {
  constructor(config = {}) {
    this.config = this.validateConfig(config);
    this.queryBuilder = new QueryBuilder(config);
    this.metricDiscovery = new MetricDiscovery(config);
    this.layoutOptimizer = new LayoutOptimizer();
    this.widgets = [];
    this.metadata = {
      createdAt: new Date().toISOString(),
      version: '2.0.0',
      builder: 'DashBuilder-Unified'
    };
  }

  /**
   * Validate configuration
   */
  validateConfig(config) {
    const schema = Joi.object({
      accountId: Joi.number().required(),
      apiKey: Joi.string().required(),
      profile: Joi.string().valid('basic', 'advanced', 'process-aware', 'nrdot-v2').default('basic'),
      template: Joi.string().optional(),
      concurrent: Joi.number().min(1).max(50).default(25),
      retryAttempts: Joi.number().min(0).max(5).default(3),
      options: Joi.object().default({})
    });

    const { error, value } = schema.validate(config);
    if (error) {
      throw new Error(`Invalid configuration: ${error.message}`);
    }
    return value;
  }

  /**
   * Main method to build a dashboard with intelligent features
   */
  async build(options = {}) {
    try {
      logger.info('Starting dashboard build process', { profile: this.config.profile });

      // Step 1: Discover metrics intelligently
      const metrics = await this.discoverMetrics(options);
      
      // Step 2: Generate optimized queries
      const queries = await this.generateQueries(metrics, options);
      
      // Step 3: Create widgets
      const widgets = await this.createWidgets(queries, options);
      
      // Step 4: Optimize layout
      const optimizedLayout = await this.optimizeLayout(widgets);
      
      // Step 5: Build final dashboard
      const dashboard = this.assembleDashboard(optimizedLayout, options);
      
      // Step 6: Validate
      await this.validateDashboard(dashboard);
      
      logger.info('Dashboard build completed successfully');
      return dashboard;
      
    } catch (error) {
      logger.error('Dashboard build failed', error);
      throw error;
    }
  }

  /**
   * Quick dashboard creation using templates
   */
  async createFromTemplate(templateName, overrides = {}) {
    const templates = {
      'kafka-monitoring': require('../templates/kafka-monitoring'),
      'process-health': require('../templates/process-health'),
      'system-overview': require('../templates/system-overview'),
      'custom-metrics': require('../templates/custom-metrics')
    };

    const template = templates[templateName];
    if (!template) {
      throw new Error(`Template "${templateName}" not found`);
    }

    const dashboardConfig = { ...template, ...overrides };
    return this.build(dashboardConfig);
  }

  /**
   * Discover metrics with intelligence
   */
  async discoverMetrics(options) {
    const discoveryOptions = {
      ...options,
      profile: this.config.profile,
      intelligent: options.intelligent !== false,
      qualityThreshold: options.qualityThreshold || 0.6
    };

    const metrics = await this.metricDiscovery.discover(discoveryOptions);
    
    // Apply quality filtering and classification
    if (discoveryOptions.intelligent) {
      return this.metricDiscovery.analyzeAndClassify(metrics);
    }
    
    return metrics;
  }

  /**
   * Generate queries with multiple strategies
   */
  async generateQueries(metrics, options) {
    const strategies = this.determineQueryStrategies(options);
    const queries = [];

    for (const strategy of strategies) {
      const strategyQueries = await this.queryBuilder.generateWithStrategy(
        metrics,
        strategy,
        options
      );
      queries.push(...strategyQueries);
    }

    // Validate and optimize queries
    return this.validateAndOptimizeQueries(queries);
  }

  /**
   * Determine which query strategies to use
   */
  determineQueryStrategies(options) {
    const strategies = ['basic'];

    if (this.config.profile === 'advanced' || this.config.profile === 'process-aware') {
      strategies.push('predictive', 'anomaly', 'comparative');
    }

    if (this.config.profile === 'nrdot-v2') {
      strategies.push('process-intelligence', 'cost-aware');
    }

    return options.strategies || strategies;
  }

  /**
   * Create widgets from queries
   */
  async createWidgets(queries, options) {
    const widgets = [];
    const widgetDefaults = {
      height: 3,
      width: 4,
      vizType: 'line'
    };

    for (const query of queries) {
      const widget = {
        ...widgetDefaults,
        ...this.selectOptimalVisualization(query),
        title: this.generateIntelligentTitle(query),
        configuration: {
          nrql: query.nrql,
          ...this.getAdvancedConfiguration(query)
        }
      };

      widgets.push(widget);
    }

    return widgets;
  }

  /**
   * Select optimal visualization based on query characteristics
   */
  selectOptimalVisualization(query) {
    const { resultType, timeRange, facets } = query.metadata || {};
    
    if (resultType === 'single-value') {
      return { vizType: 'billboard', height: 2, width: 3 };
    }
    
    if (facets && facets.length > 0) {
      if (facets.length > 10) {
        return { vizType: 'bar', height: 4, width: 6 };
      }
      return { vizType: 'pie', height: 3, width: 4 };
    }
    
    if (timeRange && timeRange.includes('TIMESERIES')) {
      return { vizType: 'line', height: 3, width: 6 };
    }
    
    return { vizType: 'table', height: 4, width: 6 };
  }

  /**
   * Generate intelligent widget titles
   */
  generateIntelligentTitle(query) {
    if (query.title) return query.title;
    
    const { metric, aggregation, filters } = query.metadata || {};
    const parts = [];
    
    if (aggregation) parts.push(aggregation);
    if (metric) parts.push(metric);
    if (filters && filters.length > 0) {
      parts.push(`(${filters.join(', ')})`);
    }
    
    return parts.join(' ') || 'Metric Analysis';
  }

  /**
   * Get advanced configuration for widgets
   */
  getAdvancedConfiguration(query) {
    const config = {};
    
    if (query.metadata.includeThresholds) {
      config.thresholds = [
        { value: query.metadata.warningThreshold, severity: 'warning' },
        { value: query.metadata.criticalThreshold, severity: 'critical' }
      ];
    }
    
    if (query.metadata.includeConfidenceBands) {
      config.confidenceBands = {
        enabled: true,
        level: 0.95
      };
    }
    
    return config;
  }

  /**
   * Optimize layout using LayoutOptimizer
   */
  async optimizeLayout(widgets) {
    return this.layoutOptimizer.optimize(widgets, {
      strategy: this.config.profile === 'basic' ? 'grid' : 'intelligent',
      maxColumns: 12,
      groupRelated: true,
      priorityPlacement: true
    });
  }

  /**
   * Assemble final dashboard
   */
  assembleDashboard(layout, options) {
    const dashboard = {
      name: options.name || `Dashboard - ${new Date().toISOString()}`,
      description: options.description || 'Generated by DashBuilder',
      permissions: options.permissions || 'PUBLIC_READ_WRITE',
      pages: [{
        name: options.pageName || 'Main',
        widgets: layout
      }],
      metadata: {
        ...this.metadata,
        profile: this.config.profile,
        metricsCount: layout.length,
        optimizationApplied: true
      }
    };

    // Add variables if specified
    if (options.variables) {
      dashboard.variables = options.variables;
    }

    return dashboard;
  }

  /**
   * Validate dashboard comprehensively
   */
  async validateDashboard(dashboard) {
    // Schema validation
    const { error } = dashboardSchema.validate(dashboard);
    if (error) {
      throw new Error(`Dashboard validation failed: ${error.message}`);
    }

    // Semantic validation
    await this.validateSemantics(dashboard);

    // Performance validation for advanced profiles
    if (this.config.profile !== 'basic') {
      await this.validatePerformance(dashboard);
    }

    return true;
  }

  /**
   * Semantic validation
   */
  async validateSemantics(dashboard) {
    const issues = [];

    // Check for duplicate widget titles
    const titles = new Set();
    dashboard.pages.forEach(page => {
      page.widgets.forEach(widget => {
        if (titles.has(widget.title)) {
          issues.push(`Duplicate widget title: ${widget.title}`);
        }
        titles.add(widget.title);
      });
    });

    // Check for empty queries
    dashboard.pages.forEach(page => {
      page.widgets.forEach(widget => {
        if (!widget.configuration.nrql || widget.configuration.nrql.trim() === '') {
          issues.push(`Empty query in widget: ${widget.title}`);
        }
      });
    });

    if (issues.length > 0) {
      logger.warn('Semantic validation issues found', { issues });
    }

    return issues.length === 0;
  }

  /**
   * Validate and optimize queries
   */
  async validateAndOptimizeQueries(queries) {
    const optimized = [];

    for (const query of queries) {
      try {
        // Validate query syntax
        await this.queryBuilder.validate(query.nrql);
        
        // Optimize if needed
        const optimizedQuery = await this.queryBuilder.optimize(query);
        optimized.push(optimizedQuery);
        
      } catch (error) {
        logger.warn(`Query validation failed, skipping: ${error.message}`);
      }
    }

    return optimized;
  }

  /**
   * Performance validation
   */
  async validatePerformance(dashboard) {
    const totalQueries = dashboard.pages.reduce(
      (sum, page) => sum + page.widgets.length,
      0
    );

    if (totalQueries > 50) {
      logger.warn('Dashboard has many queries, may impact performance', { totalQueries });
    }

    // Estimate query costs if in cost-aware mode
    if (this.config.profile === 'nrdot-v2') {
      const estimatedCost = await this.estimateQueryCosts(dashboard);
      dashboard.metadata.estimatedMonthlyCost = estimatedCost;
    }

    return true;
  }

  /**
   * Estimate query costs for NRDOT v2 profile
   */
  async estimateQueryCosts(dashboard) {
    // Simplified cost estimation
    const baseQueryCost = 0.001; // $ per query execution
    const executionsPerDay = 24 * 60 / 5; // Every 5 minutes
    const totalQueries = dashboard.pages.reduce(
      (sum, page) => sum + page.widgets.length,
      0
    );

    return (totalQueries * baseQueryCost * executionsPerDay * 30).toFixed(2);
  }

  /**
   * Deploy dashboard to New Relic
   */
  async deploy(dashboard) {
    const nerdGraphClient = require('../services/NerdGraphClient');
    return nerdGraphClient.createDashboard(this.config.accountId, dashboard);
  }

  /**
   * Preview dashboard as HTML
   */
  generatePreview(dashboard) {
    // Implementation from dashboard-orchestrator
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${dashboard.name} - Preview</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .widget { border: 1px solid #ccc; padding: 10px; margin: 10px 0; }
          .widget-title { font-weight: bold; margin-bottom: 5px; }
          .widget-query { font-family: monospace; background: #f5f5f5; padding: 5px; }
        </style>
      </head>
      <body>
        <h1>${dashboard.name}</h1>
        <p>${dashboard.description}</p>
        ${dashboard.pages.map(page => `
          <h2>${page.name}</h2>
          ${page.widgets.map(widget => `
            <div class="widget">
              <div class="widget-title">${widget.title}</div>
              <div class="widget-query">${widget.configuration.nrql}</div>
              <div>Type: ${widget.vizType} | Size: ${widget.width}x${widget.height}</div>
            </div>
          `).join('')}
        `).join('')}
      </body>
      </html>
    `;
    return html;
  }
}

module.exports = DashboardBuilder;