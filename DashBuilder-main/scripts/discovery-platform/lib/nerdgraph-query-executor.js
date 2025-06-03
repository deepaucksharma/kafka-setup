const { EventEmitter } = require('events');
const { logger } = require('./logger');

/**
 * NerdGraph Query Executor
 * Handles long-running queries, async patterns, and Data Plus detection
 * Leverages existing NerdGraph implementations from the project
 */
class NerdGraphQueryExecutor extends EventEmitter {
  constructor({ client, config }) {
    super();
    this.client = client;
    this.config = config;
    
    // Query execution state
    this.activeQueries = new Map();
    this.queryHistory = [];
    
    // Data Plus detection state
    this.dataPlus = {
      detected: false,
      tested: false,
      capabilities: {
        maxQueryDuration: 60000, // Default 1 minute
        asyncQueries: false,
        extendedLimits: false
      }
    };
    
    // Cost tracking
    this.costTracker = {
      totalCost: 0,
      costByEventType: new Map(),
      warningThreshold: 100, // $100 warning threshold
      criticalThreshold: 500 // $500 critical threshold
    };
    
    // Initialize volume cache
    const { LRUCache } = require('lru-cache');
    this.volumeCache = new LRUCache({
      max: 100,
      ttl: 300000 // 5 minutes
    });
  }
  
  /**
   * Execute a query with intelligent routing between standard and NerdGraph
   */
  async executeQuery(query, options = {}) {
    const queryId = this.generateQueryId();
    const startTime = Date.now();
    
    try {
      // Detect and test Data Plus capabilities if not done
      if (!this.dataPlus.tested) {
        await this.detectDataPlusCapabilities();
      }
      
      // Estimate query complexity and cost
      const estimation = await this.estimateQueryCost(query, options);
      
      // Choose execution strategy based on estimation
      let result;
      if (estimation.requiresNerdGraph || options.forceNerdGraph) {
        result = await this.executeNerdGraphQuery(query, options, estimation);
      } else if (estimation.requiresAsync || options.async) {
        result = await this.executeAsyncQuery(query, options, estimation);
      } else {
        result = await this.executeStandardQuery(query, options, estimation);
      }
      
      // Track query history and costs
      this.trackQueryExecution(queryId, query, result, estimation, Date.now() - startTime);
      
      return result;
      
    } catch (error) {
      // Advanced error classification
      const classifiedError = this.classifyError(error);
      
      // Emit error event with classification
      this.emit('queryError', {
        queryId,
        query,
        error: classifiedError,
        duration: Date.now() - startTime
      });
      
      // Handle based on error type
      return this.handleClassifiedError(query, options, classifiedError);
    }
  }
  
  /**
   * Detect Data Plus capabilities by testing query limits
   */
  async detectDataPlusCapabilities() {
    logger.info('Detecting Data Plus capabilities...');
    
    try {
      // Test 1: Try a 2-minute query (only works with Data Plus)
      const testQuery = `
        SELECT count(*) 
        FROM Transaction 
        WHERE timestamp > ${Date.now() - 180000} 
        AND timestamp < ${Date.now() - 120000}
      `;
      
      const result = await this.client.query(`
        {
          actor {
            account(id: ${this.config.accountId}) {
              nrql(query: "${testQuery}", timeout: 120) {
                results
                metadata {
                  timeWindow {
                    begin
                    end
                  }
                  messages
                  facets
                  eventTypes
                  query
                  rawQuery
                }
              }
            }
          }
        }
      `);
      
      if (result?.data?.actor?.account?.nrql) {
        this.dataPlus.detected = true;
        this.dataPlus.capabilities.maxQueryDuration = 120000; // 2 minutes
        
        // Test 2: Check for async query support
        await this.testAsyncQuerySupport();
        
        // Test 3: Check for extended result limits
        await this.testExtendedLimits();
      }
      
    } catch (error) {
      logger.warn('Data Plus not detected, using standard limits', error.message);
    }
    
    this.dataPlus.tested = true;
    
    this.emit('dataPlusDetected', this.dataPlus);
    logger.info('Data Plus detection complete', this.dataPlus);
  }
  
  /**
   * Test async query support
   */
  async testAsyncQuerySupport() {
    try {
      const testQuery = `
        mutation {
          nrqlQueryProgress(
            accountId: ${this.config.accountId},
            query: "SELECT count(*) FROM Transaction SINCE 1 hour ago",
            async: true
          ) {
            queryId
            status
            message
          }
        }
      `;
      
      const result = await this.client.query(testQuery);
      
      if (result?.data?.nrqlQueryProgress?.queryId) {
        this.dataPlus.capabilities.asyncQueries = true;
      }
      
    } catch (error) {
      // Async queries not supported
      logger.debug('Async queries not supported', error.message);
    }
  }
  
