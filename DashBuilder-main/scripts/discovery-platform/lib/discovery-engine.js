const { EventEmitter } = require('events');
const { logger } = require('./logger');

class DiscoveryEngine extends EventEmitter {
  constructor({ client, queryExecutor, rateLimiter, config }) {
    super();
    this.client = client;
    this.queryExecutor = queryExecutor;
    this.rateLimiter = rateLimiter;
    this.config = config;
  }
  
  async discoverServices() {
    try {
      const servicesQuery = `
        SELECT uniqueCount(service.name) as count, uniques(service.name, 100) as services
        FROM Transaction, Span, Log
        WHERE service.name IS NOT NULL
        SINCE 1 day ago
      `;
      
      // Use queryExecutor for potentially large service discovery
      const result = await this.executeQuery(servicesQuery);
      
      if (result?.results?.[0]) {
        const services = result.results[0].services || [];
        
        // Get details for each service
        const serviceDetails = await Promise.all(
          services.slice(0, 20).map(service => this.getServiceDetails(service))
        );
        
        return serviceDetails.filter(s => s !== null);
      }
      
    } catch (error) {
      logger.error('Error discovering services', error);
    }
    
    return [];
  }
  
  async getServiceDetails(serviceName) {
    try {
      const detailsQuery = `
        SELECT 
          count(*) as transactions,
          average(duration) as avgDuration,
          percentage(count(*), WHERE error IS true) as errorRate,
          uniqueCount(name) as endpoints
        FROM Transaction 
        WHERE service.name = '${serviceName}' 
        SINCE 1 hour ago
      `;
      
      const result = await this.executeQuery(detailsQuery);
      
      if (result?.results?.[0]) {
        return {
          name: serviceName,
          ...result.results[0]
        };
      }
      
    } catch (error) {
      logger.debug(`Failed to get details for service ${serviceName}`, error.message);
    }
    
    return null;
  }
  
  async discoverOperations() {
    try {
      const operationsQuery = `
        SELECT count(*), average(duration) 
        FROM Span 
        FACET name 
        SINCE 1 hour ago 
        LIMIT 50
      `;
      
      const result = await this.executeQuery(operationsQuery);
      
      if (result?.results) {
        return result.results.map(r => ({
          name: r.facet[0],
          count: r['count'],
          avgDuration: r['average.duration']
        }));
      }
      
    } catch (error) {
      logger.error('Error discovering operations', error);
    }
    
    return [];
  }
  
  async discoverErrorPatterns() {
    try {
      const errorQuery = `
        SELECT count(*), latest(error.message) 
        FROM Transaction, Span 
        WHERE error IS true 
        FACET error.class 
        SINCE 1 hour ago 
        LIMIT 20
      `;
      
      // Use queryExecutor for potentially large error pattern discovery
      const result = await this.executeQuery(errorQuery);
      
      if (result?.results) {
        return result.results.map(r => ({
          errorClass: r.facet[0],
          count: r['count'],
          latestMessage: r['latest.error.message']
        }));
      }
      
    } catch (error) {
      logger.error('Error discovering error patterns', error);
    }
    
    return [];
  }
  
  async getLogLevels() {
    try {
      const levelsQuery = `
        SELECT count(*) 
        FROM Log 
        FACET level 
        SINCE 1 hour ago
      `;
      
      const result = await this.executeQuery(levelsQuery);
      
      if (result?.results) {
        return result.results.map(r => ({
          level: r.facet[0],
          count: r['count']
        }));
      }
      
    } catch (error) {
      logger.error('Error getting log levels', error);
    }
    
    return [];
  }
  
  async getLogSources() {
    try {
      const sourcesQuery = `
        SELECT count(*) 
        FROM Log 
        FACET service, hostname 
        SINCE 1 hour ago 
        LIMIT 50
      `;
      
      const result = await this.executeQuery(sourcesQuery);
      
      if (result?.results) {
        return result.results.map(r => ({
          service: r.facet[0],
          hostname: r.facet[1],
          count: r['count']
        }));
      }
      
    } catch (error) {
      logger.error('Error getting log sources', error);
    }
    
    return [];
  }
  
