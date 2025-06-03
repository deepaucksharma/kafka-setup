const { logger } = require('./logger');

class QueryOptimizer {
  constructor({ config }) {
    this.config = config;
  }
  
  getSamplingStrategy(dataVolume) {
    // Determine optimal sampling based on data volume
    if (dataVolume > this.config.highVolumeThreshold) {
      return {
        timeWindow: 'SINCE 1 hour ago',
        limit: `LIMIT ${this.config.sampleSize}`,
        sampling: 'WITH SAMPLING'
      };
    } else if (dataVolume > 100000) {
      return {
        timeWindow: 'SINCE 6 hours ago',
        limit: `LIMIT ${Math.floor(this.config.sampleSize / 2)}`,
        sampling: ''
      };
    } else {
      return {
        timeWindow: 'SINCE 1 day ago',
        limit: 'LIMIT 1',
        sampling: ''
      };
    }
  }
  
  optimizeTimeWindow(query) {
    // Reduce time window for timeout queries
    const timeWindowMap = {
      'SINCE 7 days ago': 'SINCE 1 day ago',
      'SINCE 1 day ago': 'SINCE 6 hours ago',
      'SINCE 6 hours ago': 'SINCE 1 hour ago',
      'SINCE 1 hour ago': 'SINCE 30 minutes ago',
      'SINCE 30 minutes ago': 'SINCE 10 minutes ago'
    };
    
    let optimizedQuery = query;
    
    Object.entries(timeWindowMap).forEach(([from, to]) => {
      if (query.includes(from)) {
        optimizedQuery = query.replace(from, to);
      }
    });
    
    return optimizedQuery;
  }
  
  async generateQueries(discoveries) {
    const queries = [];
    
    // Generate overview queries
    queries.push(...this.generateOverviewQueries(discoveries));
    
    // Generate event type specific queries
    for (const eventType of discoveries.eventTypes) {
      queries.push(...this.generateEventTypeQueries(eventType));
    }
    
    // Generate metric queries
    if (discoveries.metrics.length > 0) {
      queries.push(...this.generateMetricQueries(discoveries.metrics));
    }
    
    // Generate relationship queries
    if (discoveries.relationships && discoveries.relationships.length > 0) {
      queries.push(...this.generateRelationshipQueries(discoveries.relationships));
    }
    
    // Generate specialized queries based on discovered patterns
    queries.push(...this.generateSpecializedQueries(discoveries));
    
    return queries;
  }
  
  generateOverviewQueries(discoveries) {
    const queries = [];
    
    // Data volume overview
    queries.push({
      title: 'Data Volume Overview',
      query: `SELECT count(*) FROM ${discoveries.eventTypes.slice(0, 10).map(e => e.name).join(', ')} FACET eventType() SINCE 1 day ago`,
      description: 'Shows the distribution of events across different types',
      category: 'overview',
      visualization: 'viz.pie'
    });
    
    // Timeline of all events
    queries.push({
      title: 'Event Timeline',
      query: `SELECT count(*) FROM ${discoveries.eventTypes.slice(0, 5).map(e => e.name).join(', ')} TIMESERIES 1 hour SINCE 1 day ago`,
      description: 'Shows the trend of events over time',
      category: 'overview',
      visualization: 'viz.line'
    });
    
    // Entity overview
    queries.push({
      title: 'Active Entities',
      query: `SELECT uniqueCount(entity.guid) FROM ${discoveries.eventTypes.filter(e => e.metadata.entityCount > 0).slice(0, 5).map(e => e.name).join(', ')} FACET entity.type SINCE 1 hour ago`,
      description: 'Shows the count of unique entities by type',
      category: 'overview',
      visualization: 'viz.bar'
    });
    
    return queries;
  }
  
  generateEventTypeQueries(eventType) {
    const queries = [];
    const attributes = eventType.attributes || {};
    
    // Volume and trend
    queries.push({
      title: `${eventType.name} Volume`,
      query: `SELECT count(*) FROM ${eventType.name} TIMESERIES AUTO SINCE 1 day ago`,
      description: `Shows the volume trend for ${eventType.name}`,
      category: eventType.name,
      visualization: 'viz.line'
    });
    
    // Top numeric attributes
    const numericAttrs = Object.entries(attributes)
      .filter(([_, info]) => info.type === 'numeric')
      .slice(0, 5);
    
    numericAttrs.forEach(([attr, info]) => {
      queries.push({
        title: `${eventType.name} - ${this.humanize(attr)}`,
        query: `SELECT average(${attr}), percentile(${attr}, 95), max(${attr}) FROM ${eventType.name} TIMESERIES AUTO SINCE 1 day ago`,
        description: `Statistical analysis of ${attr}`,
        category: eventType.name,
        visualization: 'viz.line'
      });
    });
    
    // Top string attributes for faceting
    const facetableAttrs = Object.entries(attributes)
      .filter(([attr, info]) => 
        info.type === 'string' && 
        info.cardinality < 100 &&
        this.isGoodFacet(attr)
      )
      .slice(0, 3);
    
    facetableAttrs.forEach(([attr, info]) => {
      queries.push({
        title: `${eventType.name} by ${this.humanize(attr)}`,
        query: `SELECT count(*) FROM ${eventType.name} FACET ${attr} SINCE 1 day ago LIMIT 10`,
        description: `Distribution by ${attr}`,
        category: eventType.name,
        visualization: 'viz.bar'
      });
    });
    
    // Special queries for known event types
    queries.push(...this.generateSpecialEventTypeQueries(eventType));
    
    return queries;
  }
  