  /**
   * Test extended result limits
   */
  async testExtendedLimits() {
    try {
      const testQuery = `
        {
          actor {
            account(id: ${this.config.accountId}) {
              nrql(query: "SELECT count(*) FROM Transaction SINCE 1 hour ago LIMIT 5000") {
                results
              }
            }
          }
        }
      `;
      
      const result = await this.client.query(testQuery);
      
      if (result?.data?.actor?.account?.nrql) {
        this.dataPlus.capabilities.extendedLimits = true;
      }
      
    } catch (error) {
      // Extended limits not supported
      logger.debug('Extended limits not supported', error.message);
    }
  }
  
  /**
   * Execute a NerdGraph query for long-running operations
   */
  async executeNerdGraphQuery(query, options, estimation) {
    const timeout = Math.min(
      options.timeout || estimation.estimatedDuration || 60000,
      this.dataPlus.detected ? 600000 : 60000 // 10 minutes with Data Plus, 1 minute without
    );
    
    logger.info('Executing NerdGraph query', { query, timeout, estimation });
    
    const gql = `
      {
        actor {
          account(id: ${this.config.accountId}) {
            nrql(
              query: "${query.replace(/"/g, '\\"')}", 
              timeout: ${Math.floor(timeout / 1000)}
            ) {
              results
              totalCount
              metadata {
                timeWindow {
                  begin
                  end
                }
                messages
                facets
                eventTypes
                query
                rawQuery
              }
              performanceStats {
                inspectedCount
                matchCount
                wallClockTime
                ioTime
                cpuTime
                queueTime
                otherTime
              }
            }
          }
        }
      }
    `;
    
    const result = await this.client.query(gql);
    
    if (result?.errors) {
      throw new Error(`NerdGraph query failed: ${JSON.stringify(result.errors)}`);
    }
    
    const nrqlResult = result?.data?.actor?.account?.nrql;
    
    if (!nrqlResult) {
      throw new Error('No results returned from NerdGraph query');
    }
    
    // Update cost tracking
    this.updateCostTracking(nrqlResult, estimation);
    
    return {
      results: nrqlResult.results,
      metadata: nrqlResult.metadata,
      performanceStats: nrqlResult.performanceStats,
      totalCount: nrqlResult.totalCount,
      executionMethod: 'nerdgraph',
      duration: nrqlResult.performanceStats?.wallClockTime
    };
  }
  
  /**
   * Execute an async query for large datasets
   */
  async executeAsyncQuery(query, options, estimation) {
    if (!this.dataPlus.capabilities.asyncQueries) {
      logger.warn('Async queries not supported, falling back to standard execution');
      return this.executeStandardQuery(query, options, estimation);
    }
    
    logger.info('Executing async query', { query, estimation });
    
    // Start async query
    const startMutation = `
      mutation {
        nrqlQueryProgress(
          accountId: ${this.config.accountId},
          query: "${query.replace(/"/g, '\\"')}",
          async: true
        ) {
          queryId
          status
          message
        }
      }
    `;
    
    const startResult = await this.client.query(startMutation);
    const queryId = startResult?.data?.nrqlQueryProgress?.queryId;
    
    if (!queryId) {
      throw new Error('Failed to start async query');
    }
    
    // Track active query
    this.activeQueries.set(queryId, {
      query,
      startTime: Date.now(),
      status: 'running'
    });
    
    // Poll for results
    const results = await this.pollAsyncQueryResults(queryId, options.pollTimeout || 300000);
    
    // Clean up
    this.activeQueries.delete(queryId);
    
    return {
      ...results,
      executionMethod: 'async',
      queryId
    };
  }
  
