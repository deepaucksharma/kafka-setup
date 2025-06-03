const { logger } = require('./logger');

class DataAnalyzer {
  constructor({ config }) {
    this.config = config;
  }
  
  async analyzeDataQuality(discoveries) {
    const insights = [];
    const quality = {
      score: 100,
      issues: [],
      recommendations: []
    };
    
    // Analyze event type coverage
    const eventTypeCoverage = this.analyzeEventTypeCoverage(discoveries.eventTypes);
    insights.push(...eventTypeCoverage.insights);
    quality.score -= eventTypeCoverage.penalty;
    
    // Analyze attribute quality
    const attributeQuality = this.analyzeAttributeQuality(discoveries.eventTypes);
    insights.push(...attributeQuality.insights);
    quality.score -= attributeQuality.penalty;
    
    // Analyze data freshness
    const freshness = this.analyzeDataFreshness(discoveries.eventTypes);
    insights.push(...freshness.insights);
    quality.score -= freshness.penalty;
    
    // Analyze metric coverage
    const metricCoverage = this.analyzeMetricCoverage(discoveries.metrics);
    insights.push(...metricCoverage.insights);
    quality.score -= metricCoverage.penalty;
    
    quality.score = Math.max(0, quality.score);
    
    return {
      quality,
      insights
    };
  }
  
  analyzeEventTypeCoverage(eventTypes) {
    const insights = [];
    let penalty = 0;
    
    // Check for essential event types
    const essentialTypes = [
      'Transaction', 'SystemSample', 'Log', 'Metric'
    ];
    
    const foundTypes = new Set(eventTypes.map(e => e.name));
    const missingEssential = essentialTypes.filter(t => !foundTypes.has(t));
    
    if (missingEssential.length > 0) {
      insights.push({
        type: 'warning',
        title: 'Missing Essential Event Types',
        description: `The following essential event types are not reporting data: ${missingEssential.join(', ')}`,
        impact: 'high',
        recommendation: 'Ensure all New Relic agents are properly installed and configured'
      });
      penalty += missingEssential.length * 5;
    }
    
    // Check for low volume event types
    const lowVolumeTypes = eventTypes.filter(e => e.volume < 100);
    if (lowVolumeTypes.length > 0) {
      insights.push({
        type: 'info',
        title: 'Low Volume Event Types',
        description: `${lowVolumeTypes.length} event types have very low data volume`,
        impact: 'low',
        recommendation: 'Review if these event types are still needed or if data collection is working properly'
      });
    }
    
    // Check for custom events
    const customEventTypes = eventTypes.filter(e => 
      !e.name.includes('Sample') && 
      !['Transaction', 'Log', 'Metric', 'Span'].includes(e.name)
    );
    
    if (customEventTypes.length > 0) {
      insights.push({
        type: 'success',
        title: 'Custom Events Detected',
        description: `Found ${customEventTypes.length} custom event types, indicating active custom instrumentation`,
        impact: 'positive'
      });
    }
    
    return { insights, penalty };
  }
  
  analyzeAttributeQuality(eventTypes) {
    const insights = [];
    let penalty = 0;
    
    eventTypes.forEach(eventType => {
      const attrs = eventType.attributes || {};
      const attrCount = Object.keys(attrs).length;
      
      // Check for event types with very few attributes
      if (attrCount < 5 && eventType.volume > 1000) {
        insights.push({
          type: 'warning',
          title: `Limited Attributes in ${eventType.name}`,
          description: `Only ${attrCount} attributes discovered, which may indicate limited instrumentation`,
          impact: 'medium',
          recommendation: 'Consider adding custom attributes for better observability'
        });
        penalty += 2;
      }
      
      // Check for high cardinality attributes
      const highCardinalityAttrs = Object.entries(attrs)
        .filter(([_, info]) => info.type === 'string' && info.cardinality > 10000);
      
      if (highCardinalityAttrs.length > 0) {
        insights.push({
          type: 'warning',
          title: `High Cardinality Attributes in ${eventType.name}`,
          description: `Found ${highCardinalityAttrs.length} attributes with very high cardinality, which may impact query performance`,
          impact: 'medium',
          recommendation: 'Consider using attribute sampling or aggregation for high cardinality data'
        });
        penalty += 1;
      }
      
      // Check for null-heavy attributes
      const nullableAttrs = Object.entries(attrs)
        .filter(([_, info]) => info.nullable && info.nullPercentage > 90);
      
      if (nullableAttrs.length > 5) {
        insights.push({
          type: 'info',
          title: `Many Nullable Attributes in ${eventType.name}`,
          description: 'Several attributes have high null rates, which may indicate optional or conditional data',
          impact: 'low'
        });
      }
    });
    
    return { insights, penalty };
  }
  
