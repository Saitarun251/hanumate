# Hook Commands

Hooks are the persistent work queue in Hanumate.

## Create Hook

```bash
hanumate hook create --title="Fix login bug" --type=bug --priority=P1
```

## List Hooks

```bash
# All hooks
hanumate hook list

# Filter by status
hanumate hook list --status=open
hanumate hook list --status=assigned
hanumate hook list --status=done
```

## Assign Hook

```bash
# Assign to agent
hanumate hook assign hk-abc123 agent-coder-1

# Unassign
hanumate hook unassign hk-abc123
```

## Check Hook Status

```bash
hanumate hook status hk-abc123
```

## Hook Properties

- **hk-xxxxx** — Unique hook ID
- **title** — Work description
- **type** — bug, feature, chore, refactor
- **priority** — P1, P2, P3, P4
- **status** — open, assigned, in_progress, done
- **assignee** — Agent ID

## Integration with Beads

Hooks automatically create beads:

```bash
# Hook creates a bead
hanumate hook create --title="API endpoint" --type=feature
# Creates: hk-abc123 and rd-def456
```