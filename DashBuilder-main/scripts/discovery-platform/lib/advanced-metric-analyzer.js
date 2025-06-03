/**
 * Advanced Metric Analyzer
 * Provides deep metric analysis including seasonality, trends, and predictions
 */

const logger = require('./logger');

class AdvancedMetricAnalyzer {
  constructor(config = {}) {
    this.config = config;
    
    // Analysis patterns
    this.patterns = {
      // Time-based patterns
      seasonal: {
        hourly: /hour|hourly|24h/i,
        daily: /day|daily|business/i,
        weekly: /week|weekly|7d/i,
        monthly: /month|monthly|30d/i
      },
      
      // Metric behavior patterns
      behavior: {
        counter: /count|total|sum|cumulative/i,
        gauge: /current|active|open|percent|ratio/i,
        histogram: /duration|latency|time|percentile/i,
        summary: /avg|average|mean|median/i
      },
      
      // Anomaly patterns
      anomaly: {
        spike: { threshold: 3, window: '5 minutes' },
        drop: { threshold: -3, window: '5 minutes' },
        plateau: { variance: 0.1, window: '30 minutes' },
        oscillation: { frequency: 5, window: '1 hour' }
      },
      
      // Business impact patterns
      businessImpact: {
        revenue: /revenue|sales|transaction|payment/i,
        customer: /customer|user|client|subscriber/i,
        performance: /latency|response|throughput|speed/i,
        availability: /uptime|available|health|status/i
      }
    };
    
    // Correlation thresholds
    this.correlationThresholds = {
      strong: 0.8,
      moderate: 0.6,
      weak: 0.4
    };
  }

  /**
   * Perform advanced analysis on metrics
   */
  async analyzeMetrics(metrics, historicalData = null) {
    logger.info('Performing advanced metric analysis');
    
    const analysis = {
      metrics: {},
      patterns: {
        seasonal: [],
        trending: [],
        anomalous: [],
        correlated: []
      },
      predictions: [],
      recommendations: [],
      alerts: []
    };
    
    // Analyze each metric
    for (const metric of metrics) {
      const metricAnalysis = await this.analyzeMetric(metric, historicalData);
      analysis.metrics[metric.name] = metricAnalysis;
      
      // Categorize patterns
      if (metricAnalysis.seasonality) {
        analysis.patterns.seasonal.push({
          metric: metric.name,
          pattern: metricAnalysis.seasonality
        });
      }
      
      if (metricAnalysis.trend) {
        analysis.patterns.trending.push({
          metric: metric.name,
          trend: metricAnalysis.trend
        });
      }
      
      if (metricAnalysis.anomalies?.length > 0) {
        analysis.patterns.anomalous.push({
          metric: metric.name,
          anomalies: metricAnalysis.anomalies
        });
      }
    }
    
    // Find correlations
    analysis.patterns.correlated = await this.findCorrelations(metrics, historicalData);
    
    // Generate predictions
    analysis.predictions = this.generatePredictions(analysis);
    
    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(analysis);
    
    // Suggest alerts
    analysis.alerts = this.suggestAlerts(analysis);
    
    return analysis;
  }

  /**
   * Analyze individual metric
   */
  async analyzeMetric(metric, historicalData) {
    const analysis = {
      name: metric.name,
      type: this.identifyMetricType(metric),
      behavior: this.identifyBehavior(metric),
      businessImpact: this.assessBusinessImpact(metric),
      statistics: {},
      seasonality: null,
      trend: null,
      anomalies: [],
      forecastability: 0
    };
    
    // Calculate statistics if we have data
    if (historicalData?.[metric.name]) {
      const data = historicalData[metric.name];
      analysis.statistics = this.calculateStatistics(data);
      analysis.seasonality = this.detectSeasonality(data);
      analysis.trend = this.detectTrend(data);
      analysis.anomalies = this.detectAnomalies(data);
      analysis.forecastability = this.assessForecastability(data);
    }
    
    return analysis;
  }

