#!/usr/bin/env node

/**
 * Discovery to Dashboard Pipeline
 * Comprehensive script that discovers all data in a New Relic account
 * and automatically generates optimized dashboards
 */

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const DiscoveryPlatform = require('./discovery-platform');
const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const program = new Command();

program
  .name('discovery-to-dashboard')
  .description('Discover all New Relic data and generate comprehensive dashboards')
  .version('1.0.0')
  .option('-a, --account <id>', 'New Relic account ID')
  .option('-k, --api-key <key>', 'New Relic API key')
  .option('-r, --region <region>', 'New Relic region (US/EU)', 'US')
  .option('--max-event-types <n>', 'Maximum event types to process', parseInt, 50)
  .option('--max-attributes <n>', 'Maximum attributes per event type', parseInt, 100)
  .option('--no-metrics', 'Skip metric discovery')
  .option('--no-traces', 'Skip trace discovery')
  .option('--no-logs', 'Skip log discovery')
  .option('--no-dashboard', 'Skip dashboard generation')
  .option('--dry-run', 'Run discovery without creating dashboard')
  .option('--export-only', 'Export results without creating dashboard')
  .option('--resume', 'Resume from previous progress')
  .option('--progress-file <file>', 'Progress file name')
  .option('--output-dir <dir>', 'Output directory for exports', './discovery-output')
  .option('--force-nerdgraph', 'Force all queries through NerdGraph')
  .option('--cost-limit <n>', 'Maximum estimated cost', parseFloat, 1000)
  .parse(process.argv);

const options = program.opts();

