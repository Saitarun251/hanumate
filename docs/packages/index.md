# Packages

Hanumate is organized as a monorepo with 5 npm packages:

## All Packages

| Package | Install | Description |
|---------|---------|-------------|
| `@kishkindhalabs/hanumate-all` | `npm install @kishkindhalabs/hanumate-all` | All packages bundled |
| `@kishkindhalabs/hanumate-runtime` | `npm install @kishkindhalabs/hanumate-runtime` | Core framework |
| `@kishkindhalabs/hanumate-cli` | `npm install @kishkindhalabs/hanumate-cli` | CLI tool |
| `@kishkindhalabs/hanumate-sdk` | `npm install @kishkindhalabs/hanumate-sdk` | TypeScript SDK |
| `@kishkindhalabs/hanumate-opentelemetry` | `npm install @kishkindhalabs/hanumate-opentelemetry` | Observability |

## Which Package Do I Need?

### For Code Generation Only

```bash
npm install @kishkindhalabs/hanumate-runtime
```

### For CLI Work Management

```bash
npm install @kishkindhalabs/hanumate-cli
```

### For Everything

```bash
npm install @kishkindhalabs/hanumate-all
```

## Package Details

- [Runtime](/packages/runtime) — Core agent engine
- [CLI](/packages/cli) — Command-line tools
- [SDK](/packages/sdk) — TypeScript SDK
- [OpenTelemetry](/packages/opentelemetry) — Observability