# Bead Commands

Beads are git-backed issues with unique IDs.

## Create Bead

```bash
duck bead create --title="Add user auth" --type=feature --priority=P1
```

## List Beads

```bash
# All beads
duck bead list

# Filter by status
duck bead list --status=open
duck bead list --status=in_progress
duck bead list --status=closed

# Filter by type
duck bead list --type=bug
duck bead list --type=feature
```

## Show Bead

```bash
duck bead show rd-xyz789
```

## Update Bead

```bash
# Update status
duck bead update rd-xyz789 --status=in_progress

# Update priority
duck bead update rd-xyz789 --priority=P2

# Add description
duck bead update rd-xyz789 --description="Added OAuth support"
```

## Close Bead

```bash
duck bead close rd-xyz789
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
duck convoy add cv-abc123 rd-xyz789

# Link to hook
duck hook link hk-abc123 rd-xyz789
```