  /**
   * Identify metric type
   */
  identifyMetricType(metric) {
    // Check by name patterns
    for (const [type, pattern] of Object.entries(this.patterns.behavior)) {
      if (pattern.test(metric.name)) {
        return type;
      }
    }
    
    // Check by value characteristics
    if (metric.unit?.includes('percent')) return 'gauge';
    if (metric.unit?.includes('second')) return 'histogram';
    if (metric.unit?.includes('count')) return 'counter';
    
    return 'unknown';
  }

  /**
   * Identify metric behavior
   */
  identifyBehavior(metric) {
    const behaviors = [];
    
    // Check if it's a rate metric
    if (/persec|rate|throughput/i.test(metric.name)) {
      behaviors.push('rate');
    }
    
    // Check if it's a latency metric
    if (/latency|duration|time|delay/i.test(metric.name)) {
      behaviors.push('latency');
    }
    
    // Check if it's an error metric
    if (/error|fail|timeout|reject/i.test(metric.name)) {
      behaviors.push('error');
    }
    
    // Check if it's a saturation metric
    if (/percent|usage|utilization|queue|pending/i.test(metric.name)) {
      behaviors.push('saturation');
    }
    
    return behaviors;
  }

  /**
   * Assess business impact of metric
   */
  assessBusinessImpact(metric) {
    const impacts = [];
    
    for (const [impact, pattern] of Object.entries(this.patterns.businessImpact)) {
      if (pattern.test(metric.name)) {
        impacts.push(impact);
      }
    }
    
    // Determine criticality
    let criticality = 'low';
    if (impacts.includes('revenue') || impacts.includes('availability')) {
      criticality = 'high';
    } else if (impacts.includes('performance') || impacts.includes('customer')) {
      criticality = 'medium';
    }
    
    return {
      areas: impacts,
      criticality
    };
  }

