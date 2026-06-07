# Convoy Commands

Convoys bundle related beads together for coordinated delivery.

## Create Convoy

```bash
# Create with beads
hanumate convoy create "User Authentication" rd-abc123 rd-def456

# Create empty
hanumate convoy create "New Feature"
```

## List Convoys

```bash
hanumate convoy list

# Filter by status
hanumate convoy list --status=pending
hanumate convoy list --status=testing
hanumate convoy list --status=landed
```

## Show Convoy

```bash
hanumate convoy show cv-xyz789
```

## Add Beads

```bash
# Add single bead
hanumate convoy add cv-xyz789 rd-ghi123

# Add multiple
hanumate convoy add cv-xyz789 rd-jkl456 rd-mno789
```

## Remove Bead

```bash
hanumate convoy remove cv-xyz789 rd-ghi123
```

## Land Convoy

Landing a convoy merges all its beads:

```bash
hanumate convoy land cv-xyz789
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
hanumate bead create --title="Add login page"
hanumate bead create --title="Add auth API"
hanumate convoy create "User Auth" rd-abc123 rd-def456
# ... work on beads ...
hanumate convoy land cv-xyz789
```