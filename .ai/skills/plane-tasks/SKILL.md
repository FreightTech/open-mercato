---
name: plane-tasks
description: Create and manage tasks (work items) in Plane project management. Use this skill when users want to: (1) create tasks/issues in Plane projects, (2) update existing work items (status, assignees, priority), (3) organize tasks into modules, cycles, or milestones, (4) add comments, labels, or relations, (5) search for tasks across the workspace, (6) list or filter work items.
---

# Plane Task Management

Create, update, organize, and search work items in Plane using `mcp_plane_*` tools.

## FreightTech Projects

| Name | Identifier | Project ID |
|------|------------|------------|
| ALBATROS | ALBAT | `286c5435-5cb8-40b1-bdb6-016c35e98c54` |
| FLAMINGO | FLAMI | `0b1d6cc3-6e8c-4aaf-98b0-27ad7e6bb459` |
| CAMELEON | CHAME | `b4351452-38a9-40d1-8423-24973913ca75` |
| SEAL | SEAL | `bb75ebc6-8e08-4c4d-8cc5-1a51a6ec12c4` |
| SEAHORSE | SEAHO | `5208c584-ec18-4786-9d59-2e22fadc5325` |
| OCTUPUS | OCTUP | `8000d3d3-d849-4754-9339-17cac684fa27` |
| SHARK | SHARK | `b5e91a7f-8229-4982-a76b-629d91b88f03` |
| JELLYFISH | JELLY | `022901de-b956-4ea2-b0ca-8b1914dc2f14` |
| STARFISH | STARF | `7628e32b-1b53-4376-b18f-c04b1fafabe2` |
| CRAB | CRAB | `a558a745-9336-4f63-8974-a0ed51a1df82` |
| ADMINISTRATION | ADMN | `59fea050-0f6e-44a0-b634-a02983e512e6` |
| IDENTITY | IDENT | `d78e4fb9-bdc4-47c3-babe-6978c01eb30a` |
| PLAYGROUND | TESTI | `206821e7-bb8b-4820-a7da-66b5458b135e` |
| SPECTRUM | SPECT | `a5537fd5-1026-4b47-a994-03120359b1d9` |

## Creating a Work Item

### Workflow

1. Identify target project from table above (or use `mcp_plane_list_projects`)
2. Get project states: `mcp_plane_list_states(project_id)` — needed to set initial state
3. Get labels: `mcp_plane_list_labels(project_id)` — if applying labels
4. Get assignees: `mcp_plane_get_workspace_members()` — if assigning users
5. Create: `mcp_plane_create_work_item(...)` — use description template below

### create_work_item Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `project_id` | Yes | UUID from projects table |
| `name` | Yes | Task title |
| `description_html` | No | HTML description (e.g., `<p>Details here</p>`) |
| `priority` | No | `urgent`, `high`, `medium`, `low`, `none` |
| `state` | No | UUID of target state |
| `assignees` | No | Array of user UUIDs |
| `labels` | No | Array of label UUIDs |
| `start_date` | No | ISO 8601 date (e.g., `2026-03-10`) |
| `target_date` | No | ISO 8601 date |
| `parent` | No | UUID of parent work item (for subtasks) |

### Description Template

Use this HTML template for `description_html`. Include only relevant sections — omit sections that don't apply.

```html
<h2>Problem Statement</h2>
<p>[What problem does this solve? Why is it needed? What's the current pain point?]</p>

<h2>Requirements</h2>
<ul>
  <li>[Requirement 1]</li>
  <li>[Requirement 2]</li>
  <li>[Requirement 3]</li>
</ul>

<h2>Acceptance Criteria</h2>
<ul>
  <li>[ ] [Criterion 1 - testable condition]</li>
  <li>[ ] [Criterion 2 - testable condition]</li>
  <li>[ ] [Criterion 3 - testable condition]</li>
</ul>

<h2>Technical Approach</h2>
<p>[How should this be implemented? Key technical decisions.]</p>

<h2>Architecture</h2>
<p>[System design, data flow, component interactions. Include diagrams as links if needed.]</p>

<h2>Dependencies</h2>
<ul>
  <li>[Blocked by: PROJ-123]</li>
  <li>[Requires: API X to be deployed]</li>
</ul>

<h2>Recommendations</h2>
<ul>
  <li>[Suggested approach or consideration]</li>
  <li>[Alternative option to evaluate]</li>
</ul>

<h2>Out of Scope</h2>
<ul>
  <li>[What this task explicitly does NOT include]</li>
</ul>

<h2>References</h2>
<ul>
  <li><a href="[url]">[Reference document or link]</a></li>
</ul>
```

### Template Variants

