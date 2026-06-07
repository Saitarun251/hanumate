# Bead Commands

Beads are git-backed issues with unique IDs.

## Create Bead

```bash
hanumate bead create --title="Add user auth" --type=feature --priority=P1
```

## List Beads

```bash
# All beads
hanumate bead list

# Filter by status
hanumate bead list --status=open
hanumate bead list --status=in_progress
hanumate bead list --status=closed

# Filter by type
hanumate bead list --type=bug
hanumate bead list --type=feature
```

## Show Bead

```bash
hanumate bead show rd-xyz789
```

## Update Bead

```bash
# Update status
hanumate bead update rd-xyz789 --status=in_progress

# Update priority
hanumate bead update rd-xyz789 --priority=P2

# Add description
hanumate bead update rd-xyz789 --description="Added OAuth support"
```

## Close Bead

```bash
hanumate bead close rd-xyz789
```

## Bead Properties

| Property | Description |
|----------|-------------|
| `rd-xxxxx` | Unique ID |
| `title` | Issue title |
| `type` | bug, feature, chore, refactor |
| `priority` | P1, P2, P3, P4 |
| `status` | open, in_progress, closed |
| `created` | Creation timestamp |
| `updated` | Last update timestamp |

## Bead IDs

Bead IDs are globally unique and referenced across CLI commands:

```bash
# Add to convoy
hanumate convoy add cv-abc123 rd-xyz789

# Link to hook
hanumate hook link hk-abc123 rd-xyz789
```