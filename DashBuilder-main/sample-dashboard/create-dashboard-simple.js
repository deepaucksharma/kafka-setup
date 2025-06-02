#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load environment variables from parent .env file
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Configuration from .env
const API_KEY = process.env.UKEY;
const ACCOUNT_ID = process.env.ACC;

if (!API_KEY || !ACCOUNT_ID) {
  console.error('❌ Missing required environment variables');
  console.error('Please ensure UKEY and ACC are set in ../.env file');
  process.exit(1);
}

// Load dashboard template
const templatePath = path.join(__dirname, 'sample-dashboard.json');
const dashboardTemplate = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

// Replace placeholders
const dashboardJson = JSON.parse(
  JSON.stringify(dashboardTemplate)
    .replace(/YOUR_ACCOUNT_ID/g, ACCOUNT_ID)
    .replace(/YOUR_APP_NAME/g, 'SampleApp')
    .replace(/YOUR_HOST_PATTERN/g, 'sample-')
);

// Add timestamp to make it unique
dashboardJson.name = `${dashboardJson.name} - ${new Date().toISOString().split('T')[0]}`;

// GraphQL mutation to create dashboard
const mutation = `
  mutation CreateDashboard($accountId: Int!, $dashboard: DashboardInput!) {
    dashboardCreate(accountId: $accountId, dashboard: $dashboard) {
      entityResult {
        guid
        name
        permalink
      }
      errors {
        description
        type
      }
    }
  }
`;

const payload = JSON.stringify({
  query: mutation,
  variables: {
    accountId: parseInt(ACCOUNT_ID),
    dashboard: dashboardJson
  }
});

const options = {
  hostname: 'api.newrelic.com',
  path: '/graphql',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'API-Key': API_KEY,
    'Content-Length': Buffer.byteLength(payload)
  }
};

console.log('🚀 Creating dashboard...');
console.log(`📊 Account ID: ${ACCOUNT_ID}`);
console.log(`📝 Dashboard Name: ${dashboardJson.name}`);

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      
      if (response.errors) {
        console.error('❌ GraphQL errors:', response.errors);
        process.exit(1);
      }
      
      const result = response.data?.dashboardCreate;
      
      if (result?.errors && result.errors.length > 0) {
        console.error('❌ Dashboard creation errors:');
        result.errors.forEach(err => {
          console.error(`   - ${err.type}: ${err.description}`);
        });
        process.exit(1);
      }
      
      if (result?.entityResult) {
        console.log('✅ Dashboard created successfully!');
        console.log(`📊 Dashboard Name: ${result.entityResult.name}`);
        console.log(`🔗 Dashboard URL: ${result.entityResult.permalink}`);
        console.log(`🆔 Dashboard GUID: ${result.entityResult.guid}`);
        
        // Save result
        const outputPath = path.join(__dirname, 'dashboard-result.json');
        fs.writeFileSync(outputPath, JSON.stringify(result.entityResult, null, 2));
        console.log(`💾 Result saved to: ${outputPath}`);
      } else {
        console.error('❌ Unexpected response structure');
        console.error(JSON.stringify(response, null, 2));
      }
    } catch (error) {
      console.error('❌ Error parsing response:', error.message);
      console.error('Response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request error:', error.message);
});

req.write(payload);
req.end();