**Bug Report:**
```html
<h2>Problem Statement</h2>
<p>[What's broken? Expected vs actual behavior.]</p>

<h2>Steps to Reproduce</h2>
<ol>
  <li>[Step 1]</li>
  <li>[Step 2]</li>
  <li>[Step 3]</li>
</ol>

<h2>Expected Behavior</h2>
<p>[What should happen]</p>

<h2>Actual Behavior</h2>
<p>[What actually happens]</p>

<h2>Environment</h2>
<ul>
  <li>Browser/OS: [details]</li>
  <li>Version: [version]</li>
</ul>

<h2>Screenshots/Logs</h2>
<p>[Attach or link evidence]</p>
```

**Feature Request:**
```html
<h2>Problem Statement</h2>
<p>[User need or business problem]</p>

<h2>Proposed Solution</h2>
<p>[High-level description of the feature]</p>

<h2>User Stories</h2>
<ul>
  <li>As a [role], I want [capability] so that [benefit]</li>
</ul>

<h2>Requirements</h2>
<ul>
  <li>[Functional requirement]</li>
  <li>[Non-functional requirement]</li>
</ul>

<h2>Acceptance Criteria</h2>
<ul>
  <li>[ ] [Testable criterion]</li>
</ul>

<h2>Mockups/Wireframes</h2>
<p>[Link to designs if available]</p>
```

**Technical Task:**
```html
<h2>Objective</h2>
<p>[What needs to be done technically]</p>

<h2>Technical Approach</h2>
<p>[Implementation details]</p>

<h2>Architecture</h2>
<p>[Components affected, data flow]</p>

<h2>Files to Modify</h2>
<ul>
  <li><code>path/to/file.ts</code> - [change description]</li>
</ul>

<h2>Testing Strategy</h2>
<ul>
  <li>[Unit tests for X]</li>
  <li>[Integration tests for Y]</li>
</ul>

<h2>Rollback Plan</h2>
<p>[How to revert if issues arise]</p>
```

### Example: Create Task in CAMELEON

```
mcp_plane_create_work_item(
  project_id: "b4351452-38a9-40d1-8423-24973913ca75",
  name: "Implement user authentication",
  description_html: "<h2>Problem Statement</h2><p>Users cannot securely log in to the application. We need OAuth2 support for enterprise SSO integration.</p><h2>Requirements</h2><ul><li>Support Google OAuth2</li><li>Support Microsoft Azure AD</li><li>Maintain existing email/password login</li></ul><h2>Acceptance Criteria</h2><ul><li>[ ] User can log in with Google account</li><li>[ ] User can log in with Microsoft account</li><li>[ ] Session persists across page refreshes</li><li>[ ] Logout clears all tokens</li></ul><h2>Technical Approach</h2><p>Use NextAuth.js with provider configuration. Store refresh tokens in encrypted HTTP-only cookies.</p>",
  priority: "high"
)
```

## Updating Work Items

Use `mcp_plane_update_work_item(project_id, work_item_id, ...)` with partial updates.

### Common Updates

| Update | Parameter |
|--------|-----------|
| Change status | `state: "<state-uuid>"` |
| Assign user | `assignees: ["<user-uuid>"]` |
| Set priority | `priority: "high"` |
| Add labels | `labels: ["<label-uuid>"]` |
| Set due date | `target_date: "2026-03-15"` |
| Update title | `name: "New title"` |

## Retrieving Work Items

| Task | Tool |
|------|------|
| Get by UUID | `mcp_plane_retrieve_work_item(project_id, work_item_id)` |
| Get by identifier (e.g., CHAME-42) | `mcp_plane_retrieve_work_item_by_identifier(project_identifier: "CHAME", issue_identifier: 42)` |
| List all in project | `mcp_plane_list_work_items(project_id)` |
| Search workspace | `mcp_plane_search_work_items(query: "authentication")` |

## Deleting Work Items

```
mcp_plane_delete_work_item(project_id, work_item_id)
```

## Organization

### Modules

List modules in a project:
```
mcp_plane_list_modules(project_id)
```

Add work items to a module:
```
mcp_plane_add_work_items_to_module(project_id, module_id, issue_ids: ["<work-item-uuid>", ...])
```

Remove from module:
```
mcp_plane_remove_work_item_from_module(project_id, module_id, work_item_id)
```

### Cycles

List cycles:
```
mcp_plane_list_cycles(project_id)
```

Add to cycle:
```
mcp_plane_add_work_items_to_cycle(project_id, cycle_id, issue_ids: ["<work-item-uuid>", ...])
```

### Milestones

List milestones:
```
mcp_plane_list_milestones(project_id)
```

Add to milestone:
```
mcp_plane_add_work_items_to_milestone(project_id, milestone_id, issue_ids: ["<work-item-uuid>", ...])
```

## Relations

Create dependencies between work items:

```
mcp_plane_create_work_item_relation(
  project_id,
  work_item_id,
  relation_type: "blocking",  // or: blocked_by, duplicate, relates_to, start_after, start_before, finish_after, finish_before
  issues: ["<related-work-item-uuid>"]
)
```

List relations:
```
mcp_plane_list_work_item_relations(project_id, work_item_id)
```

## Comments

Add comment:
```
mcp_plane_create_work_item_comment(
  project_id,
  work_item_id,
  comment_html: "<p>Comment content here</p>"
)
```

