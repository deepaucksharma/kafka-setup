# Sample Dashboard Generator

This directory contains a complete example of how to use DashBuilder to create New Relic dashboards programmatically.

## Contents

- `sample-dashboard.json` - A template dashboard with common widgets
- `generate-dashboard.js` - Script that creates the dashboard in your New Relic account
- `.env.example` - Example environment variables (for reference)

## Prerequisites

The parent directory already contains a `.env` file with your New Relic credentials:
- `UKEY` - Your New Relic User API Key
- `ACC` - Your New Relic Account ID
- `QKey` - Your Query Key (optional, will use UKEY if not provided)

## Usage

1. **Review the dashboard template**
   ```bash
   cat sample-dashboard.json
   ```
   The template includes:
   - Application performance metrics (response time, throughput, error rate)
   - Infrastructure metrics (CPU, memory, disk, network)
   - Pre-configured layouts and visualizations

2. **Generate the dashboard**
   ```bash
   node generate-dashboard.js
   ```
   
   The script will:
   - Load your credentials from the parent `.env` file
   - Replace placeholders in the template with your account ID
   - Create the dashboard in your New Relic account
   - Provide a direct link to view the dashboard

3. **Check the results**
   After successful generation, you'll see:
   - Dashboard URL to view it in New Relic
   - Dashboard GUID for API operations
   - A `generated-dashboard-result.json` file with full details

## Customization

### Modify the Template

Edit `sample-dashboard.json` to customize:
- Widget queries (NRQL)
- Visualization types
- Layout positions
- Thresholds and alerts

### Change Application/Host Names

In `generate-dashboard.js`, modify these lines:
```javascript
.replace(/YOUR_APP_NAME/g, 'YourActualAppName')
.replace(/YOUR_HOST_PATTERN/g, 'your-host-prefix')
```

### Add More Widgets

Add widget objects to the `widgets` array in the template:
```json
{
  "title": "Custom Metric",
  "visualization": { "id": "viz.line" },
  "layout": { "column": 1, "row": 1, "height": 3, "width": 4 },
  "configuration": {
    "nrqlQueries": [{
      "accountId": "YOUR_ACCOUNT_ID",
      "query": "SELECT average(custom.metric) FROM CustomEvent TIMESERIES"
    }]
  }
}
```

## Common NRQL Examples

```sql
-- Application metrics
SELECT average(duration) FROM Transaction
SELECT percentage(count(*), WHERE error IS true) FROM Transaction
SELECT count(*) FROM Transaction FACET name

-- Infrastructure metrics
SELECT average(cpuPercent) FROM SystemSample
SELECT average(memoryUsedPercent) FROM SystemSample
SELECT average(diskUsedPercent) FROM SystemSample

-- Custom events
SELECT count(*) FROM YourCustomEvent
SELECT average(customAttribute) FROM YourCustomEvent TIMESERIES
```

## Troubleshooting

### Dashboard not created
- Check your API key has dashboard creation permissions
- Verify your account ID is correct
- Look for error details in the console output

### Queries returning no data
- Ensure the entity names match your actual applications/hosts
- Check that data exists for the time range
- Verify metric names are correct for your account

### API errors
- Rate limiting: Wait a minute and try again
- Authentication: Regenerate your API key in New Relic
- Permissions: Ensure your key has the required permissions

## Next Steps

1. Create multiple dashboard templates for different use cases
2. Build a library of reusable widget configurations
3. Automate dashboard creation as part of your deployment pipeline
4. Use the DashBuilder API to manage dashboards programmatically