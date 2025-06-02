# DashBuilder

**A focused library for building New Relic dashboards and NRQL queries programmatically**

[![New Relic](https://img.shields.io/badge/new%20relic-integrated-green.svg)](https://newrelic.com/)
[![License](https://img.shields.io/badge/license-MIT-brightgreen.svg)](LICENSE)

## 🚀 Quick Start

```bash
# Clone and setup
git clone https://github.com/your-org/dashbuilder.git
cd dashbuilder

# Configure environment (required)
cp .env.example .env
# Edit .env with your New Relic credentials:
# - NEW_RELIC_API_KEY (User API Key)
# - NEW_RELIC_ACCOUNT_ID

# Install
npm install
```

## 📋 Key Features

### 📊 Dashboard Generation
- **Programmatic Dashboard Creation**: Build complex dashboards using JavaScript
- **Template Engine**: Reusable dashboard templates
- **Layout Optimizer**: Automatic widget positioning
- **Metric Discovery**: Automatic metric detection from your account

### 🔍 NRQL Query Building
- **Visual Query Builder**: Interactive UI for building NRQL queries
- **Query Validation**: Real-time NRQL syntax validation
- **Auto-completion**: Smart suggestions for metrics and functions
- **Query Optimization**: Performance recommendations

### 🛠️ CLI Tools
- **Dashboard CLI**: Command-line dashboard management
- **NRQL CLI**: Test and validate queries from terminal
- **Schema Discovery**: Explore available metrics and attributes

## 📖 Usage Examples

### Create a Dashboard Programmatically

```javascript
const DashboardGenerator = require('./dashboard-generator');
const generator = new DashboardGenerator({
  apiKey: process.env.NEW_RELIC_API_KEY,
  accountId: process.env.NEW_RELIC_ACCOUNT_ID
});

const dashboard = await generator.create({
  name: 'Application Performance Dashboard',
  widgets: [
    {
      type: 'line',
      title: 'Response Time',
      query: 'SELECT average(duration) FROM Transaction TIMESERIES'
    },
    {
      type: 'billboard',
      title: 'Error Rate',
      query: 'SELECT percentage(count(*), WHERE error IS true) FROM Transaction'
    }
  ]
});
```

### Use the CLI

```bash
# Create a dashboard from JSON template
./dashboard-generator/cli/dashgen.js create --template ./dashboards/kpi-dashboard.json

# Validate NRQL queries
./scripts/unified-dashboard-cli.js validate-query "SELECT count(*) FROM Transaction"

# Discover available metrics
./scripts/src/cli.js schema discover --type metrics
```

### Visual Query Builder

```javascript
// Use in your web application
import { VisualQueryBuilder } from './frontend/visual-query-builder.js';

const builder = new VisualQueryBuilder({
  container: '#query-builder',
  accountId: YOUR_ACCOUNT_ID,
  onQueryChange: (nrql) => console.log('Generated NRQL:', nrql)
});
```

## 🏗️ Architecture

```
DashBuilder/
├── dashboard-generator/     # Core dashboard generation engine
│   ├── lib/                # Core libraries
│   ├── cli/                # CLI tools
│   └── api/                # REST API server (optional)
├── scripts/                # Utility scripts
│   └── src/               # Main source code
│       ├── services/      # API services
│       ├── commands/      # CLI commands
│       └── utils/         # Utilities
├── frontend/              # Frontend components
│   ├── visual-query-builder.js
│   └── dashboard-state-manager.js
└── shared-components/     # Reusable UI components
```

## 🔧 Configuration

Create a `.env` file with:

```env
NEW_RELIC_API_KEY=your-user-api-key
NEW_RELIC_ACCOUNT_ID=your-account-id
NEW_RELIC_QUERY_KEY=your-query-key (optional)
```

## 📚 Documentation

- [API Reference](docs/api-reference.md) - Detailed API documentation
- [Architecture Guide](docs/architecture.md) - System design and components
- [Migration Guide](docs/migration-from-v1.md) - Upgrading from v1

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## 📄 License

MIT License - see LICENSE file for details.