List comments:
```
mcp_plane_list_work_item_comments(project_id, work_item_id)
```

### Resolution Comment Template

When closing a task, add a resolution comment using this template:

```html
<h3>Resolution Summary</h3>
<p>[Brief description of what was done to resolve this task]</p>

<h3>Changes Made</h3>
<ul>
  <li><code>path/to/file.ts</code> - [what changed]</li>
  <li><code>path/to/another.ts</code> - [what changed]</li>
</ul>

<h3>Testing</h3>
<ul>
  <li>[How it was tested]</li>
  <li>[Test results or coverage]</li>
</ul>

<h3>Related PRs/Commits</h3>
<ul>
  <li><a href="[pr-url]">PR #123 - [title]</a></li>
</ul>

<h3>Notes</h3>
<p>[Any follow-up tasks, known limitations, or things to watch for]</p>
```

**Minimal Resolution (for simple tasks):**
```html
<p><strong>Resolved:</strong> [Brief description of solution]</p>
<p><strong>PR:</strong> <a href="[url]">#123</a></p>
```

**Resolution with Workaround:**
```html
<h3>Resolution</h3>
<p>[What was done]</p>

<h3>Workaround Applied</h3>
<p>[Description of temporary fix if applicable]</p>

<h3>Technical Debt</h3>
<p>[What should be addressed later]</p>
```

**Won't Fix / Cancelled:**
```html
<h3>Decision</h3>
<p>[Why this won't be implemented]</p>

<h3>Reason</h3>
<ul>
  <li>[Justification 1]</li>
  <li>[Justification 2]</li>
</ul>

<h3>Alternatives</h3>
<p>[Suggested alternatives if any]</p>
```

### Progress Update Template

For work-in-progress updates:

```html
<h3>Progress Update</h3>
<p><strong>Status:</strong> [X]% complete</p>

<h3>Completed</h3>
<ul>
  <li>[What's done]</li>
</ul>

<h3>In Progress</h3>
<ul>
  <li>[Currently working on]</li>
</ul>

<h3>Blockers</h3>
<ul>
  <li>[Any blockers or dependencies]</li>
</ul>

<h3>ETA</h3>
<p>[Expected completion date/time]</p>
```

## Links

Attach external URLs to work items:

```
mcp_plane_create_work_item_link(
  project_id,
  work_item_id,
  url: "https://github.com/org/repo/pull/123"
)
```

## State Groups

Each project has states organized into groups:

| Group | Meaning | Example States |
|-------|---------|----------------|
| `backlog` | Not yet prioritized | Backlog |
| `unstarted` | Prioritized, not started | Todo |
| `started` | Work in progress | In Progress |
| `completed` | Done | Done |
| `cancelled` | Won't do | Cancelled |

Fetch states for a project to get UUIDs:
```
mcp_plane_list_states(project_id)
```

## Priority Values

From highest to lowest: `urgent` > `high` > `medium` > `low` > `none`

## Key Tools Reference

| Operation | Tool |
|-----------|------|
| List projects | `mcp_plane_list_projects()` |
| Get project states | `mcp_plane_list_states(project_id)` |
| Get project labels | `mcp_plane_list_labels(project_id)` |
| Get workspace members | `mcp_plane_get_workspace_members()` |
| **Create task** | `mcp_plane_create_work_item(project_id, name, ...)` |
| **Update task** | `mcp_plane_update_work_item(project_id, work_item_id, ...)` |
| **Delete task** | `mcp_plane_delete_work_item(project_id, work_item_id)` |
| Get task by ID | `mcp_plane_retrieve_work_item(project_id, work_item_id)` |
| Get task by identifier | `mcp_plane_retrieve_work_item_by_identifier(project_identifier, issue_identifier)` |
| List tasks | `mcp_plane_list_work_items(project_id)` |
| Search tasks | `mcp_plane_search_work_items(query)` |
| List modules | `mcp_plane_list_modules(project_id)` |
| Add to module | `mcp_plane_add_work_items_to_module(project_id, module_id, issue_ids)` |
| List cycles | `mcp_plane_list_cycles(project_id)` |
| Add to cycle | `mcp_plane_add_work_items_to_cycle(project_id, cycle_id, issue_ids)` |
| Add comment | `mcp_plane_create_work_item_comment(project_id, work_item_id, comment_html)` |
| Add relation | `mcp_plane_create_work_item_relation(project_id, work_item_id, relation_type, issues)` |
| Add link | `mcp_plane_create_work_item_link(project_id, work_item_id, url)` |

## Bulk Operations

When creating multiple related tasks:

1. Create parent task first
2. Create child tasks with `parent: "<parent-work-item-uuid>"`
3. Optionally add all to the same module/cycle

When importing tasks from a spec or list:

1. Parse the task list
2. Batch create using multiple `mcp_plane_create_work_item` calls
3. Create relations between dependent tasks using `mcp_plane_create_work_item_relation`