async function main() {
  console.log(chalk.bold.blue('\n🚀 New Relic Discovery to Dashboard Pipeline\n'));
  
  // Validate configuration
  const accountId = options.account || process.env.NEW_RELIC_ACCOUNT_ID || process.env.ACC;
  const apiKey = options.apiKey || process.env.NEW_RELIC_API_KEY || process.env.UKEY;
  
  if (!accountId || !apiKey) {
    console.error(chalk.red('❌ Missing required configuration:'));
    if (!accountId) console.error(chalk.red('   - Account ID (use --account or set NEW_RELIC_ACCOUNT_ID)'));
    if (!apiKey) console.error(chalk.red('   - API Key (use --api-key or set NEW_RELIC_API_KEY)'));
    process.exit(1);
  }
  
  // Create output directory
  const outputDir = path.resolve(options.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });
  
  // Configure discovery platform
  const config = {
    apiKey,
    accountId,
    region: options.region,
    
    // Discovery options
    maxEventTypesToProcess: options.maxEventTypes,
    maxAttributesPerEventType: options.maxAttributes,
    maxConcurrentQueries: 10,
    queriesPerMinute: 2500,
    queryTimeout: 30000,
    
    // Feature flags
    discoverMetrics: options.metrics,
    discoverTraces: options.traces,
    discoverLogs: options.logs,
    discoverCustomEvents: true,
    discoverSyntheticData: true,
    analyzeRelationships: true,
    generateDashboard: options.dashboard && !options.dryRun && !options.exportOnly,
    exportResults: true,
    
    // Progress management
    saveProgress: true,
    progressFile: options.progressFile || `discovery-${accountId}-progress.json`,
    
    // Cost management
    costLimit: options.costLimit,
    forceNerdGraph: options.forceNerdgraph
  };
  
  console.log(chalk.cyan('Configuration:'));
  console.log(chalk.gray(`  Account ID: ${accountId}`));
  console.log(chalk.gray(`  Region: ${config.region}`));
  console.log(chalk.gray(`  Max Event Types: ${config.maxEventTypesToProcess}`));
  console.log(chalk.gray(`  Features: ${[
    config.discoverMetrics && 'Metrics',
    config.discoverTraces && 'Traces',
    config.discoverLogs && 'Logs',
    'Custom Events',
    'Synthetic',
    'Relationships'
  ].filter(Boolean).join(', ')}`));
  console.log(chalk.gray(`  Output: ${outputDir}\n`));
  
  // Create discovery platform
  const platform = new DiscoveryPlatform(config);
  
  // Track progress
  const spinner = ora();
  let currentPhase = '';
  
  // Set up event handlers
  platform.on('dataPlusDetected', (dataPlus) => {
    spinner.info(chalk.green('✅ Data Plus detected:') + ` ${dataPlus.detected ? 'Enabled' : 'Disabled'}`);
    if (dataPlus.capabilities) {
      const features = [];
      if (dataPlus.capabilities.asyncQueries) features.push('Async Queries');
      if (dataPlus.capabilities.extendedLimits) features.push('Extended Limits');
      if (dataPlus.capabilities.maxQueryDuration > 60000) features.push(`${dataPlus.capabilities.maxQueryDuration/1000}s Queries`);
      console.log(chalk.gray(`   Features: ${features.join(', ')}`));
    }
  });
  
  platform.on('costWarning', (costInfo) => {
    spinner.warn(chalk.yellow('⚠️  Cost threshold exceeded:') + ` ${costInfo.currentCost} / ${costInfo.threshold}`);
  });
  
  platform.on('discovery', ({ type, data }) => {
    spinner.text = `Discovering ${type}: ${data.name || data}`;
  });
  
  platform.on('eventTypeProcessed', (eventData) => {
    const attrs = Object.keys(eventData.attributes || {}).length;
    spinner.succeed(chalk.green(`✓ ${eventData.name}`) + chalk.gray(` (${eventData.volume.toLocaleString()} events, ${attrs} attributes)`));
    spinner.start('Discovering...');
  });
  
  platform.on('rateLimitReached', () => {
    spinner.text = chalk.yellow('Rate limit reached, waiting...');
  });
  
  // Monitor query execution
  let queryStats = {
    total: 0,
    standard: 0,
    nerdgraph: 0,
    async: 0,
    cached: 0
  };
  
  platform.queryExecutor.on('queryExecuted', (info) => {
    queryStats.total++;
    queryStats[info.method]++;
  });
  
  platform.on('discovery', (event) => {
    if (event.type === 'phase') {
      if (currentPhase !== event.data) {
        spinner.succeed();
        currentPhase = event.data;
        console.log(chalk.bold.cyan(`\n${event.data}\n`));
        spinner.start('Processing...');
      }
    }
  });
  
  try {
    // Check if resuming
    if (options.resume) {
      console.log(chalk.yellow('📂 Checking for previous progress...'));
      const progressPath = path.join(process.cwd(), config.progressFile);
      if (fs.existsSync(progressPath)) {
        console.log(chalk.green('✅ Found previous progress, resuming...\n'));
      }
    }
    
    // Start discovery
    spinner.start('Starting discovery...');
    const startTime = Date.now();
    
    const discoveries = await platform.discover();
    
    spinner.succeed(chalk.green('✅ Discovery completed!'));
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    // Display summary
    console.log(chalk.bold.cyan('\n📊 Discovery Summary:\n'));
    
    console.log(chalk.white('Data Sources:'));
    console.log(chalk.gray(`  • Event Types: ${discoveries.eventTypes.length}`));
    console.log(chalk.gray(`  • Metrics: ${discoveries.metrics?.reduce((sum, g) => sum + g.totalMetrics, 0) || 0}`));
    console.log(chalk.gray(`  • Services: ${discoveries.traces?.services?.length || 0}`));
    console.log(chalk.gray(`  • Log Sources: ${discoveries.logs?.sources?.length || 0}`));
    
    const totalAttributes = discoveries.eventTypes.reduce((sum, et) => 
      sum + Object.keys(et.attributes || {}).length, 0);
    
    console.log(chalk.white('\nAnalysis:'));
    console.log(chalk.gray(`  • Total Attributes: ${totalAttributes.toLocaleString()}`));
    console.log(chalk.gray(`  • Relationships: ${discoveries.relationships?.length || 0}`));
    console.log(chalk.gray(`  • Generated Queries: ${discoveries.queries?.length || 0}`));
    console.log(chalk.gray(`  • Insights: ${discoveries.insights?.length || 0}`));
    console.log(chalk.gray(`  • Recommendations: ${discoveries.recommendations?.length || 0}`));
    
    console.log(chalk.white('\nPerformance:'));
    console.log(chalk.gray(`  • Duration: ${duration}s`));
    console.log(chalk.gray(`  • Queries Executed: ${platform.state.statistics.queriesExecuted}`));
    console.log(chalk.gray(`  • Cache Hit Rate: ${((platform.state.statistics.cacheHits / platform.state.statistics.queriesExecuted) * 100).toFixed(1)}%`));
    
    console.log(chalk.white('\nQuery Distribution:'));
    console.log(chalk.gray(`  • Standard: ${platform.state.statistics.queries_standard || 0}`));
    console.log(chalk.gray(`  • NerdGraph: ${platform.state.statistics.queries_nerdgraph || 0}`));
    console.log(chalk.gray(`  • Async: ${platform.state.statistics.queries_async || 0}`));
    
    // Cost tracking
    const costTracking = platform.queryExecutor.getCostTracking();
    console.log(chalk.white('\nCost Analysis:'));
    console.log(chalk.gray(`  • Estimated Cost: $${costTracking.totalEstimatedCost.toFixed(2)}`));
    console.log(chalk.gray(`  • Cost/Query: $${(costTracking.totalEstimatedCost / costTracking.totalQueries).toFixed(4)}`));
    
    // Export results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportBase = path.join(outputDir, `discovery-${accountId}-${timestamp}`);
    
    console.log(chalk.cyan('\n📁 Exporting results...\n'));
    
    // Export full discovery data
    const fullDataPath = `${exportBase}-full.json`;
    fs.writeFileSync(fullDataPath, JSON.stringify(discoveries, null, 2));
    console.log(chalk.gray(`  • Full data: ${path.relative(process.cwd(), fullDataPath)}`));
    
    // Export summary report
    const summaryPath = `${exportBase}-summary.md`;
    fs.writeFileSync(summaryPath, generateSummaryReport(discoveries, platform.state.statistics, costTracking));
    console.log(chalk.gray(`  • Summary: ${path.relative(process.cwd(), summaryPath)}`));
    
    // Export queries
    if (discoveries.queries && discoveries.queries.length > 0) {
      const queriesPath = `${exportBase}-queries.json`;
      fs.writeFileSync(queriesPath, JSON.stringify(discoveries.queries, null, 2));
      console.log(chalk.gray(`  • Queries: ${path.relative(process.cwd(), queriesPath)}`));
    }
    
    // Export insights and recommendations
    if (discoveries.insights && discoveries.insights.length > 0) {
      const insightsPath = `${exportBase}-insights.json`;
      fs.writeFileSync(insightsPath, JSON.stringify({
        insights: discoveries.insights,
        recommendations: discoveries.recommendations || []
      }, null, 2));
      console.log(chalk.gray(`  • Insights: ${path.relative(process.cwd(), insightsPath)}`));
    }
    
    // Dashboard creation
    if (discoveries.dashboardUrl) {
      console.log(chalk.bold.green(`\n🎯 Dashboard created successfully!`));
      console.log(chalk.white(`   ${discoveries.dashboardUrl}\n`));
    } else if (options.dashboard && !options.dryRun && !options.exportOnly) {
      console.log(chalk.yellow('\n⚠️  Dashboard creation was requested but failed'));
    }
    
    // Clean up progress file if successful
    if (!options.resume && fs.existsSync(config.progressFile)) {
      fs.unlinkSync(config.progressFile);
    }
    
    console.log(chalk.bold.green('\n✨ Discovery pipeline completed successfully!\n'));
    
  } catch (error) {
    spinner.fail(chalk.red('Discovery failed'));
    console.error(chalk.red('\n❌ Error:'), error.message);
    if (error.stack && process.env.DEBUG) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}

