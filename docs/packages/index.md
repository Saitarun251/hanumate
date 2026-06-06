# Packages

Hanumate is organized as a monorepo with 5 npm packages:

## All Packages

| Package | Install | Description |
|---------|---------|-------------|
| `@hanumateharness/all` | `npm install @hanumateharness/all` | All packages bundled |
| `@hanumateharness/runtime` | `npm install @hanumateharness/runtime` | Core framework |
| `@hanumateharness/cli` | `npm install @hanumateharness/cli` | CLI tool |
| `@hanumateharness/sdk` | `npm install @hanumateharness/sdk` | TypeScript SDK |
| `@hanumateharness/opentelemetry` | `npm install @hanumateharness/opentelemetry` | Observability |

## Which Package Do I Need?

### For Code Generation Only

```bash
npm install @hanumateharness/runtime
```

### For CLI Work Management

```bash
npm install @hanumateharness/cli
```

### For Everything

```bash
npm install @hanumateharness/all
```

## Package Details

- [Runtime](/packages/runtime) — Core agent engine
- [CLI](/packages/cli) — Command-line tools
- [SDK](/packages/sdk) — TypeScript SDK
- [OpenTelemetry](/packages/opentelemetry) — Observability