  analyzeDataFreshness(eventTypes) {
    const insights = [];
    let penalty = 0;
    
    const now = Date.now();
    
    eventTypes.forEach(eventType => {
      if (eventType.metadata && eventType.metadata.dataRange) {
        const latestData = new Date(eventType.metadata.dataRange.latest).getTime();
        const dataAge = now - latestData;
        
        if (dataAge > 3600000) { // Data older than 1 hour
          insights.push({
            type: 'error',
            title: `Stale Data in ${eventType.name}`,
            description: `No new data received for ${Math.floor(dataAge / 3600000)} hours`,
            impact: 'high',
            recommendation: 'Check if the data source is still active and properly configured'
          });
          penalty += 10;
        }
      }
    });
    
    return { insights, penalty };
  }
  
  analyzeMetricCoverage(metricGroups) {
    const insights = [];
    let penalty = 0;
    
    // Check for key metric categories
    const expectedCategories = ['system', 'application', 'network'];
    const foundCategories = metricGroups.map(g => g.name);
    
    const missingCategories = expectedCategories.filter(c => 
      !foundCategories.some(f => f.toLowerCase().includes(c))
    );
    
    if (missingCategories.length > 0) {
      insights.push({
        type: 'warning',
        title: 'Missing Metric Categories',
        description: `No metrics found for: ${missingCategories.join(', ')}`,
        impact: 'medium',
        recommendation: 'Ensure infrastructure and APM agents are properly configured'
      });
      penalty += missingCategories.length * 3;
    }
    
    // Check total metric count
    const totalMetrics = metricGroups.reduce((sum, g) => sum + (g.statistics?.totalMetrics || 0), 0);
    
    if (totalMetrics < 50) {
      insights.push({
        type: 'warning',
        title: 'Low Metric Count',
        description: `Only ${totalMetrics} unique metrics discovered`,
        impact: 'medium',
        recommendation: 'Review agent configurations to ensure all metrics are being collected'
      });
      penalty += 5;
    }
    
    return { insights, penalty };
  }
  
  async findRelationships(discoveries) {
    const relationships = [];
    
    // Find entity-to-event relationships
    const entityEvents = discoveries.eventTypes.filter(e => 
      e.metadata && e.metadata.entityCount > 0
    );
    
    entityEvents.forEach(sourceEvent => {
      entityEvents.forEach(targetEvent => {
        if (sourceEvent.name !== targetEvent.name) {
          // Check if both have entity.guid
          if (sourceEvent.attributes['entity.guid'] && targetEvent.attributes['entity.guid']) {
            relationships.push({
              type: 'entity-event',
              from: sourceEvent.name,
              to: targetEvent.name,
              via: 'entity.guid',
              strength: 'strong'
            });
          }
        }
      });
    });
    
    // Find service relationships
    const serviceEvents = discoveries.eventTypes.filter(e => 
      e.attributes && e.attributes['service.name']
    );
    
    if (serviceEvents.length > 1) {
      relationships.push({
        type: 'service',
        events: serviceEvents.map(e => e.name),
        via: 'service.name',
        strength: 'strong'
      });
    }
    
    // Find host relationships
    const hostEvents = discoveries.eventTypes.filter(e => 
      e.attributes && (e.attributes['host'] || e.attributes['hostname'])
    );
    
    if (hostEvents.length > 1) {
      relationships.push({
        type: 'infrastructure',
        events: hostEvents.map(e => e.name),
        via: 'host/hostname',
        strength: 'medium'
      });
    }
    
    // Find trace relationships
    const traceEvents = discoveries.eventTypes.filter(e => 
      e.attributes && (e.attributes['trace.id'] || e.attributes['traceId'])
    );
    
    if (traceEvents.length > 0) {
      relationships.push({
        type: 'distributed-trace',
        events: traceEvents.map(e => e.name),
        via: 'trace.id',
        strength: 'strong'
      });
    }
    
    return relationships;
  }
  
  async generateInsights(discoveries) {
    const insights = [];
    
    // Data volume insights
    const totalVolume = discoveries.eventTypes.reduce((sum, e) => sum + e.volume, 0);
    const topEventTypes = discoveries.eventTypes
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 3);
    
    insights.push({
      type: 'info',
      title: 'Data Volume Distribution',
      description: `Total of ${totalVolume.toLocaleString()} events discovered. Top 3 event types account for ${
        Math.round((topEventTypes.reduce((sum, e) => sum + e.volume, 0) / totalVolume) * 100)
      }% of data`,
      category: 'overview'
    });
    
    // Kafka-specific insights
    const kafkaEvents = discoveries.eventTypes.filter(e => 
      e.name.toLowerCase().includes('kafka') || e.name === 'QueueSample'
    );
    
    if (kafkaEvents.length > 0) {
      const queueSample = kafkaEvents.find(e => e.name === 'QueueSample');
      if (queueSample && queueSample.attributes['share.group.name']) {
        insights.push({
          type: 'success',
          title: 'Kafka Share Groups Monitoring Active',
          description: 'QueueSample events are being generated with share group data, enabling advanced Kafka monitoring',
          category: 'kafka'
        });
      }
      
      insights.push({
        type: 'info',
        title: 'Kafka Ecosystem Coverage',
        description: `Found ${kafkaEvents.length} Kafka-related event types providing comprehensive Kafka observability`,
        category: 'kafka'
      });
    }
    