  generateSpecialEventTypeQueries(eventType) {
    const queries = [];
    
    switch (eventType.name) {
      case 'Transaction':
        queries.push({
          title: 'Application Performance',
          query: 'SELECT average(duration), percentile(duration, 95), percentage(count(*), WHERE error IS true) as errorRate FROM Transaction TIMESERIES AUTO SINCE 1 day ago',
          description: 'Key performance metrics for transactions',
          category: 'Transaction',
          visualization: 'viz.line'
        });
        
        if (eventType.attributes['name']) {
          queries.push({
            title: 'Slowest Transactions',
            query: 'SELECT average(duration) FROM Transaction FACET name SINCE 1 hour ago LIMIT 10',
            description: 'Top 10 slowest transaction names',
            category: 'Transaction',
            visualization: 'viz.bar'
          });
        }
        break;
        
      case 'SystemSample':
        queries.push({
          title: 'System Resource Usage',
          query: 'SELECT average(cpuPercent) as "CPU %", average(memoryUsedPercent) as "Memory %", average(diskUsedPercent) as "Disk %" FROM SystemSample TIMESERIES AUTO SINCE 1 day ago',
          description: 'System resource utilization over time',
          category: 'SystemSample',
          visualization: 'viz.line'
        });
        break;
        
      case 'QueueSample':
        queries.push({
          title: 'Queue Health Overview',
          query: 'SELECT sum(queue.size) as "Total Backlog", max(oldest.message.age.seconds) as "Max Age (s)", rate(sum(messages.acknowledged), 1 minute) as "Processing Rate" FROM QueueSample WHERE provider = \'kafka\' TIMESERIES AUTO SINCE 1 day ago',
          description: 'Kafka Share Groups health metrics',
          category: 'QueueSample',
          visualization: 'viz.line'
        });
        
        queries.push({
          title: 'Share Groups by Backlog',
          query: 'SELECT latest(queue.size) FROM QueueSample WHERE provider = \'kafka\' FACET share.group.name SINCE 1 hour ago LIMIT 20',
          description: 'Current backlog by share group',
          category: 'QueueSample',
          visualization: 'viz.bar'
        });
        break;
        
      case 'KafkaBrokerSample':
        queries.push({
          title: 'Kafka Broker Performance',
          query: 'SELECT average(broker.bytesInPerSecond) as "Bytes In/sec", average(broker.bytesOutPerSecond) as "Bytes Out/sec", average(broker.messagesInPerSecond) as "Messages In/sec" FROM KafkaBrokerSample TIMESERIES AUTO SINCE 1 day ago',
          description: 'Kafka broker throughput metrics',
          category: 'KafkaBrokerSample',
          visualization: 'viz.line'
        });
        break;
        
      case 'Log':
        queries.push({
          title: 'Log Levels Distribution',
          query: 'SELECT count(*) FROM Log FACET level SINCE 1 hour ago',
          description: 'Distribution of log entries by level',
          category: 'Log',
          visualization: 'viz.pie'
        });
        
        queries.push({
          title: 'Error Log Trends',
          query: 'SELECT count(*) FROM Log WHERE level IN (\'ERROR\', \'FATAL\', \'CRITICAL\') TIMESERIES 10 minutes SINCE 1 day ago',
          description: 'Trend of error-level logs',
          category: 'Log',
          visualization: 'viz.line'
        });
        break;
        
      case 'Span':
        queries.push({
          title: 'Distributed Tracing Overview',
          query: 'SELECT count(*), average(duration), percentile(duration, 95) FROM Span FACET service.name SINCE 1 hour ago LIMIT 20',
          description: 'Service performance from distributed traces',
          category: 'Span',
          visualization: 'viz.table'
        });
        break;
    }
    
    return queries;
  }
  