  /**
   * Poll for async query results
   */
  async pollAsyncQueryResults(queryId, timeout) {
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds
    
    while (Date.now() - startTime < timeout) {
      const statusQuery = `
        {
          actor {
            account(id: ${this.config.accountId}) {
              nrqlQueryProgress(queryId: "${queryId}") {
                status
                message
                results
                metadata {
                  eventTypes
                  facets
                  messages
                  query
                }
                performanceStats {
                  wallClockTime
                  inspectedCount
                }
              }
            }
          }
        }
      `;
      
      const result = await this.client.query(statusQuery);
      const progress = result?.data?.actor?.account?.nrqlQueryProgress;
      
      if (!progress) {
        throw new Error('Failed to get query progress');
      }
      
      // Update active query status
      if (this.activeQueries.has(queryId)) {
        this.activeQueries.get(queryId).status = progress.status;
      }
      
      // Check status
      if (progress.status === 'COMPLETE') {
        return {
          results: progress.results,
          metadata: progress.metadata,
          performanceStats: progress.performanceStats,
          status: 'complete'
        };
      } else if (progress.status === 'ERROR') {
        throw new Error(`Async query failed: ${progress.message}`);
      } else if (progress.status === 'TIMEOUT') {
        throw new Error('Async query timed out');
      }
      
      // Emit progress event
      this.emit('queryProgress', {
        queryId,
        status: progress.status,
        message: progress.message
      });
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    throw new Error('Async query polling timeout exceeded');
  }
  
  /**
   * Execute a standard NRQL query
   */
  async executeStandardQuery(query, options, estimation) {
    // Use the existing client with timeout handling
    const timeout = Math.min(
      options.timeout || estimation.estimatedDuration || 30000,
      this.dataPlus.detected ? 120000 : 60000
    );
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const result = await this.client.nrql(
        this.config.accountId,
        query,
        { signal: controller.signal }
      );
      
      return {
        ...result,
        executionMethod: 'standard',
        duration: Date.now() - (options.startTime || Date.now())
      };
      
    } finally {
      clearTimeout(timeoutId);
    }
  }
  
  /**
   * Estimate query cost and complexity
   */
  async estimateQueryCost(query, options) {
    const estimation = {
      query,
      complexity: 'low',
      estimatedDuration: 5000,
      estimatedCost: 0,
      estimatedDataPoints: 0,
      requiresNerdGraph: false,
      requiresAsync: false,
      warnings: [],
      recommendations: []
    };
    
    // Parse query to extract key components
    const queryLower = query.toLowerCase();
    
    // Extract event types
    const eventTypes = this.extractEventTypes(query);
    estimation.eventTypes = eventTypes;
    
    // Extract time range
    const timeRange = this.extractTimeRange(query);
    estimation.timeRange = timeRange;
    
    // Check for expensive operations
    if (queryLower.includes('facet') && queryLower.includes('timeseries')) {
      estimation.complexity = 'high';
      estimation.estimatedDuration *= 3;
    } else if (queryLower.includes('facet') || queryLower.includes('timeseries')) {
      estimation.complexity = 'medium';
      estimation.estimatedDuration *= 2;
    }
    
    // Check for wildcards
    if (queryLower.includes('like') && queryLower.includes('%')) {
      estimation.complexity = 'high';
      estimation.estimatedDuration *= 2;
      estimation.warnings.push('Wildcard queries can be expensive');
    }
    
    // Estimate data points based on event types and time range
    for (const eventType of eventTypes) {
      const volume = await this.estimateEventVolume(eventType, timeRange);
      estimation.estimatedDataPoints += volume;
    }
    
    // Calculate estimated cost (simplified model)
    estimation.estimatedCost = this.calculateQueryCost(
      estimation.estimatedDataPoints,
      estimation.complexity
    );
    
    // Determine execution method
    if (estimation.estimatedDuration > 60000) {
      estimation.requiresNerdGraph = true;
      estimation.recommendations.push('Use NerdGraph for queries over 1 minute');
    }
    
    if (estimation.estimatedDataPoints > 10000000) {
      estimation.requiresAsync = true;
      estimation.recommendations.push('Use async queries for large datasets');
    }
    
    // Add cost warnings
    if (estimation.estimatedCost > 10) {
      estimation.warnings.push(`High query cost estimated: $${estimation.estimatedCost.toFixed(2)}`);
    }
    
    return estimation;
  }
  
  /**
   * Extract event types from query
   */
  extractEventTypes(query) {
    const eventTypes = [];
    const fromMatch = query.match(/FROM\s+([^W\s]+(?:\s*,\s*[^W\s]+)*)/i);
    
    if (fromMatch) {
      const types = fromMatch[1].split(',').map(t => t.trim());
      eventTypes.push(...types);
    }
    
    return eventTypes;
  }
  