    // Performance insights
    const transactionEvent = discoveries.eventTypes.find(e => e.name === 'Transaction');
    if (transactionEvent && transactionEvent.attributes['duration']) {
      insights.push({
        type: 'recommendation',
        title: 'Application Performance Monitoring Available',
        description: 'Transaction duration data is available for performance analysis and optimization',
        category: 'apm'
      });
    }
    
    // Infrastructure insights
    const infraEvents = discoveries.eventTypes.filter(e => 
      ['SystemSample', 'ProcessSample', 'NetworkSample', 'ContainerSample'].includes(e.name)
    );
    
    if (infraEvents.length >= 3) {
      insights.push({
        type: 'success',
        title: 'Comprehensive Infrastructure Monitoring',
        description: `${infraEvents.length} infrastructure event types provide full visibility into system health`,
        category: 'infrastructure'
      });
    }
    
    // Custom instrumentation insights
    const customEvents = discoveries.eventTypes.filter(e => 
      !e.name.endsWith('Sample') && 
      !['Transaction', 'Log', 'Metric', 'Span', 'PageView', 'BrowserInteraction'].includes(e.name)
    );
    
    if (customEvents.length > 0) {
      insights.push({
        type: 'success',
        title: 'Active Custom Instrumentation',
        description: `${customEvents.length} custom event types show advanced monitoring implementation`,
        category: 'custom'
      });
    }
    
    // Metric insights
    const totalMetricGroups = discoveries.metrics.length;
    const totalUniqueMetrics = discoveries.metrics.reduce(
      (sum, g) => sum + (g.statistics?.totalMetrics || 0), 
      0
    );
    
    if (totalUniqueMetrics > 100) {
      insights.push({
        type: 'info',
        title: 'Rich Metric Collection',
        description: `${totalUniqueMetrics} unique metrics across ${totalMetricGroups} categories provide detailed system visibility`,
        category: 'metrics'
      });
    }
    
    // Log insights
    if (discoveries.logs && discoveries.logs.statistics) {
      const logStats = discoveries.logs.statistics;
      insights.push({
        type: 'info',
        title: 'Log Collection Active',
        description: `Collecting logs from ${logStats.serviceCount || 0} services across ${logStats.hostCount || 0} hosts`,
        category: 'logs'
      });
    }
    
    return insights;
  }
  
  async generateRecommendations(discoveries) {
    const recommendations = [];
    
    // Check for monitoring gaps
    if (!discoveries.eventTypes.find(e => e.name === 'PageView')) {
      recommendations.push({
        title: 'Enable Browser Monitoring',
        description: 'No browser data detected. Consider adding New Relic Browser agent for frontend visibility',
        priority: 'medium',
        effort: 'low'
      });
    }
    
    if (!discoveries.eventTypes.find(e => e.name === 'MobileSession')) {
      recommendations.push({
        title: 'Consider Mobile Monitoring',
        description: 'No mobile data detected. If you have mobile apps, consider adding New Relic Mobile',
        priority: 'low',
        effort: 'medium'
      });
    }
    
    // Kafka-specific recommendations
    const hasKafkaData = discoveries.eventTypes.some(e => 
      e.name.toLowerCase().includes('kafka')
    );
    
    if (hasKafkaData) {
      const hasQueueSample = discoveries.eventTypes.find(e => e.name === 'QueueSample');
      
      if (!hasQueueSample) {
        recommendations.push({
          title: 'Enable Kafka Share Groups Monitoring',
          description: 'Kafka data detected but no QueueSample events. Deploy Custom OHI for Share Groups monitoring',
          priority: 'high',
          effort: 'medium'
        });
      }
    }
    
    // Performance recommendations
    const highCardinalityCount = discoveries.eventTypes.reduce((count, et) => {
      const highCard = Object.values(et.attributes || {})
        .filter(attr => attr.type === 'string' && attr.cardinality > 10000).length;
      return count + highCard;
    }, 0);
    
    if (highCardinalityCount > 10) {
      recommendations.push({
        title: 'Optimize High Cardinality Attributes',
        description: `Found ${highCardinalityCount} high cardinality attributes that may impact query performance`,
        priority: 'medium',
        effort: 'medium'
      });
    }
    
    // Dashboard recommendations
    if (discoveries.queries.length > 50) {
      recommendations.push({
        title: 'Create Specialized Dashboards',
        description: 'With this much data variety, consider creating role-specific dashboards for different teams',
        priority: 'medium',
        effort: 'low'
      });
    }
    
    // Alert recommendations
    recommendations.push({
      title: 'Implement Proactive Alerting',
      description: 'Use the discovered metrics and patterns to create alerts before issues impact users',
      priority: 'high',
      effort: 'medium'
    });
    
    return recommendations;
  }
}

module.exports = DataAnalyzer;