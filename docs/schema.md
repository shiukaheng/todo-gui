# Schema

## Nodes

### Task

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `id` | string | ✓ | | Unique identifier |
| `text` | string | | `""` | Human-readable description |
| `completed` | boolean | | `false` | Manually marked complete |
| `inferred` | boolean | | `false` | Group task (completion inferred from children) |
| `due` | int | | `null` | Due date (unix timestamp) |
| `created_at` | int | | `null` | Creation time (unix timestamp) |
| `updated_at` | int | | `null` | Last update time (unix timestamp) |

**Constraints:**
- `Task.id` must be unique

## Relationships

### DEPENDS_ON

```
(Task)-[:DEPENDS_ON]->(Task)
```

Task A depends on Task B means A cannot be completed until B is complete.

The graph must remain acyclic (DAG).

## Calculated Properties

These are computed at query time, not stored:

| Property | Calculation |
|----------|-------------|
| `calculated_due` | `min(self.due, ...all_ancestors.due)` |
| `calculated_completed` | `conditional(if (not self.inferred), self.completed AND) all(children.completed)` |