  /**
   * Extract time range from query
   */
  extractTimeRange(query) {
    const sinceMatch = query.match(/SINCE\s+(\d+)\s+(second|minute|hour|day|week|month)s?\s+ago/i);
    
    if (sinceMatch) {
      const value = parseInt(sinceMatch[1]);
      const unit = sinceMatch[2].toLowerCase();
      
      const multipliers = {
        second: 1000,
        minute: 60000,
        hour: 3600000,
        day: 86400000,
        week: 604800000,
        month: 2592000000
      };
      
      return {
        value,
        unit,
        milliseconds: value * (multipliers[unit] || 0)
      };
    }
    
    return { value: 1, unit: 'hour', milliseconds: 3600000 };
  }
  
  /**
   * Estimate event volume for cost calculation
   */
  async estimateEventVolume(eventType, timeRange) {
    try {
      // Use cached volume if available
      const cacheKey = `${eventType}-${timeRange.unit}-${timeRange.value}`;
      const cached = this.volumeCache?.get(cacheKey);
      if (cached) return cached;
      
      // Quick count query with sampling
      const countQuery = `
        SELECT count(*) 
        FROM ${eventType} 
        SINCE ${timeRange.value} ${timeRange.unit}s ago 
        WITH SAMPLING
      `;
      
      const result = await this.client.nrql(this.config.accountId, countQuery);
      const count = result?.results?.[0]?.count || 0;
      
      // Cache the result
      this.volumeCache?.set(cacheKey, count);
      
      return count;
      
    } catch (error) {
      // Default estimate if query fails
      return 100000;
    }
  }
  
  /**
   * Calculate query cost based on data points and complexity
   */
  calculateQueryCost(dataPoints, complexity) {
    // Simplified cost model (adjust based on actual pricing)
    const baseCostPerMillion = 0.25; // $0.25 per million data points
    const complexityMultipliers = {
      low: 1,
      medium: 1.5,
      high: 2.5
    };
    
    const cost = (dataPoints / 1000000) * baseCostPerMillion * complexityMultipliers[complexity];
    
    // Update cost tracking
    this.costTracker.totalCost += cost;
    
    // Check thresholds
    if (this.costTracker.totalCost > this.costTracker.criticalThreshold) {
      this.emit('costThresholdExceeded', {
        level: 'critical',
        totalCost: this.costTracker.totalCost,
        threshold: this.costTracker.criticalThreshold
      });
    } else if (this.costTracker.totalCost > this.costTracker.warningThreshold) {
      this.emit('costThresholdExceeded', {
        level: 'warning',
        totalCost: this.costTracker.totalCost,
        threshold: this.costTracker.warningThreshold
      });
    }
    
    return cost;
  }
  
  /**
   * Classify errors for intelligent handling
   */
  classifyError(error) {
    const classification = {
      type: 'unknown',
      category: 'general',
      retryable: false,
      suggestion: '',
      originalError: error
    };
    
    const errorMessage = error.message?.toLowerCase() || '';
    
    // Timeout errors
    if (errorMessage.includes('timeout') || errorMessage.includes('deadline exceeded')) {
      classification.type = 'timeout';
      classification.category = 'performance';
      classification.retryable = true;
      classification.suggestion = 'Reduce time range or use NerdGraph for longer queries';
    }
    // Rate limit errors
    else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
      classification.type = 'rate_limit';
      classification.category = 'throttling';
      classification.retryable = true;
      classification.suggestion = 'Reduce query frequency or implement backoff';
    }
    // Authentication errors
    else if (errorMessage.includes('unauthorized') || errorMessage.includes('401')) {
      classification.type = 'authentication';
      classification.category = 'security';
      classification.retryable = false;
      classification.suggestion = 'Check API key permissions';
    }
    // Query syntax errors
    else if (errorMessage.includes('syntax') || errorMessage.includes('parse')) {
      classification.type = 'syntax';
      classification.category = 'validation';
      classification.retryable = false;
      classification.suggestion = 'Check NRQL syntax';
    }
    // Data not found
    else if (errorMessage.includes('no data') || errorMessage.includes('not found')) {
      classification.type = 'no_data';
      classification.category = 'data';
      classification.retryable = false;
      classification.suggestion = 'Verify event type exists and has data';
    }
    // Network errors
    else if (errorMessage.includes('network') || errorMessage.includes('econnrefused')) {
      classification.type = 'network';
      classification.category = 'connectivity';
      classification.retryable = true;
      classification.suggestion = 'Check network connectivity';
    }
    
