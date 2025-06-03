# DashBuilder Streamlining Plan

## Current State Analysis

The DashBuilder project has grown organically with multiple overlapping implementations:
- 5 different dashboard builders
- 5 separate package.json files
- 25+ experimental scripts
- Duplicate discovery mechanisms
- Scattered documentation

## Proposed New Structure

```
DashBuilder-main/
├── src/                     # Core library source
│   ├── core/               # Core functionality
│   │   ├── DashboardBuilder.js
│   │   ├── QueryBuilder.js
│   │   ├── MetricDiscovery.js
│   │   └── LayoutOptimizer.js
│   ├── services/           # Service layer
│   │   ├── NerdGraphClient.js
│   │   ├── NRQLService.js
│   │   └── DashboardService.js
│   ├── utils/              # Utilities
│   │   ├── validators.js
│   │   ├── logger.js
│   │   └── rateLimiter.js
│   └── index.js           # Main export
├── cli/                    # CLI tools
│   ├── dashbuilder.js     # Main CLI
│   └── commands/          # CLI commands
├── examples/              # Example usage
│   ├── basic-dashboard.js
│   ├── kafka-monitoring.js
│   └── advanced-patterns.js
├── tests/                 # All tests
├── docs/                  # Consolidated documentation
├── package.json          # Single package.json
├── README.md            # Updated README
└── CHANGELOG.md         # Version history

```

## Consolidation Steps

### Phase 1: Core Library Consolidation
1. Merge the 5 dashboard builders into a single, configurable `DashboardBuilder` class
2. Extract common patterns from discovery scripts into `MetricDiscovery` service
3. Consolidate NRQL utilities into unified `NRQLService`

### Phase 2: Dependency Cleanup
1. Merge all package.json files into root package.json
2. Remove duplicate dependencies
3. Delete all nested node_modules directories

### Phase 3: Script Migration
1. Move production-ready scripts to appropriate src/ directories
2. Move experimental scripts to examples/
3. Delete redundant implementations

### Phase 4: Documentation Update
1. Create single, comprehensive README
2. Generate API documentation
3. Create migration guide for existing users

## Benefits

1. **60-70% code reduction** through deduplication
2. **Single source of truth** for each functionality
3. **Clearer API** with consistent interfaces
4. **Easier maintenance** with organized structure
5. **Better testing** with consolidated test suite

## Migration Impact

- Existing scripts using the old structure will need updates
- Import paths will change
- Some experimental features may be deprecated

## Timeline

- Phase 1: 2 hours
- Phase 2: 1 hour  
- Phase 3: 2 hours
- Phase 4: 1 hour

Total estimated time: 6 hours