# Skills

Skills extend agent capabilities with specialized instructions.

## Load Skills

```typescript
import { loadAgentSkills } from '@hanumateharness/runtime';

const skills = await loadAgentSkills(['coding', 'debugging'], '/project/.hanumate/skills');
```

## List Skills

```typescript
const session = await agent.createSession();
const skillNames = await session.listSkills();
```

## Get Skill Instructions

```typescript
const instructions = await session.getSkillInstructions('code-review');
```

## Run Skill

```typescript
const result = await session.runSkill('code-review', {
  code: myCode,
  strict: true
});
```

## Create Custom Skill

Create a `.hanumate/skills/code-review.md`:

```markdown
# Code Review Skill

You are an expert code reviewer. Analyze code for:
- Security vulnerabilities
- Performance issues
- Code style
- Best practices

Provide actionable feedback.
```

Use in agent:

```typescript
const agent = createAgent({
  name: 'reviewer',
  skills: ['code-review']
});
```