    return classification;
  }
  
  /**
   * Handle classified errors with appropriate strategies
   */
  async handleClassifiedError(query, options, classifiedError) {
    logger.warn('Handling classified error', {
      type: classifiedError.type,
      category: classifiedError.category,
      suggestion: classifiedError.suggestion
    });
    
    // Don't retry if not retryable or max retries reached
    if (!classifiedError.retryable || (options.retryCount || 0) >= 3) {
      throw classifiedError.originalError;
    }
    
    // Handle based on error type
    switch (classifiedError.type) {
      case 'timeout':
        // Retry with NerdGraph for longer execution
        return this.executeQuery(query, {
          ...options,
          forceNerdGraph: true,
          retryCount: (options.retryCount || 0) + 1
        });
        
      case 'rate_limit':
        // Wait and retry with backoff
        const backoffTime = Math.min(60000, 1000 * Math.pow(2, options.retryCount || 0));
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        return this.executeQuery(query, {
          ...options,
          retryCount: (options.retryCount || 0) + 1
        });
        
      case 'network':
        // Simple retry after brief wait
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.executeQuery(query, {
          ...options,
          retryCount: (options.retryCount || 0) + 1
        });
        
      default:
        throw classifiedError.originalError;
    }
  }
  
  /**
   * Update cost tracking after query execution
   */
  updateCostTracking(nrqlResult, estimation) {
    if (nrqlResult.performanceStats) {
      const actualDataPoints = nrqlResult.performanceStats.inspectedCount || 0;
      const actualCost = this.calculateQueryCost(actualDataPoints, estimation.complexity);
      
      // Update cost by event type
      estimation.eventTypes.forEach(eventType => {
        const current = this.costTracker.costByEventType.get(eventType) || 0;
        this.costTracker.costByEventType.set(eventType, current + actualCost / estimation.eventTypes.length);
      });
    }
  }
  
  /**
   * Track query execution for analysis
   */
  trackQueryExecution(queryId, query, result, estimation, duration) {
    const execution = {
      queryId,
      query,
      timestamp: Date.now(),
      duration,
      method: result.executionMethod,
      dataPoints: result.performanceStats?.inspectedCount || 0,
      estimatedCost: estimation.estimatedCost,
      complexity: estimation.complexity,
      success: true
    };
    
    this.queryHistory.push(execution);
    
    // Keep only last 1000 queries
    if (this.queryHistory.length > 1000) {
      this.queryHistory.shift();
    }
    
    // Emit execution event
    this.emit('queryExecuted', execution);
  }
  
  /**
   * Generate unique query ID
   */
  generateQueryId() {
    return `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Get execution statistics
   */
  getStatistics() {
    const stats = {
      totalQueries: this.queryHistory.length,
      activeQueries: this.activeQueries.size,
      totalCost: this.costTracker.totalCost,
      costByEventType: Object.fromEntries(this.costTracker.costByEventType),
      dataPlus: this.dataPlus,
      queryMethods: {},
      averageDuration: 0,
      errorRate: 0
    };
    
    // Calculate method distribution
    this.queryHistory.forEach(execution => {
      stats.queryMethods[execution.method] = (stats.queryMethods[execution.method] || 0) + 1;
      stats.averageDuration += execution.duration;
    });
    
    if (stats.totalQueries > 0) {
      stats.averageDuration /= stats.totalQueries;
    }
    
    return stats;
  }
  
  /**
   * Clear cost tracking
   */
  resetCostTracking() {
    this.costTracker.totalCost = 0;
    this.costTracker.costByEventType.clear();
    this.emit('costTrackingReset');
  }
  
  /**
   * Get cost tracking summary
   */
  getCostTracking() {
    const costByCategory = {};
    this.costTracker.costByEventType.forEach((cost, eventType) => {
      const category = this.getEventTypeCategory(eventType);
      costByCategory[category] = (costByCategory[category] || 0) + cost;
    });
    
    return {
      totalEstimatedCost: this.costTracker.totalCost,
      totalQueries: this.queryHistory.length,
      costByEventType: Object.fromEntries(this.costTracker.costByEventType),
      costByCategory,
      warningThreshold: this.costTracker.warningThreshold,
      criticalThreshold: this.costTracker.criticalThreshold
    };
  }
  
  /**
   * Get event type category for cost tracking
   */
  getEventTypeCategory(eventType) {
    if (eventType.toLowerCase().includes('kafka') || eventType === 'QueueSample') return 'Kafka';
    if (['Transaction', 'Span', 'TransactionError'].includes(eventType)) return 'APM';
    if (['SystemSample', 'ProcessSample', 'NetworkSample'].includes(eventType)) return 'Infrastructure';
    if (eventType === 'Log') return 'Logs';
    if (eventType === 'Metric') return 'Metrics';
    return 'Other';
  }
}

module.exports = NerdGraphQueryExecutor;