  /**
   * Calculate statistics for metric data
   */
  calculateStatistics(data) {
    if (!data || data.length === 0) return {};
    
    const values = data.map(d => d.value).filter(v => typeof v === 'number');
    
    if (values.length === 0) return {};
    
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      stdDev,
      variance,
      cv: stdDev / mean, // Coefficient of variation
      range: sorted[sorted.length - 1] - sorted[0]
    };
  }

  /**
   * Detect seasonality in metric data
   */
  detectSeasonality(data) {
    if (!data || data.length < 168) return null; // Need at least a week of hourly data
    
    // Simple seasonality detection using autocorrelation
    const periods = {
      hourly: 24,
      daily: 168,
      weekly: 168 * 4
    };
    
    for (const [pattern, period] of Object.entries(periods)) {
      if (data.length >= period * 2) {
        const correlation = this.autocorrelation(data, period);
        if (correlation > 0.7) {
          return {
            pattern,
            period,
            strength: correlation,
            confidence: this.calculateSeasonalityConfidence(data, period)
          };
        }
      }
    }
    
    return null;
  }

  /**
   * Calculate autocorrelation
   */
  autocorrelation(data, lag) {
    const values = data.map(d => d.value);
    const n = values.length - lag;
    
    if (n <= 0) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < n; i++) {
      numerator += (values[i] - mean) * (values[i + lag] - mean);
    }
    
    for (let i = 0; i < values.length; i++) {
      denominator += Math.pow(values[i] - mean, 2);
    }
    
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Calculate seasonality confidence
   */
  calculateSeasonalityConfidence(data, period) {
    // Check consistency across multiple periods
    const numPeriods = Math.floor(data.length / period);
    if (numPeriods < 2) return 0;
    
    let consistentPeriods = 0;
    for (let i = 1; i < numPeriods; i++) {
      const correlation = this.autocorrelation(data.slice(0, (i + 1) * period), period);
      if (correlation > 0.6) consistentPeriods++;
    }
    
    return consistentPeriods / (numPeriods - 1);
  }

  /**
   * Detect trend in metric data
   */
  detectTrend(data) {
    if (!data || data.length < 10) return null;
    
    const values = data.map((d, i) => ({ x: i, y: d.value }));
    
    // Calculate linear regression
    const n = values.length;
    const sumX = values.reduce((sum, p) => sum + p.x, 0);
    const sumY = values.reduce((sum, p) => sum + p.y, 0);
    const sumXY = values.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumX2 = values.reduce((sum, p) => sum + p.x * p.x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Calculate R-squared
    const yMean = sumY / n;
    const ssTotal = values.reduce((sum, p) => sum + Math.pow(p.y - yMean, 2), 0);
    const ssResidual = values.reduce((sum, p) => {
      const predicted = slope * p.x + intercept;
      return sum + Math.pow(p.y - predicted, 2);
    }, 0);
    
    const rSquared = 1 - (ssResidual / ssTotal);
    
    // Determine trend type
    let type = 'stable';
    const percentChange = (slope * n) / intercept * 100;
    
    if (Math.abs(percentChange) > 20 && rSquared > 0.6) {
      type = slope > 0 ? 'increasing' : 'decreasing';
    }
    
    return {
      type,
      slope,
      intercept,
      rSquared,
      percentChange,
      confidence: rSquared
    };
  }

  /**
   * Detect anomalies in metric data
   */
  detectAnomalies(data) {
    if (!data || data.length < 30) return [];
    
    const anomalies = [];
    const values = data.map(d => d.value);
    
    // Calculate rolling statistics
    const windowSize = Math.min(30, Math.floor(data.length / 10));
    
    for (let i = windowSize; i < values.length; i++) {
      const window = values.slice(i - windowSize, i);
      const mean = window.reduce((a, b) => a + b, 0) / window.length;
      const stdDev = Math.sqrt(
        window.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / window.length
      );
      
      const zScore = (values[i] - mean) / stdDev;
      
      // Check for different anomaly types
      if (Math.abs(zScore) > 3) {
        anomalies.push({
          index: i,
          timestamp: data[i].timestamp,
          value: values[i],
          type: zScore > 0 ? 'spike' : 'drop',
          severity: Math.abs(zScore) > 4 ? 'high' : 'medium',
          zScore
        });
      }
    }
    
    return anomalies;
  }

  /**
   * Assess forecastability of metric
   */
  assessForecastability(data) {
    if (!data || data.length < 100) return 0;
    
    let score = 0;
    
    // Check data completeness
    const completeness = this.calculateCompleteness(data);
    score += completeness * 0.2;
    
    // Check seasonality
    const seasonality = this.detectSeasonality(data);
    if (seasonality && seasonality.confidence > 0.7) {
      score += 0.3;
    }
    
    // Check trend
    const trend = this.detectTrend(data);
    if (trend && trend.rSquared > 0.6) {
      score += 0.2;
    }
    
    // Check noise level
    const stats = this.calculateStatistics(data);
    const noiseLevel = stats.cv || 1;
    if (noiseLevel < 0.3) {
      score += 0.3;
    } else if (noiseLevel < 0.5) {
      score += 0.2;
    }
    
    return Math.min(score, 1);
  }

  /**
   * Calculate data completeness
   */
  calculateCompleteness(data) {
    if (!data || data.length === 0) return 0;
    
    // Check for gaps in time series
    const timestamps = data.map(d => new Date(d.timestamp).getTime()).sort();
    const intervals = [];
    
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }
    
    if (intervals.length === 0) return 1;
    
    const medianInterval = intervals.sort()[Math.floor(intervals.length / 2)];
    const gaps = intervals.filter(i => i > medianInterval * 2).length;
    
    return 1 - (gaps / intervals.length);
  }

  /**
   * Find correlations between metrics
   */
  async findCorrelations(metrics, historicalData) {
    const correlations = [];
    
    if (!historicalData) return correlations;
    
    // Compare each pair of metrics
    for (let i = 0; i < metrics.length; i++) {
      for (let j = i + 1; j < metrics.length; j++) {
        const data1 = historicalData[metrics[i].name];
        const data2 = historicalData[metrics[j].name];
        
        if (data1 && data2) {
          const correlation = this.calculateCorrelation(data1, data2);
          
          if (Math.abs(correlation) > this.correlationThresholds.weak) {
            correlations.push({
              metric1: metrics[i].name,
              metric2: metrics[j].name,
              coefficient: correlation,
              strength: this.getCorrelationStrength(correlation),
              type: correlation > 0 ? 'positive' : 'negative',
              confidence: this.calculateCorrelationConfidence(data1, data2)
            });
          }
        }
      }
    }
    
    return correlations.sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  calculateCorrelation(data1, data2) {
    // Align timestamps
    const aligned = this.alignTimeSeries(data1, data2);
    if (aligned.length < 10) return 0;
    
    const values1 = aligned.map(d => d.value1);
    const values2 = aligned.map(d => d.value2);
    
    const n = values1.length;
    const sum1 = values1.reduce((a, b) => a + b, 0);
    const sum2 = values2.reduce((a, b) => a + b, 0);
    const sum1Sq = values1.reduce((a, b) => a + b * b, 0);
    const sum2Sq = values2.reduce((a, b) => a + b * b, 0);
    const pSum = values1.reduce((acc, val, i) => acc + val * values2[i], 0);
    
    const num = pSum - (sum1 * sum2 / n);
    const den = Math.sqrt((sum1Sq - sum1 * sum1 / n) * (sum2Sq - sum2 * sum2 / n));
    
    return den === 0 ? 0 : num / den;
  }

  /**
   * Align two time series
   */
  alignTimeSeries(data1, data2) {
    const map1 = new Map(data1.map(d => [d.timestamp, d.value]));
    const map2 = new Map(data2.map(d => [d.timestamp, d.value]));
    
    const aligned = [];
    
    for (const [timestamp, value1] of map1) {
      const value2 = map2.get(timestamp);
      if (value2 !== undefined) {
        aligned.push({ timestamp, value1, value2 });
      }
    }
    
    return aligned;
  }

  /**
   * Get correlation strength label
   */
  getCorrelationStrength(coefficient) {
    const abs = Math.abs(coefficient);
    if (abs >= this.correlationThresholds.strong) return 'strong';
    if (abs >= this.correlationThresholds.moderate) return 'moderate';
    return 'weak';
  }

  /**
   * Calculate correlation confidence
   */
  calculateCorrelationConfidence(data1, data2) {
    const aligned = this.alignTimeSeries(data1, data2);
    const coverage = aligned.length / Math.max(data1.length, data2.length);
    const sampleSize = Math.min(1, aligned.length / 100);
    
    return coverage * sampleSize;
  }

  /**
   * Generate predictions based on analysis
   */
  generatePredictions(analysis) {
    const predictions = [];
    
    // Predict based on trends
    for (const trending of analysis.patterns.trending) {
      if (trending.trend.confidence > 0.7) {
        predictions.push({
          metric: trending.metric,
          type: 'trend',
          prediction: `${trending.metric} is expected to ${trending.trend.type} by ${Math.abs(trending.trend.percentChange).toFixed(1)}% over the next period`,
          confidence: trending.trend.confidence,
          recommendation: trending.trend.type === 'increasing' && trending.metric.includes('error') 
            ? 'Consider setting up alerts for this metric' 
            : null
        });
      }
    }
    
    // Predict based on seasonality
    for (const seasonal of analysis.patterns.seasonal) {
      if (seasonal.pattern.confidence > 0.8) {
        predictions.push({
          metric: seasonal.metric,
          type: 'seasonal',
          prediction: `${seasonal.metric} follows a ${seasonal.pattern.pattern} pattern`,
          confidence: seasonal.pattern.confidence,
          recommendation: 'Use seasonal baselines for more accurate alerting'
        });
      }
    }
    
    return predictions;
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(analysis) {
    const recommendations = [];
    
    // Check for missing golden signals
    const hasLatency = Object.values(analysis.metrics).some(m => 
      m.behavior.includes('latency')
    );
    const hasErrors = Object.values(analysis.metrics).some(m => 
      m.behavior.includes('error')
    );
    const hasThroughput = Object.values(analysis.metrics).some(m => 
      m.behavior.includes('rate')
    );
    const hasSaturation = Object.values(analysis.metrics).some(m => 
      m.behavior.includes('saturation')
    );
    
    if (!hasLatency) {
      recommendations.push({
        type: 'instrumentation',
        priority: 'high',
        message: 'Add latency metrics for better performance monitoring',
        impact: 'Improved ability to detect performance degradation'
      });
    }
    
    if (!hasErrors) {
      recommendations.push({
        type: 'instrumentation',
        priority: 'high',
        message: 'Add error rate metrics for reliability monitoring',
        impact: 'Better visibility into system failures'
      });
    }
    
    // Check for correlated metrics that should be monitored together
    for (const correlation of analysis.patterns.correlated) {
      if (correlation.strength === 'strong') {
        recommendations.push({
          type: 'monitoring',
          priority: 'medium',
          message: `Monitor ${correlation.metric1} and ${correlation.metric2} together due to strong correlation`,
          impact: 'Better root cause analysis capabilities'
        });
      }
    }
    
    // Check for high-noise metrics
    for (const [metricName, metricAnalysis] of Object.entries(analysis.metrics)) {
      if (metricAnalysis.statistics?.cv > 0.5) {
        recommendations.push({
          type: 'optimization',
          priority: 'low',
          message: `Consider smoothing or aggregating ${metricName} due to high variability`,
          impact: 'Reduced alert noise'
        });
      }
    }
    
    return recommendations;
  }

  /**
   * Suggest alerts based on analysis
   */
  suggestAlerts(analysis) {
    const alerts = [];
    
    // Create alerts for critical business metrics
    for (const [metricName, metricAnalysis] of Object.entries(analysis.metrics)) {
      if (metricAnalysis.businessImpact.criticality === 'high') {
        // Static threshold alert
        if (metricAnalysis.statistics?.mean) {
          alerts.push({
            name: `${metricName} threshold alert`,
            type: 'static',
            condition: `${metricName} > ${(metricAnalysis.statistics.mean * 1.5).toFixed(2)}`,
            window: '5 minutes',
            priority: 'critical',
            reason: 'High business impact metric'
          });
        }
        
        // Anomaly detection alert
        if (metricAnalysis.forecastability > 0.7) {
          alerts.push({
            name: `${metricName} anomaly alert`,
            type: 'anomaly',
            condition: 'Baseline deviation > 3 standard deviations',
            window: '10 minutes',
            priority: 'high',
            reason: 'Predictable metric with anomaly detection'
          });
        }
      }
      
      // Error rate alerts
      if (metricAnalysis.behavior.includes('error')) {
        alerts.push({
          name: `${metricName} error rate alert`,
          type: 'percentage',
          condition: 'Error rate > 1%',
          window: '5 minutes',
          priority: 'high',
          reason: 'Error metric monitoring'
        });
      }
      
      // Saturation alerts
      if (metricAnalysis.behavior.includes('saturation')) {
        alerts.push({
          name: `${metricName} saturation alert`,
          type: 'static',
          condition: `${metricName} > 80`,
          window: '5 minutes',
          priority: 'medium',
          reason: 'Resource saturation monitoring'
        });
      }
    }
    
    // Correlation-based alerts
    for (const correlation of analysis.patterns.correlated) {
      if (correlation.strength === 'strong' && correlation.confidence > 0.8) {
        alerts.push({
          name: `${correlation.metric1} vs ${correlation.metric2} deviation`,
          type: 'correlation',
          condition: 'Correlation deviation > 20%',
          window: '15 minutes',
          priority: 'medium',
          reason: 'Strong metric correlation monitoring'
        });
      }
    }
    
    return alerts;
  }
}

module.exports = AdvancedMetricAnalyzer;