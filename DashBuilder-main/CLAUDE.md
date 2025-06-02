# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DashBuilder is a focused library for building New Relic dashboards and NRQL queries programmatically. It provides tools for dashboard generation, NRQL query building, and visual query interfaces.

## Core Components

1. **Dashboard Generator**: Located in `/dashboard-generator/` - Core engine for creating dashboards
2. **NRQL Services**: Query building, validation, and optimization
3. **Visual Query Builder**: Frontend components for interactive query creation
4. **CLI Tools**: Command-line interfaces for dashboard and query management

## Development Notes
- Focus on dashboard creation and NRQL query functionality
- Keep the codebase lean and focused on core features
- Prioritize ease of use and clear documentation

## Key Commands

### Dashboard Creation
```bash
# Create dashboard from template
./dashboard-generator/cli/dashgen.js create --template ./dashboards/kpi-dashboard.json

# Validate dashboard
node scripts/dashboard-comprehensive-validator.js

# Deploy dashboard
node scripts/dashboard-deploy-manual.js
```

### NRQL Tools
```bash
# Validate NRQL query
./scripts/unified-dashboard-cli.js validate-query "SELECT count(*) FROM Transaction"

# Discover metrics
./scripts/src/cli.js schema discover --type metrics

# Find specific metrics
node scripts/find-metrics.js
```