  async discoverLogPatterns() {
    try {
      const patternsQuery = `
        SELECT count(*) 
        FROM Log 
        WHERE message IS NOT NULL
        FACET cases(
          WHERE message LIKE '%error%' AS 'errors',
          WHERE message LIKE '%warn%' AS 'warnings',
          WHERE message LIKE '%exception%' AS 'exceptions',
          WHERE message LIKE '%failed%' AS 'failures'
        )
        SINCE 1 hour ago
      `;
      
      // Use queryExecutor for complex log pattern analysis
      const result = await this.executeQuery(patternsQuery, { forceNerdGraph: true });
      
      if (result?.results) {
        return result.results.map(r => ({
          pattern: r.facet[0],
          count: r['count']
        }));
      }
      
    } catch (error) {
      logger.error('Error discovering log patterns', error);
    }
    
    return [];
  }
  
  async discoverSyntheticData() {
    try {
      const syntheticQuery = `
        SELECT 
          count(*) as checks,
          uniqueCount(monitorName) as monitors,
          percentage(count(*), WHERE result = 'FAILED') as failureRate,
          average(duration) as avgDuration
        FROM SyntheticCheck 
        SINCE 1 day ago
      `;
      
      const result = await this.executeQuery(syntheticQuery);
      
      if (result?.results?.[0]) {
        const monitors = await this.getSyntheticMonitors();
        
        return {
          summary: result.results[0],
          monitors
        };
      }
      
    } catch (error) {
      logger.error('Error discovering synthetic data', error);
    }
    
    return null;
  }
  
  async getSyntheticMonitors() {
    try {
      const monitorsQuery = `
        SELECT 
          latest(result),
          average(duration),
          percentage(count(*), WHERE result = 'FAILED') as failureRate
        FROM SyntheticCheck 
        FACET monitorName 
        SINCE 1 day ago 
        LIMIT 20
      `;
      
      const result = await this.executeQuery(monitorsQuery);
      
      if (result?.results) {
        return result.results.map(r => ({
          name: r.facet[0],
          latestResult: r['latest.result'],
          avgDuration: r['average.duration'],
          failureRate: r['percentage']
        }));
      }
      
    } catch (error) {
      logger.error('Error getting synthetic monitors', error);
    }
    
    return [];
  }
  
  async getSampleData(eventType, attributes) {
    try {
      const selectClause = attributes.map(attr => `${attr}`).join(', ');
      const sampleQuery = `
        SELECT ${selectClause} 
        FROM ${eventType} 
        SINCE 1 hour ago 
        LIMIT 10
      `;
      
      const result = await this.executeQuery(sampleQuery);
      return result?.results || [];
      
    } catch (error) {
      logger.debug(`Failed to get sample data for ${eventType}`, error.message);
      return [];
    }
  }
  
  async getEventTypeMetadata(eventType) {
    try {
      const metadataQueries = [
        `SELECT uniqueCount(entity.guid) FROM ${eventType} SINCE 1 hour ago`,
        `SELECT uniqueCount(host) FROM ${eventType} WHERE host IS NOT NULL SINCE 1 hour ago`,
        `SELECT earliest(timestamp), latest(timestamp) FROM ${eventType} SINCE 7 days ago`
      ];
      
      const results = await Promise.all(
        metadataQueries.map(q => 
          this.executeQuery(q).catch(() => null)
        )
      );
      
      const metadata = {};
      
      if (results[0]?.results?.[0]) {
        metadata.entityCount = results[0].results[0]['uniqueCount.entity.guid'] || 0;
      }
      
      if (results[1]?.results?.[0]) {
        metadata.hostCount = results[1].results[0]['uniqueCount.host'] || 0;
      }
      
      if (results[2]?.results?.[0]) {
        metadata.dataRange = {
          earliest: results[2].results[0]['earliest.timestamp'],
          latest: results[2].results[0]['latest.timestamp']
        };
      }
      
      return metadata;
      
    } catch (error) {
      logger.debug(`Failed to get metadata for ${eventType}`, error.message);
      return {};
    }
  }
  
  /**
   * Execute a query using the NerdGraph Query Executor for intelligent routing
   * Falls back to direct client if queryExecutor is not available
   */
  async executeQuery(query, options = {}) {
    try {
      // Use queryExecutor if available for intelligent query routing
      if (this.queryExecutor) {
        const result = await this.queryExecutor.executeQuery(query, {
          ...options,
          accountId: this.config.accountId
        });
        
        // Return in expected format
        return {
          results: result.results,
          metadata: result.metadata,
          performanceStats: result.performanceStats,
          totalCount: result.totalCount
        };
      }
      
      // Fallback to direct client
      return await this.client.nrql(this.config.accountId, query);
      
    } catch (error) {
      logger.error(`Query execution failed: ${query}`, error);
      throw error;
    }
  }
}

module.exports = DiscoveryEngine;