# CLI

The `hanumate` CLI provides command-line tools for managing Hanumate work.

## Installation

```bash
npm install -g @hanumateharness/cli
```

Or use with npx:

```bash
npx @hanumateharness/cli dev
```

## Commands

### Agent Management

```bash
hanumate dev                    # Start development mode
hanumate status                 # Check agent status
hanumate init my-agent         # Initialize new agent project
```

### Hook Commands

```bash
hanumate hook list              # List pending work
hanumate hook create --title="Fix bug" --type=bug  # Create hook
hanumate hook assign <hook-id> <agent>             # Assign to agent
hanumate hook unassign <hook-id>                   # Remove assignment
```

### Bead Commands

```bash
hanumate bead create --title="New feature" --type=feature --priority=P1
hanumate bead list --status=open
hanumate bead show rd-abc12
hanumate bead update rd-abc12 --status=in_progress
hanumate bead close rd-abc12
```

### Convoy Commands

```bash
hanumate convoy create "Feature X" rd-abc12 rd-def34  # Create with beads
hanumate convoy list
hanumate convoy show cv-xyz99
hanumate convoy add cv-xyz99 rd-ghi56               # Add bead
hanumate convoy land cv-xyz99                        # Land (merge)
```

### Mail Commands

```bash
hanumate mail send <agent-id> -s "Subject" -m "Message"
hanumate mail inbox
hanumate mail read <mail-id>
```

### Server Commands

```bash
hanumate server start [--port 3000]   # Start HTTP/WebSocket server
hanumate server stop                  # Stop server
hanumate server status               # Check status
```

### Refinery Commands

```bash
hanumate refinery list                # View merge queue
hanumate refinery status             # Check CI status
hanumate refinery enqueue <branch>   # Add to queue
```

## Configuration

Create `hanumate.config.js`:

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