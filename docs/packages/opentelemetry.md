# @kishkindhalabs/hanumate-opentelemetry

OpenTelemetry integration for tracing and metrics.

## Installation

```bash
npm install @kishkindhalabs/hanumate-opentelemetry
```

## Setup

```typescript
import { initTelemetry } from '@kishkindhalabs/hanumate-opentelemetry';

// Initialize with your OTLP endpoint
initTelemetry({
  serviceName: 'my-hanumate-agent',
  otlpEndpoint: 'http://localhost:4318',
  enabled: true
});
```

## Configuration

```typescript
import { initTelemetry, type TelemetryConfig } from '@kishkindhalabs/hanumate-opentelemetry';

const config: TelemetryConfig = {
  serviceName: 'hanumate-agent',
  serviceVersion: '1.0.0',
  otlpEndpoint: process.env.OTLP_ENDPOINT,
  enabled: process.env.NODE_ENV === 'production',
  
  // Optional: Sampling
  samplingRatio: 0.1,  // 10% of traces
  
  // Optional: Custom attributes
  attributes: {
    environment: 'production',
    team: 'platform'
  }
};

initTelemetry(config);
```

## Automatic Traces

Once initialized, all agent operations are automatically traced:

- Agent creation
- Session creation
- Prompt execution
- Tool calls (shell, filesystem)
- Error handling

## Custom Spans

Add custom spans to your code:

```typescript
import { tracer } from '@kishkindhalabs/hanumate-opentelemetry';

const span = tracer.startSpan('my-operation');

try {
  // Your code
  await doSomething();
  span.setStatus({ code: SpanStatusCode.OK });
} catch (error) {
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR });
} finally {
  span.end();
}
```

## Metrics

Access built-in metrics:

```typescript
import { metrics } from '@kishkindhalabs/hanumate-opentelemetry';

// Counter
metrics.counter('agent.prompts').add(1);

// Gauge
metrics.gauge('agent.active_sessions').set(5);

// Histogram
metrics.histogram('agent.prompt.duration').record(durationMs);
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OTLP_ENDPOINT` | OTLP collector endpoint |
| `OTEL_SERVICE_NAME` | Service name |
| `OTEL_EXPORTER_OTLP_HEADERS` | Custom headers |