function generateSummaryReport(discoveries, statistics, costTracking) {
  const report = [];
  
  report.push('# New Relic Data Discovery Report\n');
  report.push(`**Generated**: ${new Date().toISOString()}`);
  report.push(`**Account ID**: ${discoveries.accountId || 'Unknown'}`);
  report.push(`**Duration**: ${(statistics.processingTime / 1000).toFixed(1)}s\n`);
  
  report.push('## Executive Summary\n');
  report.push(`This report summarizes the comprehensive data discovery performed on your New Relic account. `);
  report.push(`We discovered **${discoveries.eventTypes.length} event types** containing **${statistics.dataPointsDiscovered.toLocaleString()} unique data points**.\n`);
  
  report.push('## Data Sources\n');
  report.push('### Event Types');
  discoveries.eventTypes
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 20)
    .forEach((et, i) => {
      report.push(`${i + 1}. **${et.name}**: ${et.volume.toLocaleString()} events, ${Object.keys(et.attributes || {}).length} attributes`);
    });
  
  if (discoveries.metrics && discoveries.metrics.length > 0) {
    report.push('\n### Metrics');
    discoveries.metrics.forEach(group => {
      report.push(`- **${group.name}**: ${group.totalMetrics} metrics (${group.analyzedMetrics} analyzed)`);
    });
  }
  
  if (discoveries.traces) {
    report.push('\n### Distributed Tracing');
    report.push(`- **Services**: ${discoveries.traces.services?.length || 0}`);
    report.push(`- **Operations**: ${discoveries.traces.operations?.length || 0}`);
    report.push(`- **Error Patterns**: ${discoveries.traces.errorPatterns?.length || 0}`);
  }
  
  if (discoveries.logs) {
    report.push('\n### Logs');
    report.push(`- **Log Events**: ${discoveries.logs.statistics?.logCount?.toLocaleString() || 0}`);
    report.push(`- **Services**: ${discoveries.logs.statistics?.serviceCount || 0}`);
    report.push(`- **Hosts**: ${discoveries.logs.statistics?.hostCount || 0}`);
  }
  
  report.push('\n## Key Insights\n');
  discoveries.insights?.slice(0, 10).forEach((insight, i) => {
    report.push(`${i + 1}. **${insight.title}**`);
    report.push(`   ${insight.description}`);
    if (insight.impact) report.push(`   *Impact*: ${insight.impact}`);
    report.push('');
  });
  
  report.push('## Recommendations\n');
  discoveries.recommendations?.slice(0, 10).forEach((rec, i) => {
    report.push(`${i + 1}. **${rec.title}** *(${rec.priority} priority)*`);
    report.push(`   ${rec.description}`);
    if (rec.expectedBenefit) report.push(`   *Expected Benefit*: ${rec.expectedBenefit}`);
    report.push('');
  });
  
  report.push('## Performance Metrics\n');
  report.push(`- **Total Queries**: ${statistics.queriesExecuted}`);
  report.push(`- **Failed Queries**: ${statistics.queriesFailed}`);
  report.push(`- **Cache Hit Rate**: ${((statistics.cacheHits / statistics.queriesExecuted) * 100).toFixed(1)}%`);
  report.push(`- **Query Distribution**:`);
  report.push(`  - Standard: ${statistics.queries_standard || 0}`);
  report.push(`  - NerdGraph: ${statistics.queries_nerdgraph || 0}`);
  report.push(`  - Async: ${statistics.queries_async || 0}`);
  
  report.push('\n## Cost Analysis\n');
  report.push(`- **Total Estimated Cost**: $${costTracking.totalEstimatedCost.toFixed(2)}`);
  report.push(`- **Average Cost per Query**: $${(costTracking.totalEstimatedCost / costTracking.totalQueries).toFixed(4)}`);
  report.push(`- **Cost by Category**:`);
  Object.entries(costTracking.costByCategory || {}).forEach(([category, cost]) => {
    report.push(`  - ${category}: $${cost.toFixed(2)}`);
  });
  
  if (discoveries.dashboardUrl) {
    report.push('\n## Generated Dashboard\n');
    report.push(`A comprehensive dashboard has been created to visualize your discovered data:`);
    report.push(`**URL**: ${discoveries.dashboardUrl}`);
  }
  
  report.push('\n---\n');
  report.push('*This report was generated by the New Relic Discovery Platform*');
  
  return report.join('\n');
}

// Run the main function
main().catch(error => {
  console.error(chalk.red('\n❌ Fatal error:'), error);
  process.exit(1);
});