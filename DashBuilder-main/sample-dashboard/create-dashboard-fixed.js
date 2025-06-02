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

// Dashboard with correct format
const dashboard = {
  "name": `Sample Application Dashboard - ${new Date().toISOString().split('T')[0]}`,
  "description": "Comprehensive monitoring dashboard for application performance and health",
  "permissions": "PUBLIC_READ_WRITE",
  "pages": [
    {
      "name": "Overview",
      "description": "Application health and performance overview",
      "widgets": [
        {
          "title": "Application Response Time",
          "visualization": {
            "id": "viz.line"
          },
          "layout": {
            "column": 1,
            "row": 1,
            "height": 3,
            "width": 4
          },
          "rawConfiguration": {
            "nrqlQueries": [
              {
                "accountId": parseInt(ACCOUNT_ID),
                "query": "SELECT average(duration) FROM Transaction WHERE appName = 'SampleApp' TIMESERIES AUTO"
              }
            ]
          }
        },
        {
          "title": "Throughput (RPM)",
          "visualization": {
            "id": "viz.line"
          },
          "layout": {
            "column": 5,
            "row": 1,
            "height": 3,
            "width": 4
          },
          "rawConfiguration": {
            "nrqlQueries": [
              {
                "accountId": parseInt(ACCOUNT_ID),
                "query": "SELECT rate(count(*), 1 minute) FROM Transaction WHERE appName = 'SampleApp' TIMESERIES AUTO"
              }
            ]
          }
        },
        {
          "title": "Error Rate",
          "visualization": {
            "id": "viz.billboard"
          },
          "layout": {
            "column": 9,
            "row": 1,
            "height": 3,
            "width": 4
          },
          "rawConfiguration": {
            "nrqlQueries": [
              {
                "accountId": parseInt(ACCOUNT_ID),
                "query": "SELECT percentage(count(*), WHERE error IS true) AS 'Error Rate' FROM Transaction WHERE appName = 'SampleApp' SINCE 1 hour ago"
              }
            ],
            "thresholds": [
              {
                "alertSeverity": "WARNING",
                "value": 1
              },
              {
                "alertSeverity": "CRITICAL",
                "value": 5
              }
            ]
          }
        },
        {
          "title": "Top 5 Transactions by Time",
          "visualization": {
            "id": "viz.table"
          },
          "layout": {
            "column": 1,
            "row": 4,
            "height": 3,
            "width": 6
          },
          "rawConfiguration": {
            "nrqlQueries": [
              {
                "accountId": parseInt(ACCOUNT_ID),
                "query": "SELECT average(duration) AS 'Avg Duration (ms)', count(*) AS 'Count' FROM Transaction WHERE appName = 'SampleApp' FACET name LIMIT 5 SINCE 1 hour ago"
              }
            ]
          }
        },
        {
          "title": "Database Query Performance",
          "visualization": {
            "id": "viz.line"
          },
          "layout": {
            "column": 7,
            "row": 4,
            "height": 3,
            "width": 6
          },
          "rawConfiguration": {
            "nrqlQueries": [
              {
                "accountId": parseInt(ACCOUNT_ID),
                "query": "SELECT average(databaseDuration) AS 'DB Time', average(duration) AS 'Total Time' FROM Transaction WHERE appName = 'SampleApp' AND databaseDuration IS NOT NULL TIMESERIES AUTO"
              }
            ]
          }
        }
      ]
    },
    {
      "name": "Infrastructure",
      "description": "Server and infrastructure metrics",
      "widgets": [
        {
          "title": "CPU Usage %",
          "visualization": {
            "id": "viz.line"
          },
          "layout": {
            "column": 1,
            "row": 1,
            "height": 3,
            "width": 6
          },
          "rawConfiguration": {
            "nrqlQueries": [
              {
                "accountId": parseInt(ACCOUNT_ID),
                "query": "SELECT average(cpuPercent) FROM SystemSample WHERE hostname LIKE '%sample-%' TIMESERIES AUTO"
              }
            ]
          }
        },
        {
          "title": "Memory Usage %",
          "visualization": {
            "id": "viz.line"
          },
          "layout": {
            "column": 7,
            "row": 1,
            "height": 3,
            "width": 6
          },
          "rawConfiguration": {
            "nrqlQueries": [
              {
                "accountId": parseInt(ACCOUNT_ID),
                "query": "SELECT average(memoryUsedPercent) FROM SystemSample WHERE hostname LIKE '%sample-%' TIMESERIES AUTO"
              }
            ]
          }
        }
      ]
    }
  ]
};

// GraphQL mutation to create dashboard
const mutation = `
  mutation CreateDashboard($accountId: Int!, $dashboard: DashboardInput!) {
    dashboardCreate(accountId: $accountId, dashboard: $dashboard) {
      entityResult {
        guid
        name
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
    dashboard: dashboard
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
console.log(`📝 Dashboard Name: ${dashboard.name}`);

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
        console.log(`🆔 Dashboard GUID: ${result.entityResult.guid}`);
        console.log(`🔗 Dashboard URL: https://one.newrelic.com/dashboards/detail/${result.entityResult.guid}`);
        
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