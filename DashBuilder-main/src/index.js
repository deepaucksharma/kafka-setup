/**
 * DashBuilder - A streamlined library for building New Relic dashboards
 * 
 * Main entry point that exports all public APIs
 */

// Core classes
const DashboardBuilder = require('./core/DashboardBuilder');
const QueryBuilder = require('./core/QueryBuilder');
const MetricDiscovery = require('./core/MetricDiscovery');
const LayoutOptimizer = require('./core/LayoutOptimizer');

// Services
const NerdGraphClient = require('./services/NerdGraphClient');
const NRQLService = require('./services/NRQLService');
const DashboardService = require('./services/DashboardService');

// Utilities
const validators = require('./utils/validators');
const logger = require('./utils/logger');
const rateLimiter = require('./utils/rateLimiter');

// Version
const { version } = require('../package.json');

module.exports = {
  // Core functionality
  DashboardBuilder,
  QueryBuilder,
  MetricDiscovery,
  LayoutOptimizer,
  
  // Services
  NerdGraphClient,
  NRQLService,
  DashboardService,
  
  // Utilities
  validators,
  logger,
  rateLimiter,
  
  // Convenience factory methods
  createDashboard: (config) => new DashboardBuilder(config),
  createQuery: (params) => new QueryBuilder(params),
  discoverMetrics: (options) => new MetricDiscovery(options),
  
  // Version info
  version
};

// Also export as named exports for ES6 imports
module.exports.DashboardBuilder = DashboardBuilder;
module.exports.QueryBuilder = QueryBuilder;
module.exports.MetricDiscovery = MetricDiscovery;
module.exports.LayoutOptimizer = LayoutOptimizer;
module.exports.NerdGraphClient = NerdGraphClient;
module.exports.NRQLService = NRQLService;
module.exports.DashboardService = DashboardService;