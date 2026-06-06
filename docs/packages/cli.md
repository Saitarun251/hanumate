# @kishkindhalabs/hanumate-cli

The `hanumate` command-line tool for managing Hanumate work.

## Installation

```bash
npm install -g @kishkindhalabs/hanumate-cli
```

## Commands

### hanumate dev

Start development mode with interactive agent session.

```bash
hanumate dev
```

### hanumate status

Check agent status.

```bash
hanumate status
```

### hanumate init

Initialize a new agent project.

```bash
hanumate init my-agent
```

## Work Management

### Hook Commands

Manage persistent work queue.

```bash
# List all hooks
hanumate hook list

# Create a new hook
hanumate hook create --title="Fix auth bug" --type=bug --priority=P1

# Assign hook to agent
hanumate hook assign hk-abc123 agent-1

# Unassign hook
hanumate hook unassign hk-abc123
```

### Bead Commands

Git-backed issue tracking.

```bash
# Create a bead
hanumate bead create --title="New feature" --type=feature

# List beads
hanumate bead list --status=open

# Show bead details
hanumate bead show rd-xyz789

# Update bead
hanumate bead update rd-xyz789 --status=in_progress

# Close bead
hanumate bead close rd-xyz789
```

### Convoy Commands

Bundle related beads together.

```bash
# Create convoy with beads
hanumate convoy create "User Auth Feature" rd-abc123 rd-def456

# List convoys
hanumate convoy list

# Show convoy
hanumate convoy show cv-xyz789

# Add bead to convoy
hanumate convoy add cv-xyz789 rd-ghi123

# Land convoy
hanumate convoy land cv-xyz789
```

## Configuration

Create `hanumate.config.js` in your project:

```javascript
export default {
  model: 'anthropic/claude-sonnet-4-6',
  sandbox: 'local',
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  },
  skills: ['code-review', 'refactoring']
};
```