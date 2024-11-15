# K6 Load Testing Guide

This guide explains how to set up and run load tests using k6 for the Food Ordering System API.

## Prerequisites

1. Install k6
   ```bash
   # MacOS
   brew install k6

   # Windows (using Chocolatey)
   choco install k6

   # Docker
   docker pull grafana/k6
   ```

2. System Requirements
   - Node.js v14+ (for any local dependencies)
   - Compatible Operating System (Windows, MacOS, or Linux)
   - Minimum 4GB RAM recommended for large-scale tests

## Test Configuration

The test suite includes several testing scenarios:

1. **Smoke Test**
   - 1 virtual user
   - Duration: 1 minute
   - Used for basic functionality verification

2. **Load Test**
   - Ramps up to 50 users
   - Duration: 20 minutes total
   - Simulates expected normal load

3. **Stress Test**
   - Ramps up to 80 RPS
   - Duration: 14 minutes total
   - Tests system under high load

4. **Soak Test**
   - 30 constant users
   - Duration: 2 hours
   - Tests system stability over time

## Running the Tests

### Basic Usage

```bash
# Run default scenario (smoke test)
k6 run script.js

# Run specific scenario
k6 run --tag scenario=smoke script.js    # Smoke test
k6 run --tag scenario=load script.js     # Load test
k6 run --tag scenario=stress script.js   # Stress test
k6 run --tag scenario=soak script.js     # Soak test
```

### Environment Variables

You can configure the test environment using environment variables:

```bash
# Set base URL
export K6_BASE_URL=http://localhost:8765

# Run with environment variables
k6 run -e BASE_URL=$K6_BASE_URL script.js
```

### Test Data

The test uses the following test account:
```
Email: testcus1@mail.com
Password: testcus1
```

## Test Flow

The test simulates a user journey with the following steps:

1. User Authentication (Login)
2. Get Restaurant List
3. Create Group Food Order
4. Process Payment

## Metrics and Thresholds

The test monitors the following metrics:

- `http_req_duration`: 95% of requests should complete within 500ms
- `http_req_failed`: Less than 1% of requests should fail
- `errors`: Custom error rate should be less than 5%

## Output and Results

Test results include:

- Response time metrics
- Error rates
- Request counts
- Custom metrics

Example output:
```
     data_received........: 1.2 MB 124 kB/s
     data_sent............: 180 kB 18 kB/s
     http_req_blocked.....: avg=1.12ms   min=0s med=1.11ms   max=12.21ms p(95)=2.31ms
     http_req_duration....: avg=127.33ms min=0s med=123.45ms max=321.78ms p(95)=198.45ms
     http_reqs............: 1200   120.343443/s
```

## Troubleshooting

Common issues and solutions:

1. Connection Errors
   ```
   Error: connection refused
   ```
   - Check if the API server is running
   - Verify the BASE_URL is correct

2. Authentication Failures
   ```
   Error: login failed
   ```
   - Verify test account credentials
   - Check if the authentication service is running

3. Rate Limiting
   ```
   Error: too many requests
   ```
   - Reduce the number of virtual users
   - Add appropriate sleep times between requests

## Additional Options

### Running with Docker

```bash
docker run -i grafana/k6 run - <script.js

# Mount local script
docker run -v $PWD:/scripts grafana/k6 run /scripts/script.js
```

### Exporting Results

```bash
# Export to JSON
k6 run --out json=results.json script.js

# Export to CSV
k6 run --out csv=results.csv script.js
```

### Real-time Metrics

To view metrics in real-time:

1. Using InfluxDB + Grafana:
   ```bash
   k6 run --out influxdb=http://localhost:8086/k6 script.js
   ```

2. Using Prometheus:
   ```bash
   k6 run --out prometheus script.js
   ```

## Best Practices

1. Always start with smoke tests
2. Gradually increase load
3. Monitor system resources
4. Use appropriate think times
5. Clean up test data after runs

## Support

For issues or questions:
1. Check the k6 documentation: https://k6.io/docs/
2. Review API documentation
3. Contact the development team