  generateMetricQueries(metricGroups) {
    const queries = [];
    
    metricGroups.forEach(group => {
      if (group.metrics.length > 0) {
        // Overview for each metric group
        const topMetrics = group.metrics.slice(0, 5);
        
        queries.push({
          title: `${this.humanize(group.name)} Metrics Overview`,
          query: `SELECT average(value) FROM Metric WHERE metricName IN (${topMetrics.map(m => `'${m.name}'`).join(',')}) FACET metricName TIMESERIES AUTO SINCE 1 day ago`,
          description: `Key metrics for ${group.name}`,
          category: 'Metrics',
          visualization: 'viz.line'
        });
        
        // Individual metric queries for important ones
        topMetrics.forEach(metric => {
          if (this.isImportantMetric(metric.name)) {
            queries.push({
              title: this.humanize(metric.name),
              query: `SELECT average(value), min(value), max(value) FROM Metric WHERE metricName = '${metric.name}' TIMESERIES AUTO SINCE 1 day ago`,
              description: `Detailed view of ${metric.name}`,
              category: 'Metrics',
              visualization: 'viz.line'
            });
          }
        });
      }
    });
    
    return queries;
  }
  
  generateRelationshipQueries(relationships) {
    const queries = [];
    
    relationships.forEach(rel => {
      if (rel.type === 'entity-event') {
        queries.push({
          title: `${rel.from} to ${rel.to} Correlation`,
          query: `SELECT count(*) FROM ${rel.to} WHERE entity.guid IN (SELECT uniques(entity.guid, 100) FROM ${rel.from} WHERE ${rel.condition || 'true'} SINCE 1 hour ago) TIMESERIES AUTO SINCE 1 hour ago`,
          description: `Shows correlation between ${rel.from} and ${rel.to}`,
          category: 'Relationships',
          visualization: 'viz.line'
        });
      }
    });
    
    return queries;
  }
  
  generateSpecializedQueries(discoveries) {
    const queries = [];
    
    // Kafka-specific queries if Kafka data is discovered
    const hasKafkaData = discoveries.eventTypes.some(e => 
      e.name.toLowerCase().includes('kafka') || e.name === 'QueueSample'
    );
    
    if (hasKafkaData) {
      queries.push({
        title: 'Kafka Ecosystem Health',
        query: `
          SELECT 
            latest(broker.bytesInPerSecond) as 'Broker Throughput',
            sum(queue.size) as 'Total Unacked Messages',
            uniqueCount(share.group.name) as 'Active Share Groups'
          FROM KafkaBrokerSample, QueueSample 
          WHERE provider = 'kafka' 
          SINCE 5 minutes ago
        `,
        description: 'Combined view of Kafka broker and share group health',
        category: 'Specialized',
        visualization: 'viz.billboard'
      });
    }
    
    // APM queries if transaction data exists
    const hasAPMData = discoveries.eventTypes.some(e => 
      ['Transaction', 'Span', 'TransactionError'].includes(e.name)
    );
    
    if (hasAPMData) {
      queries.push({
        title: 'Application Golden Signals',
        query: `
          SELECT 
            rate(count(*), 1 minute) as 'Throughput',
            average(duration) as 'Latency',
            percentage(count(*), WHERE error IS true) as 'Error Rate'
          FROM Transaction 
          TIMESERIES AUTO 
          SINCE 1 hour ago
        `,
        description: 'Key application performance indicators',
        category: 'Specialized',
        visualization: 'viz.line'
      });
    }
    
    // Infrastructure queries
    const hasInfraData = discoveries.eventTypes.some(e => 
      ['SystemSample', 'ProcessSample', 'NetworkSample'].includes(e.name)
    );
    
    if (hasInfraData) {
      queries.push({
        title: 'Infrastructure Health Score',
        query: `
          SELECT 
            100 - average(cpuPercent) as 'CPU Available %',
            100 - average(memoryUsedPercent) as 'Memory Available %',
            100 - average(diskUsedPercent) as 'Disk Available %'
          FROM SystemSample 
          TIMESERIES AUTO 
          SINCE 1 hour ago
        `,
        description: 'Infrastructure resource availability',
        category: 'Specialized',
        visualization: 'viz.line'
      });
    }
    
    return queries;
  }
  
  isGoodFacet(attribute) {
    const badPatterns = [
      'id', 'guid', 'timestamp', 'message', 'log', 
      'stackTrace', 'trace', 'span', 'parent', 'child'
    ];
    
    const lowerAttr = attribute.toLowerCase();
    return !badPatterns.some(pattern => lowerAttr.includes(pattern));
  }
  
  isImportantMetric(metricName) {
    const importantPatterns = [
      'cpu', 'memory', 'disk', 'network', 'error', 
      'rate', 'throughput', 'latency', 'queue', 'kafka'
    ];
    
    const lowerName = metricName.toLowerCase();
    return importantPatterns.some(pattern => lowerName.includes(pattern));
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

module.exports = QueryOptimizer;