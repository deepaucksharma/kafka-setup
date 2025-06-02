#!/usr/bin/env node

/**
 * Sample Dashboard Generator
 * This script demonstrates how to use DashBuilder to create a New Relic dashboard
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import the dashboard generator
const DashboardGenerator = require('../dashboard-generator');

// Map the .env variables to expected format
const config = {
  apiKey: process.env.UKEY,
  accountId: process.env.ACC,
  queryKey: process.env.QKey || process.env.UKEY
};

async function generateDashboard() {
  try {
    console.log('🚀 Starting dashboard generation...');
    console.log(`📊 Account ID: ${config.accountId}`);
    
    // Initialize the dashboard generator
    const generator = new DashboardGenerator(config);
    
    // Load the sample dashboard template
    const templatePath = path.join(__dirname, 'sample-dashboard.json');
    const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    
    // Replace placeholders in the template
    const dashboardConfig = JSON.parse(
      JSON.stringify(template)
        .replace(/YOUR_ACCOUNT_ID/g, config.accountId)
        .replace(/YOUR_APP_NAME/g, 'SampleApp')
        .replace(/YOUR_HOST_PATTERN/g, 'sample-')
    );
    
    // Add timestamp to dashboard name to make it unique
    dashboardConfig.name = `${dashboardConfig.name} - ${new Date().toISOString().split('T')[0]}`;
    
    console.log(`📝 Creating dashboard: ${dashboardConfig.name}`);
    
    // Generate the dashboard
    const result = await generator.createDashboard(dashboardConfig);
    
    if (result.success) {
      console.log('✅ Dashboard created successfully!');
      console.log(`🔗 Dashboard URL: https://one.newrelic.com/dashboards/${result.dashboardId}`);
      console.log(`📊 Dashboard GUID: ${result.dashboardGuid}`);
      
      // Save the result for reference
      const outputPath = path.join(__dirname, 'generated-dashboard-result.json');
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`💾 Result saved to: ${outputPath}`);
    } else {
      console.error('❌ Failed to create dashboard:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Error generating dashboard:', error.message);
    if (error.response) {
      console.error('API Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Add a helper function to validate configuration
function validateConfig() {
  const required = ['apiKey', 'accountId'];
  const missing = required.filter(key => !config[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required configuration:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\n📝 Please check your .env file contains:');
    console.error('   UKEY=your-api-key');
    console.error('   ACC=your-account-id');
    process.exit(1);
  }
}

// Main execution
(async () => {
  console.log('📋 DashBuilder Sample Dashboard Generator\n');
  
  validateConfig();
  await generateDashboard();
})();