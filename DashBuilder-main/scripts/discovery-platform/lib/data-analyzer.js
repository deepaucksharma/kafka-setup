const { logger } = require('./logger');

class DataAnalyzer {
  constructor({ config }) {
    this.config = config;
  }
  
  async analyzeDataQuality(discoveries) {
    const insights = [];
    
    // Analyze event type coverage
    if (discoveries.eventTypes.length === 0) {
      insights.push({
        type: 'warning',
        title: 'No Event Types Found',
        description: 'No event types were discovered in this account',
        impact: 'high'
      });
    } else {
      const totalAttributes = discoveries.eventTypes.reduce((sum, et) => 
        sum + Object.keys(et.attributes || {}).length, 0);
      
      insights.push({
        type: 'info',
        title: 'Data Coverage',
        description: `Discovered ${discoveries.eventTypes.length} event types with ${totalAttributes} total attributes`,
        impact: 'info'
      });
    }
    
    // Check for high-volume event types
    const highVolumeTypes = discoveries.eventTypes.filter(et => et.volume > 1000000);
    if (highVolumeTypes.length > 0) {
      insights.push({
        type: 'info',
        title: 'High Volume Event Types',
        description: `${highVolumeTypes.length} event types have over 1M events/day: ${highVolumeTypes.map(et => et.name).join(', ')}`,
        impact: 'medium'
      });
    }
    
    // Check for empty event types
    const emptyTypes = discoveries.eventTypes.filter(et => et.volume === 0);
    if (emptyTypes.length > 0) {
      insights.push({
        type: 'warning',
        title: 'Empty Event Types',
        description: `${emptyTypes.length} event types have no data: ${emptyTypes.map(et => et.name).join(', ')}`,
        impact: 'low'
      });
    }
    
    return { insights };
  }
  
  async findRelationships(discoveries) {
    const relationships = [];
    
    // Find entity-event relationships
    discoveries.eventTypes.forEach(eventType => {
      if (eventType.metadata?.entityCount > 0) {
        relationships.push({
          type: 'entity-event',
          from: 'Entity',
          to: eventType.name,
          confidence: 100,
          description: `Entities emit ${eventType.name} events`
        });
      }
    });
    
    // Find common attributes that might indicate relationships
    const attributeMap = new Map();
    discoveries.eventTypes.forEach(et => {
      Object.keys(et.attributes || {}).forEach(attr => {
        if (!attributeMap.has(attr)) {
          attributeMap.set(attr, []);
        }
        attributeMap.get(attr).push(et.name);
      });
    });
    
    // Find shared identifiers
    ['entity.guid', 'host', 'hostname', 'service.name', 'application.name'].forEach(attr => {
      if (attributeMap.has(attr)) {
        const eventTypes = attributeMap.get(attr);
        if (eventTypes.length > 1) {
          relationships.push({
            type: 'shared-attribute',
            attribute: attr,
            eventTypes,
            confidence: 90,
            description: `${eventTypes.length} event types share ${attr} attribute`
          });
        }
      }
    });
    
    return relationships;
  }
  
  async generateInsights(discoveries) {
    const insights = [];
    
    // Kafka-specific insights
    const hasKafka = discoveries.eventTypes.some(et => 
      et.name.toLowerCase().includes('kafka') || et.name === 'QueueSample'
    );
    
    if (hasKafka) {
      insights.push({
        type: 'discovery',
        title: 'Kafka Monitoring Available',
        description: 'Kafka broker and queue monitoring data is available. Consider creating specialized Kafka dashboards.',
        impact: 'high',
        query: `SELECT count(*) FROM KafkaBrokerSample, KafkaTopicSample, QueueSample WHERE provider = 'kafka' SINCE 1 hour ago`
      });
    }
    
    // APM insights
    const hasAPM = discoveries.eventTypes.some(et => et.name === 'Transaction');
    if (hasAPM) {
      const txnType = discoveries.eventTypes.find(et => et.name === 'Transaction');
      if (txnType?.attributes?.['error']) {
        insights.push({
          type: 'performance',
          title: 'Error Tracking Available',
          description: 'Transaction errors are being tracked. Monitor error rates for service health.',
          impact: 'high',
          query: `SELECT percentage(count(*), WHERE error IS true) FROM Transaction SINCE 1 hour ago`
        });
      }
    }
    
    // Infrastructure insights
    const hasInfra = discoveries.eventTypes.some(et => et.name === 'SystemSample');
    if (hasInfra) {
      insights.push({
        type: 'infrastructure',
        title: 'Infrastructure Monitoring Active',
        description: 'System-level metrics are being collected for infrastructure monitoring.',
        impact: 'medium',
        query: `SELECT average(cpuPercent), average(memoryUsedPercent) FROM SystemSample SINCE 1 hour ago`
      });
    }
    
    // Metric insights
    if (discoveries.metrics && discoveries.metrics.length > 0) {
      const totalMetrics = discoveries.metrics.reduce((sum, g) => sum + g.totalMetrics, 0);
      insights.push({
        type: 'metrics',
        title: `${totalMetrics} Custom Metrics Available`,
        description: `Found ${discoveries.metrics.length} metric groups with ${totalMetrics} total metrics`,
        impact: 'medium'
      });
    }
    
    return insights;
  }
  
  async generateRecommendations(discoveries) {
    const recommendations = [];
    
    // Check for missing standard event types
    const standardTypes = ['Transaction', 'SystemSample', 'Log', 'Metric'];
    const missingTypes = standardTypes.filter(type => 
      !discoveries.eventTypes.some(et => et.name === type)
    );
    
    if (missingTypes.length > 0) {
      recommendations.push({
        title: 'Enable Additional Monitoring',
        description: `Consider enabling monitoring for: ${missingTypes.join(', ')}`,
        priority: 'medium',
        expectedBenefit: 'More comprehensive observability coverage'
      });
    }
    
    // Check for high cardinality attributes
    discoveries.eventTypes.forEach(et => {
      Object.entries(et.attributes || {}).forEach(([attr, info]) => {
        if (info.type === 'string' && info.cardinality > 10000) {
          recommendations.push({
            title: `High Cardinality Attribute: ${attr}`,
            description: `${et.name}.${attr} has ${info.cardinality} unique values. Consider if this level of granularity is needed.`,
            priority: 'low',
            expectedBenefit: 'Reduced query costs and improved performance'
          });
        }
      });
    });
    
    // Dashboard recommendations
    if (discoveries.eventTypes.length > 20) {
      recommendations.push({
        title: 'Create Focused Dashboards',
        description: 'With many event types available, create multiple focused dashboards rather than one large dashboard',
        priority: 'high',
        expectedBenefit: 'Better performance and easier navigation'
      });
    }
    
    // Kafka-specific recommendations
    if (discoveries.eventTypes.some(et => et.name === 'QueueSample')) {
      recommendations.push({
        title: 'Monitor Kafka Share Groups',
        description: 'Queue samples detected. Set up alerts for share group lag and oldest message age.',
        priority: 'high',
        expectedBenefit: 'Proactive detection of consumer lag issues'
      });
    }
    
    return recommendations;
  }
}

module.exports = DataAnalyzer;