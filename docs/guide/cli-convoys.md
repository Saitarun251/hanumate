# Convoy Commands

Convoys bundle related beads together for coordinated delivery.

## Create Convoy

```bash
# Create with beads
duck convoy create "User Authentication" rd-abc123 rd-def456

# Create empty
duck convoy create "New Feature"
```

## List Convoys

```bash
duck convoy list

# Filter by status
duck convoy list --status=pending
duck convoy list --status=testing
duck convoy list --status=landed
```

## Show Convoy

```bash
duck convoy show cv-xyz789
```

## Add Beads

```bash
# Add single bead
duck convoy add cv-xyz789 rd-ghi123

# Add multiple
duck convoy add cv-xyz789 rd-jkl456 rd-mno789
```

## Remove Bead

```bash
duck convoy remove cv-xyz789 rd-ghi123
```

## Land Convoy

Landing a convoy merges all its beads:

```bash
duck convoy land cv-xyz789
```

## Convoy Properties

| Property | Description |
|----------|-------------|
| `cv-xxxxx` | Unique ID |
| `name` | Convoy name |
| `beads` | Array of bead IDs |
| `status` | pending, testing, landed |
| `created` | Creation timestamp |

## Workflow

1. Create beads for individual tasks
2. Bundle related beads into a convoy
3. Work on all beads in the convoy
4. Land the convoy when ready

```bash
# Example workflow
duck bead create --title="Add login page"
duck bead create --title="Add auth API"
duck convoy create "User Auth" rd-abc123 rd-def456
# ... work on beads ...
duck convoy land cv-xyz789
```