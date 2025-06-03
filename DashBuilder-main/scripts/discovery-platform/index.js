#!/usr/bin/env node

/**
 * New Relic Discovery Platform
 * A comprehensive, production-ready framework for discovering and analyzing
 * all data points in a New Relic account
 */

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');
const pLimit = require('p-limit');
const { NerdGraphClient } = require('../src/core/api-client.js');
const NerdGraphQueryExecutor = require('./lib/nerdgraph-query-executor');
const DiscoveryEngine = require('./lib/discovery-engine');
const QueryOptimizer = require('./lib/query-optimizer');
const DataAnalyzer = require('./lib/data-analyzer');
const DashboardBuilder = require('./lib/dashboard-builder');
const DashboardIntegration = require('./lib/dashboard-integration');
const ProgressManager = require('./lib/progress-manager');
const RateLimiter = require('./lib/rate-limiter');
const { logger } = require('./lib/logger');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../..', '.env') });

class DiscoveryPlatform extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      apiKey: config.apiKey || process.env.NEW_RELIC_API_KEY || process.env.UKEY,
      accountId: config.accountId || process.env.NEW_RELIC_ACCOUNT_ID || process.env.ACC,
      region: config.region || process.env.NEW_RELIC_REGION || 'US',
      
      // Discovery options
      maxConcurrentQueries: config.maxConcurrentQueries || 10,
      queriesPerMinute: config.queriesPerMinute || 2500, // Stay under 3000 limit
      queryTimeout: config.queryTimeout || 30000, // 30 seconds
      retryAttempts: config.retryAttempts || 3,
      
      // Sampling options
      sampleSize: config.sampleSize || 1000,
      highVolumeThreshold: config.highVolumeThreshold || 1000000,
      
      // Processing options
      maxAttributesPerEventType: config.maxAttributesPerEventType || 100,
      maxEventTypesToProcess: config.maxEventTypesToProcess || 50,
      parallelBatchSize: config.parallelBatchSize || 5,
      
      // Dashboard options
      maxWidgetsPerPage: config.maxWidgetsPerPage || 12,
      maxPagesPerDashboard: config.maxPagesPerDashboard || 10,
      
      // Cache options
      enableCache: config.enableCache !== false,
      cacheSize: config.cacheSize || 1000,
      cacheTTL: config.cacheTTL || 300000, // 5 minutes
      
      // Progress options
      saveProgress: config.saveProgress !== false,
      progressFile: config.progressFile || `discovery-progress-${config.accountId || process.env.NEW_RELIC_ACCOUNT_ID || process.env.ACC || 'unknown'}.json`,
      checkpointInterval: config.checkpointInterval || 60000, // 1 minute
      
      // Feature flags
      discoverMetrics: config.discoverMetrics !== false,
      discoverTraces: config.discoverTraces !== false,
      discoverLogs: config.discoverLogs !== false,
      discoverCustomEvents: config.discoverCustomEvents !== false,
      discoverSyntheticData: config.discoverSyntheticData !== false,
      analyzeRelationships: config.analyzeRelationships !== false,
      generateDashboard: config.generateDashboard !== false,
      exportResults: config.exportResults !== false
    };
    
    // Initialize components
    this.client = new NerdGraphClient({
      apiKey: this.config.apiKey,
      region: this.config.region
    });
    
    // Initialize NerdGraph Query Executor for long-running queries
    this.queryExecutor = new NerdGraphQueryExecutor({
      client: this.client,
      config: this.config
    });
    
    // Set up query executor event handlers
    this.queryExecutor.on('dataPlusDetected', (dataPlus) => {
      logger.info('Data Plus capabilities detected', dataPlus);
      this.emit('dataPlusDetected', dataPlus);
    });
    
    this.queryExecutor.on('queryError', (errorInfo) => {
      logger.warn('Query error', errorInfo);
    });
    
    this.queryExecutor.on('costThresholdExceeded', (costInfo) => {
      logger.warn('Cost threshold exceeded', costInfo);
      this.emit('costWarning', costInfo);
    });
    
    this.rateLimiter = new RateLimiter({
      queriesPerMinute: this.config.queriesPerMinute,
      maxConcurrent: this.config.maxConcurrentQueries
    });
    
    this.progressManager = new ProgressManager({
      filePath: this.config.progressFile,
      checkpointInterval: this.config.checkpointInterval
    });
    
    this.discoveryEngine = new DiscoveryEngine({
      client: this.client,
      queryExecutor: this.queryExecutor,
      rateLimiter: this.rateLimiter,
      config: this.config
    });
    
    this.queryOptimizer = new QueryOptimizer({
      config: this.config
    });
    
    this.dataAnalyzer = new DataAnalyzer({
      config: this.config
    });
    
    this.dashboardBuilder = new DashboardBuilder({
      client: this.client,
      config: this.config
    });
    
    this.dashboardIntegration = new DashboardIntegration({
      ...this.config,
      accountId: this.config.accountId
    });
    
    // State
    this.state = {
      status: 'idle',
      startTime: null,
      discoveries: {
        summary: {},
        eventTypes: [],
        metrics: [],
        traces: [],
        logs: [],
        customEvents: [],
        relationships: [],
        attributes: {},
        queries: [],
        insights: []
      },
      statistics: {
        queriesExecuted: 0,
        queriesFailed: 0,
        cacheHits: 0,
        dataPointsDiscovered: 0,
        processingTime: 0
      }
    };
    
    // Set up event handlers
    this.setupEventHandlers();
  }
  
  setupEventHandlers() {
    // Progress events
    this.progressManager.on('checkpoint', (data) => {
      logger.info('Progress checkpoint saved', { 
        discovered: data.discoveries.eventTypes.length,
        queries: data.statistics.queriesExecuted 
      });
    });
    
    // Discovery events
    this.discoveryEngine.on('eventTypeDiscovered', (eventType) => {
      this.emit('discovery', { type: 'eventType', data: eventType });
    });
    
    this.discoveryEngine.on('metricDiscovered', (metric) => {
      this.emit('discovery', { type: 'metric', data: metric });
    });
    
    this.discoveryEngine.on('error', (error) => {
      logger.error('Discovery error', error);
      this.emit('error', error);
    });
    
    // Rate limiter events
    this.rateLimiter.on('rateLimitReached', () => {
      logger.warn('Rate limit reached, pausing queries');
      this.emit('rateLimitReached');
    });
    
    // Graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }
  
  async discover() {
    try {
      this.state.status = 'running';
      this.state.startTime = Date.now();
      
      logger.info('Starting comprehensive data discovery', {
        accountId: this.config.accountId,
        region: this.config.region
      });
      
      // Try to resume from previous progress
      const resumed = await this.progressManager.load();
      if (resumed) {
        this.state = resumed;
        logger.info('Resumed from previous progress', {
          eventTypes: this.state.discoveries.eventTypes.length,
          queries: this.state.statistics.queriesExecuted
        });
      }
      
      // Start progress saving
      this.progressManager.startAutoSave(this.state);
      
      // Phase 1: Discover all data sources
      await this.discoverDataSources();
      
      // Phase 2: Analyze discovered data
      await this.analyzeDiscoveredData();
      
      // Phase 3: Generate insights and relationships
      await this.generateInsights();
      
      // Phase 4: Create comprehensive dashboard
      if (this.config.generateDashboard) {
        await this.createDashboard();
      }
      
      // Phase 5: Export results
      if (this.config.exportResults) {
        await this.exportResults();
      }
      
      this.state.status = 'completed';
      this.state.statistics.processingTime = Date.now() - this.state.startTime;
      
      logger.info('Discovery completed successfully', this.state.statistics);
      
      return this.state.discoveries;
      
    } catch (error) {
      this.state.status = 'failed';
      logger.error('Discovery failed', error);
      throw error;
    } finally {
      await this.progressManager.save(this.state);
      this.progressManager.stopAutoSave();
    }
  }
  
  async discoverDataSources() {
    logger.info('Phase 1: Discovering data sources');
    
    // Discover event types with intelligent prioritization
    await this.discoverEventTypes();
    
    // Discover metrics if enabled
    if (this.config.discoverMetrics) {
      await this.discoverMetrics();
    }
    
    // Discover traces if enabled
    if (this.config.discoverTraces) {
      await this.discoverTraces();
    }
    
    // Discover logs if enabled
    if (this.config.discoverLogs) {
      await this.discoverLogs();
    }
    
    // Discover custom events if enabled
    if (this.config.discoverCustomEvents) {
      await this.discoverCustomEvents();
    }
    
    // Discover synthetic monitoring data if enabled
    if (this.config.discoverSyntheticData) {
      await this.discoverSyntheticData();
    }
  }
  
  async discoverEventTypes() {
    logger.info('Discovering event types...');
    
    try {
      // Get all event types with volume information
      const volumeQuery = `
        SELECT count(*) 
        FROM Transaction, SystemSample, ProcessSample, NetworkSample, 
             ContainerSample, ApplicationSample, BrowserInteraction, 
             PageView, SyntheticCheck, SyntheticRequest, 
             KafkaBrokerSample, KafkaTopicSample, QueueSample,
             InfrastructureEvent, K8sNodeSample, K8sPodSample,
             LoadBalancerSample, Lambda, Span, Log, Metric
        FACET eventType() 
        SINCE 1 day ago 
        LIMIT MAX
      `;
      
      const volumeResult = await this.executeQuery(volumeQuery);
      
      if (volumeResult?.results) {
        const eventTypeVolumes = volumeResult.results
          .map(r => ({
            eventType: r.facet[0],
            volume: r['count'],
            priority: this.calculatePriority(r.facet[0], r['count'])
          }))
          .sort((a, b) => b.priority - a.priority);
        
        // Process event types based on priority
        for (const { eventType, volume } of eventTypeVolumes.slice(0, this.config.maxEventTypesToProcess)) {
          await this.processEventType(eventType, volume);
        }
      }
      
      // Also discover event types not in the standard list
      const allEventTypesQuery = 'SHOW EVENT TYPES SINCE 1 day ago';
      const allEventTypes = await this.executeQuery(allEventTypesQuery);
      
      if (allEventTypes?.results) {
        const discoveredTypes = new Set(this.state.discoveries.eventTypes.map(e => e.name));
        const additionalTypes = allEventTypes.results
          .map(r => r.eventType)
          .filter(e => !discoveredTypes.has(e) && this.shouldProcessEventType(e));
        
        for (const eventType of additionalTypes.slice(0, 10)) {
          await this.processEventType(eventType, 0);
        }
      }
      
    } catch (error) {
      logger.error('Error discovering event types', error);
      this.emit('error', { phase: 'eventTypeDiscovery', error });
    }
  }
  
  async processEventType(eventType, volume) {
    logger.info(`Processing event type: ${eventType}`, { volume });
    
    try {
      const eventData = {
        name: eventType,
        volume,
        attributes: {},
        sampleData: [],
        metadata: {}
      };
      
      // Get attributes with intelligent sampling
      const samplingStrategy = this.queryOptimizer.getSamplingStrategy(volume);
      const attributesQuery = `
        SELECT keyset() 
        FROM ${eventType} 
        ${samplingStrategy.timeWindow}
        ${samplingStrategy.limit}
      `;
      
      const attributesResult = await this.executeQuery(attributesQuery);
      
      if (attributesResult?.results?.[0]) {
        const attributes = Object.keys(attributesResult.results[0])
          .filter(attr => attr !== 'keyset')
          .slice(0, this.config.maxAttributesPerEventType);
        
        // Classify attributes in parallel batches
        eventData.attributes = await this.classifyAttributesBatch(eventType, attributes);
        
        // Get sample data
        eventData.sampleData = await this.discoveryEngine.getSampleData(eventType, attributes.slice(0, 10));
        
        // Get metadata
        eventData.metadata = await this.discoveryEngine.getEventTypeMetadata(eventType);
      }
      
      this.state.discoveries.eventTypes.push(eventData);
      this.state.statistics.dataPointsDiscovered += Object.keys(eventData.attributes).length;
      
      this.emit('eventTypeProcessed', eventData);
      
    } catch (error) {
      logger.error(`Error processing event type ${eventType}`, error);
    }
  }
  
  async classifyAttributesBatch(eventType, attributes) {
    const classified = {};
    const batchSize = this.config.parallelBatchSize;
    
    for (let i = 0; i < attributes.length; i += batchSize) {
      const batch = attributes.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(attr => this.classifyAttribute(eventType, attr))
      );
      
      results.forEach((result, index) => {
        if (result) {
          classified[batch[index]] = result;
        }
      });
    }
    
    return classified;
  }
  
  async classifyAttribute(eventType, attribute) {
    try {
      // Try numeric classification first
      const numericQuery = `
        SELECT 
          average(${attribute}) as avg,
          min(${attribute}) as min,
          max(${attribute}) as max,
          stddev(${attribute}) as stddev,
          uniqueCount(${attribute}) as cardinality
        FROM ${eventType} 
        WHERE ${attribute} IS NOT NULL 
        SINCE 1 hour ago
      `;
      
      const numericResult = await this.executeQuery(numericQuery, { 
        timeout: 10000,
        cache: true 
      });
      
      if (numericResult?.results?.[0]?.avg !== null) {
        return {
          type: 'numeric',
          dataType: this.inferNumericType(numericResult.results[0]),
          statistics: numericResult.results[0],
          nullable: false
        };
      }
      
      // Try string classification
      const stringQuery = `
        SELECT 
          uniqueCount(${attribute}) as cardinality,
          latest(${attribute}) as sample
        FROM ${eventType} 
        WHERE ${attribute} IS NOT NULL 
        SINCE 1 hour ago
      `;
      
      const stringResult = await this.executeQuery(stringQuery, { 
        timeout: 10000,
        cache: true 
      });
      
      if (stringResult?.results?.[0]) {
        // Get sample values for low cardinality attributes
        let sampleValues = [];
        if (stringResult.results[0].cardinality < 100) {
          const samplesQuery = `
            SELECT uniques(${attribute}, 20) 
            FROM ${eventType} 
            WHERE ${attribute} IS NOT NULL 
            SINCE 1 hour ago
          `;
          const samplesResult = await this.executeQuery(samplesQuery, { cache: true });
          sampleValues = samplesResult?.results?.[0]?.[`uniques.${attribute}`] || [];
        }
        
        return {
          type: 'string',
          dataType: this.inferStringType(attribute, sampleValues),
          cardinality: stringResult.results[0].cardinality,
          sampleValues: sampleValues.slice(0, 10),
          nullable: false
        };
      }
      
      // Check if boolean
      const boolQuery = `
        SELECT uniqueCount(${attribute}) 
        FROM ${eventType} 
        WHERE ${attribute} IN (true, false) 
        SINCE 1 hour ago
      `;
      
      const boolResult = await this.executeQuery(boolQuery, { cache: true });
      
      if (boolResult?.results?.[0]?.['uniqueCount']) {
        return {
          type: 'boolean',
          dataType: 'boolean',
          nullable: false
        };
      }
      
      return null;
      
    } catch (error) {
      logger.debug(`Failed to classify attribute ${attribute}`, error.message);
      return null;
    }
  }
  
  async discoverMetrics() {
    logger.info('Discovering metrics...');
    
    try {
      // Get all metric names with intelligent batching
      const metricQueries = [
        'SELECT uniques(metricName, 1000) FROM Metric WHERE metricName LIKE \'%kafka%\' SINCE 1 hour ago',
        'SELECT uniques(metricName, 1000) FROM Metric WHERE metricName LIKE \'%queue%\' SINCE 1 hour ago',
        'SELECT uniques(metricName, 1000) FROM Metric WHERE metricName LIKE \'%system%\' SINCE 1 hour ago',
        'SELECT uniques(metricName, 1000) FROM Metric WHERE metricName LIKE \'%application%\' SINCE 1 hour ago',
        'SELECT uniques(metricName, 1000) FROM Metric WHERE metricName NOT LIKE \'%kafka%\' AND metricName NOT LIKE \'%queue%\' AND metricName NOT LIKE \'%system%\' AND metricName NOT LIKE \'%application%\' SINCE 1 hour ago LIMIT 1000'
      ];
      
      const metricResults = await Promise.all(
        metricQueries.map(q => this.executeQuery(q, { cache: true }))
      );
      
      const allMetrics = new Set();
      metricResults.forEach(result => {
        if (result?.results?.[0]) {
          const metrics = result.results[0]['uniques.metricName'] || [];
          metrics.forEach(m => allMetrics.add(m));
        }
      });
      
      // Group and analyze metrics
      const metricGroups = this.groupMetrics(Array.from(allMetrics));
      
      for (const [group, metrics] of Object.entries(metricGroups)) {
        const groupData = {
          name: group,
          metrics: [],
          statistics: {}
        };
        
        // Analyze a sample of metrics from each group
        const sampleMetrics = metrics.slice(0, 10);
        for (const metric of sampleMetrics) {
          const metricData = await this.analyzeMetric(metric);
          if (metricData) {
            groupData.metrics.push(metricData);
          }
        }
        
        groupData.statistics = {
          totalMetrics: metrics.length,
          analyzedMetrics: groupData.metrics.length
        };
        
        this.state.discoveries.metrics.push(groupData);
      }
      
    } catch (error) {
      logger.error('Error discovering metrics', error);
    }
  }
  
  async analyzeMetric(metricName) {
    try {
      const analysisQuery = `
        SELECT 
          average(value) as avg,
          min(value) as min,
          max(value) as max,
          stddev(value) as stddev,
          latest(value) as latest,
          rate(sum(value), 1 minute) as rate,
          uniqueCount(entity.guid) as entities
        FROM Metric 
        WHERE metricName = '${metricName}' 
        SINCE 1 hour ago
      `;
      
      const result = await this.executeQuery(analysisQuery, { 
        timeout: 15000,
        cache: true 
      });
      
      if (result?.results?.[0]) {
        const dimensions = await this.getMetricDimensions(metricName);
        
        return {
          name: metricName,
          statistics: result.results[0],
          dimensions,
          type: this.classifyMetricType(metricName, result.results[0])
        };
      }
      
    } catch (error) {
      logger.debug(`Failed to analyze metric ${metricName}`, error.message);
    }
    
    return null;
  }
  
  async getMetricDimensions(metricName) {
    try {
      const dimensionsQuery = `
        SELECT keyset() 
        FROM Metric 
        WHERE metricName = '${metricName}' 
        SINCE 1 hour ago 
        LIMIT 1
      `;
      
      const result = await this.executeQuery(dimensionsQuery, { cache: true });
      
      if (result?.results?.[0]) {
        return Object.keys(result.results[0])
          .filter(key => !['metricName', 'value', 'timestamp', 'keyset'].includes(key));
      }
      
    } catch (error) {
      logger.debug(`Failed to get dimensions for metric ${metricName}`, error.message);
    }
    
    return [];
  }
  
  async discoverTraces() {
    logger.info('Discovering distributed traces...');
    
    try {
      const traceQuery = `
        SELECT 
          count(*) as spanCount,
          uniqueCount(trace.id) as traceCount,
          uniqueCount(service.name) as serviceCount,
          average(duration) as avgDuration,
          percentile(duration, 95) as p95Duration
        FROM Span 
        SINCE 1 hour ago
      `;
      
      const result = await this.executeQuery(traceQuery);
      
      if (result?.results?.[0]) {
        const traceData = {
          statistics: result.results[0],
          services: await this.discoveryEngine.discoverServices(),
          operations: await this.discoveryEngine.discoverOperations(),
          errorPatterns: await this.discoveryEngine.discoverErrorPatterns()
        };
        
        this.state.discoveries.traces = traceData;
      }
      
    } catch (error) {
      logger.error('Error discovering traces', error);
    }
  }
  
  async discoverLogs() {
    logger.info('Discovering log data...');
    
    try {
      const logQuery = `
        SELECT 
          count(*) as logCount,
          uniqueCount(service) as serviceCount,
          uniqueCount(hostname) as hostCount,
          uniqueCount(level) as levelCount
        FROM Log 
        SINCE 1 hour ago
      `;
      
      const result = await this.executeQuery(logQuery);
      
      if (result?.results?.[0]) {
        const logData = {
          statistics: result.results[0],
          levels: await this.discoveryEngine.getLogLevels(),
          sources: await this.discoveryEngine.getLogSources(),
          patterns: await this.discoveryEngine.discoverLogPatterns()
        };
        
        this.state.discoveries.logs = logData;
      }
      
    } catch (error) {
      logger.error('Error discovering logs', error);
    }
  }
  
  async discoverSyntheticData() {
    logger.info('Discovering synthetic monitoring data...');
    
    try {
      const syntheticData = await this.discoveryEngine.discoverSyntheticData();
      
      if (syntheticData) {
        this.state.discoveries.synthetic = syntheticData;
      }
      
    } catch (error) {
      logger.error('Error discovering synthetic data', error);
    }
  }
  
  async analyzeDiscoveredData() {
    logger.info('Phase 2: Analyzing discovered data');
    
    // Analyze data quality
    const dataQuality = await this.dataAnalyzer.analyzeDataQuality(this.state.discoveries);
    
    // Find data relationships
    if (this.config.analyzeRelationships) {
      const relationships = await this.dataAnalyzer.findRelationships(this.state.discoveries);
      this.state.discoveries.relationships = relationships;
    }
    
    // Generate intelligent queries based on discoveries
    const queries = await this.queryOptimizer.generateQueries(this.state.discoveries);
    this.state.discoveries.queries = queries;
    
    // Add data quality insights
    this.state.discoveries.insights.push(...dataQuality.insights);
  }
  
  async generateInsights() {
    logger.info('Phase 3: Generating insights');
    
    const insights = await this.dataAnalyzer.generateInsights(this.state.discoveries);
    this.state.discoveries.insights.push(...insights);
    
    // Generate recommendations
    const recommendations = await this.dataAnalyzer.generateRecommendations(this.state.discoveries);
    this.state.discoveries.recommendations = recommendations;
  }
  
  async createDashboard() {
    logger.info('Phase 4: Creating comprehensive dashboard');
    
    try {
      // First generate dashboard config using the integration module
      const dashboardConfig = await this.dashboardIntegration.generateDashboardConfig({
        ...this.state.discoveries,
        accountId: this.config.accountId
      });
      
      // Export the dashboard config for future use
      const exportPath = path.join(
        __dirname, 
        '../..', 
        'generated-dashboards',
        `discovery-${this.config.accountId}-${Date.now()}.json`
      );
      await this.dashboardIntegration.exportDashboard(dashboardConfig, exportPath);
      
      // Try to deploy using the integration module (which uses DashBuilder)
      try {
        const deployResult = await this.dashboardIntegration.deployDashboard(dashboardConfig);
        
        if (deployResult) {
          this.state.discoveries.dashboardUrl = deployResult.url;
          this.state.discoveries.dashboardId = deployResult.dashboardId;
          logger.info('Dashboard created via DashBuilder integration', { 
            url: deployResult.url,
            exportPath 
          });
          return;
        }
      } catch (integrationError) {
        logger.warn('DashBuilder integration not available, falling back to direct creation', integrationError.message);
      }
      
      // Fallback to original dashboard builder
      const dashboard = await this.dashboardBuilder.build(this.state.discoveries);
      
      if (dashboard) {
        this.state.discoveries.dashboardUrl = dashboard.url;
        logger.info('Dashboard created successfully via fallback', { url: dashboard.url });
      }
      
    } catch (error) {
      logger.error('Error creating dashboard', error);
    }
  }
  
  async exportResults() {
    logger.info('Phase 5: Exporting results');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportDir = `discovery-export-${this.config.accountId}-${timestamp}`;
    
    fs.mkdirSync(exportDir, { recursive: true });
    
    // Export full discovery data
    fs.writeFileSync(
      path.join(exportDir, 'discovery-complete.json'),
      JSON.stringify(this.state.discoveries, null, 2)
    );
    
    // Export summary report
    const summary = this.generateSummaryReport();
    fs.writeFileSync(
      path.join(exportDir, 'discovery-summary.md'),
      summary
    );
    
    // Export queries
    const queries = this.state.discoveries.queries.map(q => ({
      title: q.title,
      query: q.query,
      description: q.description
    }));
    fs.writeFileSync(
      path.join(exportDir, 'generated-queries.json'),
      JSON.stringify(queries, null, 2)
    );
    
    // Export dashboard configuration
    if (this.state.discoveries.dashboard) {
      fs.writeFileSync(
        path.join(exportDir, 'dashboard-config.json'),
        JSON.stringify(this.state.discoveries.dashboard, null, 2)
      );
    }
    
    logger.info(`Results exported to ${exportDir}`);
  }
  
  generateSummaryReport() {
    const report = [];
    
    report.push('# New Relic Data Discovery Report');
    report.push(`\nAccount ID: ${this.config.accountId}`);
    report.push(`Discovery Date: ${new Date().toISOString()}`);
    report.push(`Processing Time: ${(this.state.statistics.processingTime / 1000).toFixed(1)}s`);
    
    report.push('\n## Summary Statistics');
    report.push(`- Event Types Discovered: ${this.state.discoveries.eventTypes.length}`);
    report.push(`- Metrics Discovered: ${this.state.discoveries.metrics.reduce((sum, g) => sum + g.metrics.length, 0)}`);
    report.push(`- Total Attributes: ${this.state.statistics.dataPointsDiscovered}`);
    report.push(`- Queries Executed: ${this.state.statistics.queriesExecuted}`);
    report.push(`- Cache Hit Rate: ${((this.state.statistics.cacheHits / this.state.statistics.queriesExecuted) * 100).toFixed(1)}%`);
    
    report.push('\n## Top Event Types by Volume');
    this.state.discoveries.eventTypes
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10)
      .forEach((et, i) => {
        report.push(`${i + 1}. ${et.name}: ${et.volume.toLocaleString()} events`);
      });
    
    report.push('\n## Key Insights');
    this.state.discoveries.insights.slice(0, 10).forEach((insight, i) => {
      report.push(`${i + 1}. ${insight.title}: ${insight.description}`);
    });
    
    report.push('\n## Recommendations');
    if (this.state.discoveries.recommendations) {
      this.state.discoveries.recommendations.forEach((rec, i) => {
        report.push(`${i + 1}. **${rec.title}**: ${rec.description}`);
      });
    }
    
    return report.join('\n');
  }
  
  async executeQuery(query, options = {}) {
    const cacheKey = `${query}-${JSON.stringify(options)}`;
    
    // Initialize cache if not exists
    if (!this.queryCache && this.config.enableCache) {
      const { LRUCache } = require('lru-cache');
      this.queryCache = new LRUCache({ 
        max: this.config.cacheSize,
        ttl: this.config.cacheTTL
      });
    }
    
    // Check cache
    if (this.config.enableCache && options.cache) {
      const cached = this.queryCache?.get(cacheKey);
      if (cached) {
        this.state.statistics.cacheHits++;
        return cached;
      }
    }
    
    try {
      this.state.statistics.queriesExecuted++;
      
      // Use rate limiter with NerdGraph Query Executor
      const result = await this.rateLimiter.execute(async () => {
        // Use the NerdGraphQueryExecutor for intelligent query routing
        const executorResult = await this.queryExecutor.executeQuery(query, {
          timeout: options.timeout || this.config.queryTimeout,
          forceNerdGraph: options.forceNerdGraph,
          async: options.async,
          accountId: this.config.accountId
        });
        
        // Convert executor result to expected format
        return {
          results: executorResult.results,
          metadata: executorResult.metadata,
          performanceStats: executorResult.performanceStats,
          totalCount: executorResult.totalCount
        };
      });
      
      // Cache successful results
      if (this.config.enableCache && options.cache && result) {
        this.queryCache.set(cacheKey, result);
      }
      
      // Track query execution statistics
      if (result.executionMethod) {
        this.state.statistics[`queries_${result.executionMethod}`] = 
          (this.state.statistics[`queries_${result.executionMethod}`] || 0) + 1;
      }
      
      return result;
      
    } catch (error) {
      this.state.statistics.queriesFailed++;
      
      // The NerdGraphQueryExecutor already handles retries intelligently
      // But we can still apply time window optimization if needed
      if (options.optimizeOnFailure !== false && error.message.includes('timeout')) {
        logger.warn(`Query failed, trying with optimized time window: ${query}`);
        const optimizedQuery = this.queryOptimizer.optimizeTimeWindow(query);
        if (optimizedQuery !== query) {
          return this.executeQuery(optimizedQuery, { 
            ...options, 
            optimizeOnFailure: false 
          });
        }
      }
      
      throw error;
    }
  }
  
  // Helper methods
  calculatePriority(eventType, volume) {
    // Prioritize Kafka and queue-related event types
    const priorityTypes = [
      'QueueSample', 'KafkaBrokerSample', 'KafkaTopicSample',
      'Transaction', 'SystemSample', 'Metric', 'Log', 'Span'
    ];
    
    let priority = volume;
    if (priorityTypes.includes(eventType)) {
      priority *= 10;
    }
    if (eventType.toLowerCase().includes('kafka') || eventType.toLowerCase().includes('queue')) {
      priority *= 5;
    }
    
    return priority;
  }
  
  shouldProcessEventType(eventType) {
    // Skip internal New Relic events unless specifically needed
    const skipPatterns = [
      /^Nr(?!dbQuery|Consumption|AuditEvent)/,  // Skip most Nr* events
      /Test$/,
      /Example$/,
      /Demo$/
    ];
    
    return !skipPatterns.some(pattern => pattern.test(eventType));
  }
  
  groupMetrics(metrics) {
    const groups = {};
    
    metrics.forEach(metric => {
      // Intelligent grouping by prefix and pattern
      let group = 'other';
      
      if (metric.includes('kafka')) group = 'kafka';
      else if (metric.includes('queue')) group = 'queue';
      else if (metric.includes('system')) group = 'system';
      else if (metric.includes('container')) group = 'container';
      else if (metric.includes('aws')) group = 'aws';
      else if (metric.includes('gcp')) group = 'gcp';
      else if (metric.includes('azure')) group = 'azure';
      else {
        const prefix = metric.split(/[._]/)[0];
        if (prefix.length > 2) group = prefix;
      }
      
      if (!groups[group]) groups[group] = [];
      groups[group].push(metric);
    });
    
    return groups;
  }
  
  inferNumericType(stats) {
    if (stats.avg === Math.floor(stats.avg) && 
        stats.min === Math.floor(stats.min) && 
        stats.max === Math.floor(stats.max)) {
      return 'integer';
    }
    return 'float';
  }
  
  inferStringType(attribute, sampleValues) {
    const lowerAttr = attribute.toLowerCase();
    
    // Check for specific patterns
    if (lowerAttr.includes('id') || lowerAttr.includes('guid')) return 'identifier';
    if (lowerAttr.includes('name')) return 'name';
    if (lowerAttr.includes('url') || lowerAttr.includes('uri')) return 'url';
    if (lowerAttr.includes('email')) return 'email';
    if (lowerAttr.includes('ip')) return 'ip_address';
    if (lowerAttr.includes('timestamp') || lowerAttr.includes('time')) return 'timestamp';
    if (lowerAttr.includes('date')) return 'date';
    if (lowerAttr.includes('status') || lowerAttr.includes('state')) return 'enum';
    if (lowerAttr.includes('type') || lowerAttr.includes('kind')) return 'enum';
    
    // Check sample values
    if (sampleValues.length > 0) {
      if (sampleValues.every(v => /^\d{4}-\d{2}-\d{2}/.test(v))) return 'timestamp';
      if (sampleValues.every(v => /^[a-f0-9-]{36}$/i.test(v))) return 'uuid';
      if (sampleValues.every(v => /^\d+\.\d+\.\d+\.\d+$/.test(v))) return 'ip_address';
    }
    
    return 'string';
  }
  
  classifyMetricType(metricName, stats) {
    const name = metricName.toLowerCase();
    
    if (name.includes('percent') || name.includes('ratio')) return 'percentage';
    if (name.includes('bytes')) return 'bytes';
    if (name.includes('count')) return 'counter';
    if (name.includes('rate')) return 'rate';
    if (name.includes('duration') || name.includes('time')) return 'duration';
    if (name.includes('gauge')) return 'gauge';
    
    // Check if it's a counter based on behavior
    if (stats.min >= 0 && stats.rate > 0) return 'counter';
    
    return 'gauge';
  }
  
  async shutdown() {
    logger.info('Shutting down discovery platform...');
    
    this.state.status = 'stopped';
    await this.progressManager.save(this.state);
    
    process.exit(0);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];
    
    if (value === 'true') options[key] = true;
    else if (value === 'false') options[key] = false;
    else if (!isNaN(value)) options[key] = parseInt(value);
    else options[key] = value;
  }
  
  // Validate configuration
  if (!options.apiKey && !process.env.NEW_RELIC_API_KEY && !process.env.UKEY) {
    console.error('❌ Missing API key. Set NEW_RELIC_API_KEY or UKEY in environment or use --apiKey');
    process.exit(1);
  }
  
  if (!options.accountId && !process.env.NEW_RELIC_ACCOUNT_ID && !process.env.ACC) {
    console.error('❌ Missing account ID. Set NEW_RELIC_ACCOUNT_ID or ACC in environment or use --accountId');
    process.exit(1);
  }
  
  // Create and run discovery platform
  const platform = new DiscoveryPlatform(options);
  
  platform.on('discovery', ({ type, data }) => {
    logger.info(`Discovered ${type}:`, data.name || data);
  });
  
  platform.on('error', (error) => {
    logger.error('Discovery error:', error);
  });
  
  try {
    await platform.discover();
    console.log('\n✅ Discovery completed successfully!');
  } catch (error) {
    console.error('\n❌ Discovery failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = DiscoveryPlatform;