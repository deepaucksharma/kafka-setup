#!/bin/bash

# Script to deploy the Kafka Share Groups dashboard to New Relic
# Requires: NEW_RELIC_API_KEY and NEW_RELIC_ACCOUNT_ID environment variables

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check for required environment variables
if [ -z "$NEW_RELIC_API_KEY" ]; then
    echo -e "${RED}Error: NEW_RELIC_API_KEY environment variable is not set${NC}"
    echo "Export it with: export NEW_RELIC_API_KEY=your_api_key"
    exit 1
fi

if [ -z "$NEW_RELIC_ACCOUNT_ID" ]; then
    echo -e "${RED}Error: NEW_RELIC_ACCOUNT_ID environment variable is not set${NC}"
    echo "Export it with: export NEW_RELIC_ACCOUNT_ID=your_account_id"
    exit 1
fi

# Dashboard file
DASHBOARD_FILE="kafka-sharegroups-complete-dashboard.json"

if [ ! -f "$DASHBOARD_FILE" ]; then
    echo -e "${RED}Error: Dashboard file not found: $DASHBOARD_FILE${NC}"
    exit 1
fi

# Read dashboard JSON
DASHBOARD_JSON=$(cat "$DASHBOARD_FILE")

# Add accountId to the dashboard JSON
DASHBOARD_JSON=$(echo "$DASHBOARD_JSON" | jq --arg accountId "$NEW_RELIC_ACCOUNT_ID" '. + {accountId: ($accountId | tonumber)}')

# Add accountIds to all queries
DASHBOARD_JSON=$(echo "$DASHBOARD_JSON" | jq --arg accountId "$NEW_RELIC_ACCOUNT_ID" '
  .pages[].widgets[].configuration.nrqlQueries[]?.accountIds = [($accountId | tonumber)] |
  .variables[]?.nrqlQuery.accountIds = [($accountId | tonumber)]
')

# Create the GraphQL mutation
MUTATION=$(cat <<EOF
{
  "query": "mutation CreateDashboard(\$dashboard: DashboardInput!) { dashboardCreate(dashboard: \$dashboard, accountId: $NEW_RELIC_ACCOUNT_ID) { entityResult { guid name } errors { description } } }",
  "variables": {
    "dashboard": $DASHBOARD_JSON
  }
}
EOF
)

echo -e "${BLUE}📊 Creating dashboard in New Relic...${NC}"

# Make the API call
RESPONSE=$(curl -s -X POST https://api.newrelic.com/graphql \
  -H "Content-Type: application/json" \
  -H "API-Key: $NEW_RELIC_API_KEY" \
  -d "$MUTATION")

# Check for errors
if echo "$RESPONSE" | jq -e '.errors' > /dev/null 2>&1; then
    echo -e "${RED}❌ Error creating dashboard:${NC}"
    echo "$RESPONSE" | jq '.errors'
    exit 1
fi

# Extract dashboard GUID and name
DASHBOARD_GUID=$(echo "$RESPONSE" | jq -r '.data.dashboardCreate.entityResult.guid')
DASHBOARD_NAME=$(echo "$RESPONSE" | jq -r '.data.dashboardCreate.entityResult.name')

if [ "$DASHBOARD_GUID" != "null" ]; then
    echo -e "${GREEN}✅ Dashboard created successfully!${NC}"
    echo -e "${GREEN}   Name: $DASHBOARD_NAME${NC}"
    echo -e "${GREEN}   GUID: $DASHBOARD_GUID${NC}"
    echo ""
    echo -e "${BLUE}🔗 View your dashboard at:${NC}"
    echo -e "   https://one.newrelic.com/redirect/entity/$DASHBOARD_GUID"
else
    echo -e "${RED}❌ Failed to create dashboard${NC}"
    echo "$RESPONSE" | jq '.'
    exit 1
fi

# Generate NRQL queries file for reference
echo -e "${BLUE}📝 Generating NRQL queries reference...${NC}"

cat > nrql-queries.md << 'EOF'
# NRQL Queries for Kafka Share Groups Monitoring

## QueueSample Events (from Custom OHI)

### Basic Queries
```sql
-- All QueueSample events
FROM QueueSample 
SELECT * 
WHERE provider = 'kafka' 
SINCE 10 minutes ago

-- Unacknowledged messages by share group
FROM QueueSample 
SELECT latest(queue.size) 
WHERE provider = 'kafka' 
FACET share.group.name

-- Message processing age
FROM QueueSample 
SELECT max(oldest.message.age.seconds) 
WHERE provider = 'kafka' 
FACET share.group.name, topic.name
```

## Share Group Metrics (from Prometheus)

### Prometheus Metrics via nri-flex
```sql
-- Unacked records
FROM Metric 
SELECT latest(kafka_sharegroup_records_unacked) 
WHERE cluster = 'kafka-k8s-cluster' 
FACET group, topic, partition

-- Processing delays
FROM Metric 
SELECT latest(kafka_sharegroup_oldest_unacked_ms) / 1000 as 'Delay (sec)' 
WHERE cluster = 'kafka-k8s-cluster' 
FACET group, topic

-- Throughput
FROM Metric 
SELECT rate(sum(kafka_sharegroup_records_acknowledged), 1 minute) 
WHERE cluster = 'kafka-k8s-cluster' 
FACET group
```

## Traditional Kafka Metrics (from nri-kafka)

### Broker Metrics
```sql
-- Network throughput
FROM KafkaBrokerSample 
SELECT average(broker.bytesInPerSecond), average(broker.bytesOutPerSecond) 
WHERE clusterName = 'kafka-k8s-cluster' 
TIMESERIES

-- Consumer lag
FROM KafkaBrokerSample 
SELECT average(consumer.lag) 
WHERE clusterName = 'kafka-k8s-cluster' 
FACET consumerGroup, topic
```

## Zero Lag Fallacy Detection

```sql
-- Compare traditional lag vs actual unacked messages
FROM KafkaBrokerSample, QueueSample 
SELECT 
  latest(consumer.lag) as 'Traditional Lag',
  latest(queue.size) as 'Actual Unacked' 
WHERE consumer.group.name = share.group.name 
FACET consumer.group.name
```

## Alert Conditions

```sql
-- High unacknowledged messages (Warning: 500, Critical: 1000)
FROM QueueSample 
SELECT sum(queue.size) 
WHERE provider = 'kafka' 
FACET share.group.name

-- Old messages (Warning: 120s, Critical: 300s)  
FROM QueueSample 
SELECT max(oldest.message.age.seconds) 
WHERE provider = 'kafka' 
FACET share.group.name

-- Stalled processing (Critical: 0 msgs/min)
FROM QueueSample 
SELECT rate(sum(messages.acknowledged), 1 minute) 
WHERE provider = 'kafka' 
FACET share.group.name
```
EOF

echo -e "${GREEN}✅ Created nrql-queries.md with example queries${NC}"