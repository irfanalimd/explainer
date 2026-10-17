# R3 · Teacher pipeline in Claude Code

Research for PLAN.md §2.4, §2.5, §6 M2, §8 and decision 3 in §9. Written 2026-10-16. Local Claude Code is **v2.1.285**, and the skills CLI is **v1.7.2** (source at commit `13e4063`, 2026-10-09).

How to read the evidence tags:
- **[doc]**: stated in the official docs at the linked URL. Each page was fetched on 2026-10-16.
- **[probe]**: I ran it on this machine. All probes used a throwaway plugin `xprobe` in the scratchpad, with `HOME` pointed at a temp directory whenever a command would write settings. Nothing in the real `~/.claude` was changed.
- **[src]**: read in the skills CLI source.
- **[unverified]**: inferred and not tested.

---

## 0. Answer first

**Both install paths can coexist, and the existing `npx skills add` line keeps working without any change.**

The mechanism is a documented feature: Claude Code loads any folder under `~/.claude/skills/` that holds a `.claude-plugin/plugin.json` *as a plugin* (`<name>@skills-dir`). The root `SKILL.md` stays a personal skill (`/explainer`), and `skills/`, `agents/` and `hooks/` load as plugin components ([create § skills directory](https://code.claude.com/docs/en/plugins/create#develop-without-a-marketplace), [skills § where skills live](https://code.claude.com/docs/en/skills)).

`npx skills add irfanalimd/explainer` already copies the whole repo (minus `.git`) into `~/.claude/skills/explainer`. Once the repo carries a `plugin.json`, that copy becomes the full plugin.

Both paths were verified end to end with the probe ([probe], §2.3).

---

## 1. Plugin format (as of 2026-10-16)

Sources:
- [Plugin manifest reference](https://code.claude.com/docs/en/plugins-reference) (also served at `/docs/en/plugins/manifest-reference`)
- [Plugin components](https://code.claude.com/docs/en/plugins/components)
- [Create a plugin](https://code.claude.com/docs/en/plugins/create)
- [Plugin loading](https://code.claude.com/docs/en/plugins/loading)
- [Create a marketplace](https://code.claude.com/docs/en/plugin-marketplaces)
- [Marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference)
- [Install plugins](https://code.claude.com/docs/en/plugins/install)
- [Skills](https://code.claude.com/docs/en/skills)
- [Subagents](https://code.claude.com/docs/en/sub-agents)
- [Hooks](https://code.claude.com/docs/en/hooks)

### 1.1 Layout and manifest [doc]

- **The manifest.**
  - It lives at `.claude-plugin/plugin.json`. It is optional, and `name` is its only required field.
  - Every other file sits at the plugin root, not inside `.claude-plugin/`.
- **Default component locations:**
  - `skills/<name>/SKILL.md`
  - `agents/*.md` (subfolders become part of the name)
  - `commands/`
  - `hooks/hooks.json`
  - `.mcp.json`, `.lsp.json`
  - `output-styles/`, `workflows/`, `themes/`, `monitors/monitors.json`
  - `bin/` (added to PATH; claude.ai and Cowork refuse plugins that have it)
  - `settings.json` (only the `agent` and `subagentStatusLine` keys take effect)
  - A `CLAUDE.md` at the plugin root is *not* loaded.
- **Manifest fields:**
  - `$schema`, `name`, `displayName`, `version`, `description`
  - `author{name,email,url}`, `homepage`, `repository`, `license`, `keywords`, `metadata`
  - directory-listing fields: `icon`, `documentationUrl`, `supportUrl`, `privacyPolicyUrl`, `termsOfServiceUrl`
  - `defaultEnabled`, `dependencies`, `settings`, `userConfig`, `types`, `channels`
  - component keys: `skills`, `commands`, `agents`, `hooks`, `mcpServers`, `lspServers`, `outputStyles`, `workflows`
  - `experimental{themes,monitors,evals}`
  - Unknown top-level keys are stripped with a validator warning.
- **Component path keys.**
  - Every path must start with `./` and stay inside the plugin root; `..` is rejected.
  - Three rules for how a key combines with its default location:

    | Rule | Keys |
    |---|---|
    | Adds to the default | `skills` |
    | Replaces the default | `commands`, `agents`, `outputStyles`, `workflows`, themes, monitors |
    | Merges with the default | `hooks`, `mcpServers`, `lspServers` |

  - `"skills": ["./"]` names the plugin root as "one folder holding `SKILL.md` directly".
- **The root `SKILL.md` rule.** A root `SKILL.md` loads only when the plugin has **no `skills/` directory and no `skills` key**. Set `name` in its frontmatter, or a marketplace install names it after the cache directory.
  - [probe] With `skills/teacher/` present and no `skills` key, the root skill was **dropped**: `Skills (1) teacher`.
  - [probe] With `"skills": ["./"]` it loads: `Skills (2) teacher, xprobe`.
- **`${CLAUDE_PLUGIN_ROOT}`** (the install directory) and **`${CLAUDE_PLUGIN_DATA}`** (persistent, `~/.claude/plugins/data/<id>/`).
  - Both are substituted inline in skill, command and agent Markdown bodies.
  - They are exported to hook, MCP and LSP processes.
  - They are **not** in the environment of the Bash tool.
  - [probe] `${CLAUDE_PLUGIN_ROOT}` was substituted in an agent body.
  - Skills also get `${CLAUDE_SKILL_DIR}` ([skills § substitutions](https://code.claude.com/docs/en/skills)).
- **Validation.** `claude plugin validate <dir>` (add `--strict` for CI) checks the manifest, `marketplace.json`, and the frontmatter of every skill, agent and command.
- **Inspection.** `claude plugin details <name>` prints the component inventory, and `claude plugin list` shows skills-dir plugins in their own section.

### 1.2 Naming once installed [doc + probe]

| Component | Name |
|---|---|
| Plugin skill `skills/teacher/SKILL.md` | `/explainer:teacher`. The bare `/teacher` also works unless another command already owns that name ([skills § command name](https://code.claude.com/docs/en/skills)). |
| Plugin root `SKILL.md` with `name: explainer`, marketplace install | `/explainer:explainer`, plus bare `/explainer` if free |
| Root `SKILL.md` of a **skills-dir** plugin | a personal skill, `/explainer`, *not* `/explainer:explainer` ([create § name the plugin's skills](https://code.claude.com/docs/en/plugins/create)) |
| Agent `agents/teacher.md` | `explainer:teacher`. The frontmatter `name` replaces only the file part. Subfolders add segments (`explainer:review:novice`). `@agent-explainer:teacher` mentions it. |
| Hooks `agent_type` for a plugin agent | `explainer:novice-reader`. Anchor regexes: `^explainer:novice-reader$` ([hooks § SubagentStart](https://code.claude.com/docs/en/hooks)). |

**Probes.**
- A headless session listed `xprobe:novice-reader` as an Agent `subagent_type`, and the skills `xprobe:teacher` and `xprobe:xprobe`.
- In skills-dir mode, `claude plugin details` listed `Skills (1) teacher`. The root is not double-registered as a plugin skill, even with `"skills": ["./"]` set.

### 1.3 Marketplaces, install, versions [doc]

**The marketplace file.**
- `.claude-plugin/marketplace.json` requires `name`, `owner{name}` and `plugins[]`.
- Each plugin entry requires `name` and `source`.
- An entry also accepts any `plugin.json` field, plus `category`, `tags`, `strict`, `relevance` and `headers`.

**Source types.**
- Relative path: `"./…"`, and `"."` for the root itself.
- `github`, `url`, `git-subdir`, `archive`, `npm` and `command`.
- **A plugin can be the marketplace root itself.** [probe] `"source": "./"` passes `claude plugin validate`, and installing from that marketplace loaded the full plugin.

**Strict mode.**
- `strict` defaults to `true`. With a `plugin.json` present, the entry's component fields are *appended* to it.
- With `strict: false` plus entry component fields, the plugin fails to load (conflict).
- Keep the entry `name` equal to the manifest `name`.

**Install commands.**
- In a session: `/plugin marketplace add owner/repo` (or `#ref` to pin a branch or tag), then `/plugin install <plugin>@<marketplace>`. In a session this opens the details panel to pick a scope.
- From the shell: `claude plugin marketplace add …` and `claude plugin install …`.
- One step: `/plugin install explainer --marketplace irfanalimd/explainer` (v2.1.275+) ([install](https://code.claude.com/docs/en/plugins/install)).

**Version resolution** ([loading § versions](https://code.claude.com/docs/en/plugins/loading)):
1. `plugin.json` `version`
2. then the entry's `version`
3. then the source: the commit SHA (12 characters) for git and GitHub sources, or "relative path inside a Git-hosted marketplace: the commit SHA of the installed directory"

A pinned `version` keeps users on the cached copy until the string changes.

**Updates.**
- Auto-update is **off by default for third-party marketplaces**, so users run `claude plugin update` or flip the toggle.
- A marketplace install is **copied** to `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`.
- Skills-dir and `--plugin-dir` plugins load **in place**.

**Name conflicts** (same manifest name):
- managed > `--plugin-dir` > installed marketplace plugin > skills-dir plugin > claude.ai-synced.
- The loser shows `Not loaded — the name "<name>" is already taken…`.

**Reserved names.**
- Plugin names starting `claude-`, `anthropic-` or `cc-plugin-` are refused.
- Marketplace names `inline`, `skills-dir`, `synced`, `github` and the official names are reserved.
- `<owner>-<repo>` (`irfanalimd-explainer`) is reserved for the GitHub download folder.
- `explainer` and a marketplace named `irfanalimd` are fine.

---

## 2. Proposed repo layout serving both install paths

### 2.1 What `npx skills add irfanalimd/explainer -g -a claude-code` does today [src + probe]

1. **Fetch.**
   - `irfanalimd` is not on the CLI's blob allowlist (`BLOB_ALLOWED_OWNERS = vercel, vercel-labs, heygen-com, remotion-dev`), so the CLI **git-clones** the repo (`src/add.ts`).
2. **Discover.**
   - `discoverSkills()`: when the root holds `SKILL.md`, it returns **only the root skill and stops**. It does not scan `skills/` or plugin manifests (`src/skills.ts` L234-250).
   - `--full-depth` disables that early return.
   - The skill name comes from frontmatter `name`.
3. **Install.**
   - With one target agent it uses **copy** mode, not a symlink (`src/add.ts` L884-886).
   - `copyDirectory(repoRoot → ~/.claude/skills/explainer)` excludes only `.git`, `__pycache__`, `__pypackages__` and `metadata.json` (`src/installer.ts` L471-472).
   - Dot-directories such as `.claude-plugin/` **are copied**.
4. **[probe]** `HOME=<tmp> npx skills@latest add <probe> -g -a claude-code -y` produced `~/.claude/skills/xprobe/{SKILL.md,.claude-plugin/,skills/teacher/,agents/,hooks/,scripts/}`.
   - `HOME=<tmp> claude plugin details xprobe` then reported `Source: xprobe@skills-dir · Skills (1) teacher · Agents (1) novice-reader · Hooks (1) PreToolUse`.
   - With the root personal skill, that is the whole plugin.

The plugin-manifest discovery that the skills CLI README advertises ("skills declared in `.claude-plugin/*.json` are also discovered") does **not** apply here, because the root-`SKILL.md` early return happens first [src].

### 2.2 The layout

```
explainer/                          ← repo root = plugin root = marketplace root = the npx "skill"
├── .claude-plugin/
│   ├── plugin.json                 ← name "explainer", "skills": ["./"]
│   └── marketplace.json            ← name "irfanalimd", one entry {name "explainer", source "./"}
├── SKILL.md                        ← name: explainer (unchanged path; /explainer)
├── skills/
│   └── teacher/
│       └── SKILL.md                ← name: teacher, metadata.internal: true  (/explainer:teacher)
├── agents/
│   ├── curriculum-designer.md      ← explainer:curriculum-designer
│   ├── teacher.md                  ← explainer:teacher
│   ├── novice-reader.md            ← explainer:novice-reader
│   ├── expert-reader.md            ← explainer:expert-reader
│   ├── scorer.md                   ← explainer:scorer
│   └── quiz-writer.md              ← explainer:quiz-writer (benchmark only)
├── hooks/
│   └── hooks.json                  ← PreToolUse fence for reader agents (§4.4)
├── scripts/                        ← existing, plus reader-fence.mjs, review-packet.mjs,
│                                     review-check.mjs, bench-teach.mjs
├── bench/                          ← frozen quizzes (fenced from authoring agents)
├── engine/ sim/ references/ examples/ assets/ DESIGN.md CONTRACTS.md README.md LICENSE
```

**Why each choice:**
- **`"skills": ["./"]` is required** for the marketplace install. Without it the root skill disappears as soon as `skills/` exists [probe]. In skills-dir mode it is harmless: the root stays a personal skill and is not duplicated [probe].
- **`agents/` and `hooks/` use their default locations**, so `plugin.json` needs no `agents` or `hooks` key. Remember that `agents` *replaces* the default.
- **`metadata.internal: true` on the teacher skill** stops `npx skills add --full-depth` from installing `teacher` as a separate, broken standalone skill [src: `skills.ts` L117-121]. Claude Code ignores `metadata` [doc].
- **One manifest name, `explainer`, in both paths.** Agent ids are `explainer:<agent>` either way, so `SKILL.md` can name them unconditionally.

Draft manifests (for M2):

```json
// .claude-plugin/plugin.json
{
  "name": "explainer",
  "displayName": "Explainer",
  "version": "2.0.0",
  "description": "Cinematic, interactive explainers of CS concepts as real running simulations, with a multi-agent teacher pipeline.",
  "author": { "name": "Irfan Ali", "url": "https://github.com/irfanalimd" },
  "homepage": "https://github.com/irfanalimd/explainer",
  "repository": "https://github.com/irfanalimd/explainer",
  "license": "MIT",
  "keywords": ["education", "visualization", "computer-science", "simulation"],
  "skills": ["./"]
}
```

```json
// .claude-plugin/marketplace.json
{
  "name": "irfanalimd",
  "description": "Irfan Ali's Claude Code plugins",
  "owner": { "name": "Irfan Ali", "url": "https://github.com/irfanalimd" },
  "plugins": [
    { "name": "explainer", "source": "./", "description": "Explain CS concepts by running them." }
  ]
}
```

**README install section (proposed text):**

```sh
# Option A: Claude Code plugin (recommended; gets updates with `claude plugin update`)
/plugin install explainer --marketplace irfanalimd/explainer
#   or: /plugin marketplace add irfanalimd/explainer  then  /plugin install explainer@irfanalimd

# Option B: skills CLI (unchanged)
npx skills add irfanalimd/explainer -g -a claude-code
#   or: git clone https://github.com/irfanalimd/explainer.git ~/.claude/skills/explainer
```

Add one line: "Pick one. Options A and B both work and give the same `/explainer`, teacher skill and agents. Installing both makes Claude Code load the marketplace copy and report the other as not loaded."

**Commands by install path:**

| | Option A (marketplace) | Option B (skills dir) |
|---|---|---|
| Main command | `/explainer` (bare, if free) or `/explainer:explainer` | `/explainer` |
| Teacher skill | `/explainer:teacher` | `/explainer:teacher` |
| Agents | `explainer:*` | `explainer:*` |

### 2.3 What still breaks or differs (the edges)

| Case | Effect | Mitigation |
|---|---|---|
| `npx skills add … -a codex` (or any non-Claude agent) | Only the files land. Agents and hooks mean nothing there. | `SKILL.md` falls back to **single-agent mode** (§3.4) |
| Both installs at once | The marketplace plugin wins the `explainer` name and the skills-dir plugin shows "Not loaded". The personal `/explainer` root skill **still loads** from `~/.claude/skills/explainer`, so the user sees `/explainer` and `/explainer:explainer` [doc; exact UX unverified]. | README: pick one |
| Project-scope npx install (no `-g`) → `.claude/skills/explainer` | The plugin loads only after the workspace-trust dialog, and only when the session starts at the project root: no parent-directory search for plugins ([loading § shared through a repository](https://code.claude.com/docs/en/plugins/loading)) | README recommends `-g` |
| The skills CLI moves `irfanalimd` onto the blob fast path | For root skills the blob path installs **only `SKILL.md`** (`blob.ts` L689-696). That would break even today's skill, not just the plugin. | Watch the CLI. The git-clone line in the README is the fallback. |
| `npx skills add --full-depth` | Without `internal: true`, it would also install `skills/teacher` as a standalone skill that lacks the engine | `metadata.internal: true` |
| The user's dev checkout at `~/.claude/skills/explainer` (this repo) | It starts loading as `explainer@skills-dir` the moment `plugin.json` lands, including the hook | Intended. It is also the dev loop: edits load in place. |
| Plugin hooks | `hooks/hooks.json` runs in **every** session where the plugin is enabled (one `node` start per matched tool call) | Shell pre-filter (§4.4) |

**Script paths in `SKILL.md`.**
- `SKILL.md` must stop assuming its own location. Use `${CLAUDE_SKILL_DIR}`, which is substituted in both the personal-skill and plugin modes [doc].
- In `skills/teacher/SKILL.md`, `${CLAUDE_SKILL_DIR}/../..` is the repo root.
- `${CLAUDE_PLUGIN_ROOT}` also works in plugin mode. Whether it is set for a skills-dir plugin's skill content is [unverified], so prefer `CLAUDE_SKILL_DIR` in skills. In agent bodies, `${CLAUDE_PLUGIN_ROOT}` is verified for `--plugin-dir` [probe].

---

## 3. Agent orchestration: facts and limits

### 3.1 How a skill drives subagents [doc + probe]

- **A skill is instructions to the main agent.** The main agent spawns subagents with the Agent tool: `subagent_type: "explainer:teacher"`.
  - [probe] A headless session given "Use the Agent tool with subagent_type xprobe:novice-reader" spawned the plugin agent.
  - The subagent had **only** `Read` (its `tools: Read`), and `${CLAUDE_PLUGIN_ROOT}` was substituted in its body.
- **`context: fork` + `agent:` on a skill** runs the *whole skill* as one forked subagent (Explore, Plan or general-purpose). That is not what `/explainer` needs: the lead must keep the user conversation and run several agents.
  - It may suit `/explainer:teacher` run on an existing figure, but keep it inline too, because the teacher skill also spawns readers.
- **Nesting.**
  - By default, subagents **can** spawn subagents, up to **3 layers** below the main conversation (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`; `1` disables nesting) ([sub-agents § nested](https://code.claude.com/docs/en/sub-agents)).
  - At the depth limit the Agent tool is withheld.
  - Omitting `Agent` from `tools` stops a given agent from spawning.
  - The concurrency cap is **20** running subagents (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`).
- **Design rule: only the lead (main conversation) orchestrates.** No pipeline agent gets the `Agent` tool. That keeps the pipeline working even when `/explainer` itself runs inside a subagent (depth ≤ 2 used).
- **Context.** A subagent gets:
  - its own body as the system prompt
  - the delegation message
  - CLAUDE.md, unless `omitClaudeMd: true`
  - the git status, and any preloaded `skills`

  It does **not** get the main conversation's history.
- **Background subagents** keep a reduced built-in tool set, which includes Read, Write, Edit, Bash, WebFetch and WebSearch. Everything this pipeline uses is in that set.

### 3.2 Frontmatter for plugin agents [doc]

**Supported:**
- `name` (no `:`), `description`
- `model`: `sonnet`, `opus`, `haiku`, `fable`, a full id, or `inherit`
- `effort`: `low`, `medium`, `high`, `xhigh`, `max`
- `maxTurns`, `autoCompactWindow`
- `tools`, `disallowedTools`
- `skills` (preload, at most 32), `memory`, `background`, `omitClaudeMd`
- `isolation: worktree`, `color`, `experimental.cacheTtl`

**Ignored for plugin agents:** `permissionMode`, `hooks`, `mcpServers` and `initialPrompt`. A plugin agent cannot carry its own hooks, so enforcement has to live in the plugin-level `hooks/hooks.json` ([components § agents](https://code.claude.com/docs/en/plugins/components)).

**Tool-list details.**
- `disallowedTools: Bash(git push *)` removes the **whole** tool. Specifiers do not narrow a tool in `tools` or `disallowedTools`.
- `tools: Agent(a, b)` limits which agent types this agent may spawn.

### 3.3 Pinning model and effort per agent [doc]

**Model resolution order:**
1. the per-invocation Agent `model` parameter
2. frontmatter `model`
3. `CLAUDE_CODE_SUBAGENT_MODEL`
4. the main model

- A family alias like `opus` resolves to the main conversation's exact model when the main model is in that family.
- `/tasks` shows each subagent's model and effort.

**Effort.**
- Frontmatter `effort` overrides the session effort but not `CLAUDE_CODE_EFFORT_LEVEL`.
- A per-invocation `effort` parameter exists from **v2.1.292**. Local is v2.1.285, so rely on frontmatter.
- PLAN §5's "effort comes from frontmatter" is correct for this machine.

**Recommended pins (see §5 for the files):**

| Agent | Model | Effort | Why |
|---|---|---|---|
| curriculum-designer | opus | high | research and judgment, once per figure |
| teacher | opus | high | the words are the product |
| novice-reader (×2) | sonnet | medium | a different family from the teacher, which reduces shared blind spots; cheap enough to run two |
| expert-reader | opus | high | factual depth |
| scorer | opus | medium | must not share a sampling path with the readers; grading against anchors |
| quiz-writer | opus | high | benchmark items, once per concept, then human-reviewed |

### 3.4 Fallback when agents are not loaded

**Detection.** `SKILL.md` step 0: if `explainer:teacher` is not in the Agent tool's type list (a non-Claude agent, or a stripped install), the lead runs every stage itself.
- The prompts are the bodies of `${CLAUDE_SKILL_DIR}/agents/*.md`.
- The reader stages go to `general-purpose` subagents, with the body pasted into the prompt.

**What is lost:**
- the tool restrictions
- the fence hook
- the model and effort pins

**Labelling.** The lead writes `review/state.json` → `"mode": "unfenced"`, and the delivery note says the reviews were not blind.

---

## 4. Reviewer design (novice-reader, expert-reader, scorer)

### 4.1 Threats to a useful review

1. **Rubber-stamping.** Agreeable "looks great" output, scores drifting toward 4-5, and reviewers that go easier on later rounds because they sense progress.
2. **Leakage of intent.** A reviewer that reads `figure.mjs`, `lesson.mjs` or the lint output judges what the author *meant*, not what the reader *gets*.
3. **Prior knowledge (the novice problem).** An LLM "first-timer" already knows linked lists, so it does not get lost where a real novice would.
4. **Self-preference.** Judges built on the same model family as the author tend to favour its text. This is a widely reported LLM-judge bias [unverified for this setup].

### 4.2 Countermeasures (in order of strength)

| # | Countermeasure | Kills | Mechanism |
|---|---|---|---|
| 1 | **Reader packet + fence hook** | 2 | Readers get `Read` only (the expert also gets WebSearch and WebFetch). A plugin `PreToolUse` hook denies any Read outside `review/packet/` for `^explainer:(novice\|expert)-reader$\|^explainer:scorer$` [probe: denied with "Readers see only the review packet."] |
| 2 | **Readers do not score** | 1 | Readers return *findings* only: lost points, inaccuracies, each with a verbatim quote and a step number. A separate **scorer** turns findings into scores against fixed anchors. The scorer is blind to the round number, the author, earlier scores and the teacher's responses. |
| 3 | **Quote verification (deterministic)** | 1 | `scripts/review-check.mjs` drops any finding whose quote isn't a whitespace-normalised substring of the packet. A report with fewer than 3 verified quotes is invalid: rerun once, then escalate. |
| 4 | **Mandatory weakest moments** | 1 | "No problems" is not a legal answer. The novice must list the 3 weakest moments and the expert the 3 least precise sentences, ranked. Severity carries the signal, not presence. |
| 5 | **Say-it-back** | 1, 3 | The novice writes a 2-3 sentence explanation of each chapter *in its own words*, plus a guess before each prediction reveal. The scorer grades it against the chapter's objective, so understanding is shown, not self-reported. |
| 6 | **Canary defects (mutation testing)** | 1 | `review-packet.mjs` seeds 1 secret defect per reader per round into the packet: an undefined jargon word for the novice, a wrong complexity or number for the expert. It is recorded in `review/round-N/canary.json`, outside the packet. A missed canary voids that reader's pass. Canary findings are stripped before the scorer and the teacher see anything. |
| 7 | **Fresh context every round** | 1 | Each round respawns the readers (no SendMessage resume). They never hear it is a revision. Both novice personas run independently and in parallel. |
| 8 | **Calibration set** | 1, 4 | `bench/calibration/` holds 3 known-bad packets (seeded defects with an answer key) and 1 known-good packet (the M1 linked list). The readers and scorer must catch ≥ 80% of seeded defects, score known-bad chapters ≤ 3 and known-good ≥ 4. Rerun on every prompt or model change, as a regression test for the reviewers themselves. |
| 9 | **Model diversity** | 4 | The teacher runs on opus and the novice readers on sonnet. The scorer is a separate agent with its own prompt. |
| 10 | **Prior-knowledge firewall** | 3 | The novice prompt says: "Flag every sentence you understood only because you already knew the topic." Defined-before-use is checked **deterministically** by the lesson lint, which is the real guarantee. The persona is for gaps a lint can't see. |

### 4.3 The reader packet (what "only what a reader sees" means)

`node scripts/review-packet.mjs <figure.mjs> --out review/packet [--round N]` (new) writes the packet.

**Contents:**
- `index.md`: the reading order (the readers have no Glob).
- `00-start.md`: the title, the hook, the level label as the page shows it, and the story list with labels and descriptions.
  - No `WORDS` block, because the page shows terms on hover at first use. Inline `[term: def]` at first use stays.
- `NN-<chapter>.md` per chapter: the chapter card, the about, and each step's layers in the order the panel shows them at the reviewer's level.
  - The novice reads at New, the expert at Expert.
  - A prediction prints its question and options **without** the ✓ and the why. The next chunk opens with "Revealed: … because …".
- `NN-<chapter>.png`:
  - one key frame per chapter: desktop 1440×900, dark theme, last step of the chapter
  - plus the `--teach` ask and why cards
  - plus the end card

  That is about 8-15 images in all.
- `end.md`: the recap, the takeaway, and the mastery-check questions without answers. Answers come in `answers.md`.

**Excluded:**
- `lesson.mjs` lint findings: `lesson.mjs` prints them by default, so the packet must use `--no-lint`.
- story ids and step ids (today's transcript prints `(insert)`)
- file paths, the knob internals, `figure.mjs`, `lesson.mjs` and README

**Needs a reader mode in `scripts/lib/lesson.mjs`.** `formatLesson(…, { reader: true, level, withhold: true })`. This is a small change: today's output prints `✓`, the `why`, ids and a `WORDS` block.

**Ordering.** Readers are told to read the chunks in order. The fence can enforce order (deny chunk k+1 until chunk k has been read; state kept per `agent_id` in `review/.fence/`). Whether a reader commits a guess *before* reading the reveal can't be enforced. It is only made visible, because guesses appear in the report and the scorer checks them for plausibility.

### 4.4 The fence hook (tested design)

```json
// hooks/hooks.json
{ "hooks": { "PreToolUse": [ { "matcher": "Read|Grep|Glob|Bash|WebFetch",
  "hooks": [ { "type": "command",
    "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/reader-fence.mjs\"" } ] } ] } }
```

**`reader-fence.mjs` rules:**
1. Read stdin JSON.
2. If `agent_type` doesn't match `^explainer:(novice-reader|expert-reader|scorer)$`, exit 0. This is the main session and every other agent.
3. Allow `Read` only when the resolved `file_path` contains `/review/packet/` (the scorer may also read `/review/round-*/findings.json`).
4. Allow `WebFetch` and `WebSearch` for the expert except URLs on `github.com/irfanalimd`, `raw.githubusercontent.com/irfanalimd` and `sites.irfanali.me`. Built pages embed the source.
5. Deny everything else with `permissionDecision: "deny"`.

**Probe result.** The probe version denied `scripts/figure.mjs` and allowed `packet/lesson.txt` for `xprobe:novice-reader`. The hook received `agent_type: "xprobe:novice-reader"`.

**Cost.** The hook spawns `node` on every matched tool call in every session where the plugin is enabled, and node starts in roughly 30-50 ms. To make it near-free, prefix a shell check that exits early when stdin lacks `"agent_type":"explainer:` [the shell pre-filter is unverified].

**Limits.**
- The fence guards reads, not knowledge. The expert can still know the canonical answer (which is desired).
- Readers have no Write, Edit or Bash, so they cannot create files or symlinks to escape the fence.

### 4.5 Rubrics the scorer applies

**Novice, per chapter (1-5):**

| Score | Anchor |
|---|---|
| 5 | The say-it-back matches the chapter objective. No lost points. Every term was met only after its definition. |
| 4 | At most one *minor* stumble (a re-read), resolved by the next step. The say-it-back is correct. |
| 3 | One real lost point (couldn't follow a step, or needed outside knowledge), *or* a term used before its definition, *or* a partly wrong say-it-back. |
| 2 | Several lost points. The say-it-back misses the chapter's point. |
| 1 | The chapter is unintelligible, or teaches something false. |

**Expert, per finding severity:**
- `wrong`: false at some knob setting or in general
- `misleading`: a simplification that becomes false
- `missing`: a nuance an expert would expect in `deeper`
- `nit`

The expert also lists ≥ 1 quoted "learned or appreciated" nuance from `deeper`. That is acceptance bar §7: if none can be quoted, the bar fails.

**Gates:**
- Novice: every chapter ≥ 4 on **both** novice personas.
- Expert: 0 open `wrong` or `misleading` findings, and ≥ 1 nuance.
- Canaries caught.
- All reports valid.

### 4.6 Prompt drafts

These are the bodies in §5. The key prompt elements are:
- the persona
- the rules of evidence (verbatim quotes, step numbers)
- the forbidden outputs ("overall it's great")
- a fixed output schema the check script can parse (a fenced JSON block, followed by prose)

---

## 5. Draft agent files (do not create yet; target `agents/`)

### 5.1 `agents/curriculum-designer.md`

```markdown
---
name: curriculum-designer
description: Stage 1 of the /explainer teacher pipeline. Designs the lesson skeleton (goal, objectives, prerequisites, misconceptions, the everyday picture, the chapter ladder with planned step ids) for one CS concept before any simulation code exists. Use only when the explainer lead delegates stage 1.
model: opus
effort: high
maxTurns: 40
tools: Read, Grep, Glob, Write, WebSearch, WebFetch
color: purple
---

You design lessons for Explainer: interactive pages that RUN a computing concept as a real, deterministic
simulation and narrate it step by step. You write the plan, not the code and not the final words.

Read first, every time:
- ${CLAUDE_PLUGIN_ROOT}/references/teaching.md (the teaching standard; sections 1-6 and 8)
- ${CLAUDE_PLUGIN_ROOT}/examples/linked-list/lesson.mjs and figure.mjs (the reference lesson)

Input (in the delegation message): the concept, the user's words, the target directory, the level
(intro | core | deep) if the lead fixed it, and any constraints.

Do:
1. Pin the truth. Find the canonical source (paper, RFC, textbook chapter, kernel or library source) and
   one or two secondary sources. Record exact rules and realistic numbers. Cite URLs.
2. Find real misconceptions: what students actually get wrong (course forums, textbook "common errors"
   boxes, Stack Overflow duplicates, concept-inventory literature). Keep 2-4, each as
   { id, wrong (in the student's words), fix (one sentence) }. Never invent a misconception to fill a slot.
3. Write 3-5 objectives as observable verbs (explain, predict, perform, compare, choose, compute).
   Each objective must be checkable by one quiz question; write that question's stem next to it.
4. Choose one everyday picture and a 3-5 row picture↔real map.
5. Build the chapter ladder: one new idea per chapter, the naive way before the fix, at most 2 new terms
   per chapter at intro and 3 at core. For each chapter list the planned step ids (`chapter.verb-noun`),
   which objective each step serves, and which misconception step confronts it (with the predict question
   that sits right before it).
6. Name the stories the way a learner would ask ("One machine is slow").

Write exactly two files in the target directory:
- `lesson.mjs`: the skeleton (`goal`, `objectives`, `prerequisites`, `misconceptions`, `picture`,
  `chapters: [{ name, idea, terms, steps: [{ id, serves, confronts? }] }]`, `steps: {}` left empty).
- `review/curriculum.md`: sources with URLs, the exact rules and numbers, and why this ladder.

Rules: no simulation code; no step prose beyond a 6-word intent per step id; every misconception has a
planned confronting step and a predict question; every objective maps to a planned check. If the concept
has no mechanism to run, say so and stop.

Return: a 10-line summary: the level, the chapters, the misconceptions, the top 3 sources, and anything
you were unsure of.
```

### 5.2 `agents/teacher.md`

```markdown
---
name: teacher
description: Stages 3 and 6 of the /explainer teacher pipeline. Writes and revises every step's layered words (plain, why, look, deeper), chapter cards, checks and per-option feedback in lesson.mjs against the real run. Use only when the explainer lead delegates stage 3 or 6.
model: opus
effort: high
maxTurns: 80
tools: Read, Grep, Glob, Edit, Write, Bash
color: green
---

You are the best teacher a CS student ever had: you make a first-timer get it, and you give a ten-year
practitioner one thing they didn't know. You write the words of an Explainer lesson. The figure owns the
truth; you own the words; you never change figure.mjs.

Read first: ${CLAUDE_PLUGIN_ROOT}/references/teaching.md, the target's `lesson.mjs` skeleton,
`review/curriculum.md`, and the run itself:
  node ${CLAUDE_PLUGIN_ROOT}/scripts/lesson.mjs <figure.mjs> --json --all --no-lint
Every number you write must come from the run or be a template (`{n}`, `{addr:n48}`) that resolves at every
knob extreme. Read figure.mjs when you need to know what a step really does.

For every step id in the run, write:
- plain: what just happened, ≤ 18 words, present tense, grade ≤ 6.
- why: how this moves toward the goal, ≤ 25 words, grade ≤ 6. Key steps (keep, ask sites) must have it.
- look: entity ids the reader should watch (must exist at that step).
- deeper: the precise version: cost, real numbers, the code line, an edge case, a source. Define any term
  you use. Key steps must have it, and the figure must carry at least one real nuance an expert would value.
- picture: which analogy row this step uses, when it uses one.
Plus chapter cards (so far / now / you'll know it worked when), one check per chapter, and per-option
feedback for every wrong option that names the misconception it reflects.

Stage 6 (revise): the lead gives you `review/round-N/findings.json` (verified findings only) and scores.
For every finding write a line in `review/round-N/response.md`: `fixed: <what changed>` or
`declined: <reason, with a source>`. Never decline a novice "lost" finding by saying the reader should have
known; fix the text. Decline an expert finding only with a citation; the lead adjudicates.

Gate before you return: `node ${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs <figure.mjs>` ends `0 failing` with no teaching
errors. Do not read anything under bench/ or review/packet/. Do not spawn agents.

Return: the counts (steps written, key steps, checks), lint status, and for stage 6 the fixed and declined counts.
```

### 5.3 `agents/novice-reader.md`

```markdown
---
name: novice-reader
description: Stage 4 of the /explainer teacher pipeline. A first-timer cold-reads a lesson packet (transcript chunks and key frames only) and reports every place they got lost, with verbatim quotes. Use only when the explainer lead delegates stage 4.
model: sonnet
effort: medium
maxTurns: 40
tools: Read
omitClaudeMd: true
color: yellow
---

You are a learner, not a reviewer. The delegation message gives your persona (for example: "a first-year
student who knows basic Python: variables, lists, loops, functions; has never taken a data-structures
course") and the packet directory. You have never studied this topic. Wherever you notice you understood
something only because you already knew it, write that down: a real first-timer would not have.

Read `index.md`, then every file in the order it lists, one at a time, including every image. Do not skip
ahead. When a chunk ends on a prediction question, write down your guess and your reason BEFORE reading the
next chunk.

You can read only the packet. Don't look for source code; you won't find any.

Report, as your final message, a fenced ```json block and nothing before it:
{
  "persona": "...",
  "chapters": [
    { "chapter": 1,
      "say_it_back": "2-3 sentences in your own words: what this chapter taught",
      "lost": [ { "step": 7, "quote": "<exact words from the packet>",
                  "what_i_thought": "...", "what_i_needed": "...", "severity": "blocked|slowed" } ],
      "prior_knowledge": [ { "step": 9, "quote": "...", "why": "I only knew this from before" } ],
      "image": [ { "file": "03-insert.png", "issue": "couldn't tell which arrow the text meant" } ] } ],
  "guesses": [ { "question": "<quote>", "my_guess": "B", "why": "...", "right": false } ],
  "weakest_three": [ { "step": 0, "quote": "...", "why": "..." } ],
  "outcome": "Explain the whole idea to a friend in 4 sentences."
}
Rules: every quote is copied exactly from the packet (it is machine-checked; a wrong quote discards the
finding). `weakest_three` is required even if everything was clear: rank the three least clear moments.
No scores, no praise, no advice on how to fix it: only what happened in your head.
```

### 5.4 `agents/expert-reader.md`

```markdown
---
name: expert-reader
description: Stage 5 of the /explainer teacher pipeline. A senior engineer or PhD in the area cold-reads a lesson packet and reports every imprecision, misleading simplification, wrong number and missing nuance, with verbatim quotes and sources. Use only when the explainer lead delegates stage 5.
model: opus
effort: high
maxTurns: 50
tools: Read, WebSearch, WebFetch
omitClaudeMd: true
color: red
---

You are a domain expert (the delegation message names the field: e.g. "distributed-systems researcher who
has implemented Raft in production"). You are reading a lesson written for beginners, at its Expert depth.
Beginners deserve simplifications; they do not deserve falsehoods. Your job is to find the line between them.

Read `index.md`, then every packet file in order, including images. You may search the web to confirm a
fact; prefer primary sources (papers, RFCs, specs, official docs, kernel/library source). You may not fetch
the lesson's own source or published pages; the fence will refuse them.

Report, as your final message, a fenced ```json block:
{
  "field": "...",
  "findings": [ { "step": 13, "layer": "plain|why|deeper|card|check|image",
                  "quote": "<exact words>", "severity": "wrong|misleading|missing|nit",
                  "problem": "...", "correct_version": "...", "source": "<URL or citation>" } ],
  "least_precise_three": [ { "step": 0, "quote": "...", "why": "..." } ],
  "nuance_learned": [ { "step": 13, "quote": "...", "why_it_is_valuable": "..." } ],
  "numbers_checked": [ { "quote": "...", "ok": true, "source": "..." } ]
}
Rules: quotes exact (machine-checked). `wrong` and `misleading` need a source. Judge each statement under
every reading a beginner could take from it. Check every number you see. `least_precise_three` is required.
If you found no nuance worth learning, say so with an empty list: that is a finding, not a failure of yours.
No scores.
```

### 5.5 `agents/scorer.md`

```markdown
---
name: scorer
description: Scores verified reader findings against fixed rubrics for the /explainer teacher pipeline. Blind to round, author and history. Use only when the explainer lead delegates scoring.
model: opus
effort: medium
maxTurns: 25
tools: Read
omitClaudeMd: true
color: blue
---

You grade a lesson's chapters from reader evidence. You did not write the lesson and you do not know which
draft this is. Score only from evidence; when evidence is missing, score lower, not higher.

Inputs (paths in the delegation message): the packet, and `findings.json` (reader reports whose quotes a
script has verified). First read ${CLAUDE_PLUGIN_ROOT}/bench/calibration/anchors.md: worked examples of
chapters at 2, 3, 4 and 5, so your scale matches the anchors.

Novice rubric per chapter: 5 = say-it-back matches the chapter's objective, no lost points, no term before
its definition; 4 = at most one minor stumble resolved next step, say-it-back correct; 3 = one real lost
point, or a term used before definition, or a partly wrong say-it-back; 2 = several lost points or the
say-it-back misses the point; 1 = unintelligible or false. Score each novice persona separately.

Expert: list every `wrong` and `misleading` finding as open. Confirm `nuance_learned` has at least one item
quoting the deeper layer.

Return only a fenced ```json block:
{ "novice": [ { "persona": "...", "chapters": [ { "chapter": 1, "score": 4, "evidence": ["<finding ids>"],
                "why": "one sentence" } ] } ],
  "expert": { "open": ["<finding ids>"], "nuance": true },
  "gate": { "novice_min": 4, "pass": false, "reasons": ["..."] } }
Every score cites the evidence it rests on. A 5 with no evidence is not allowed: cite the say-it-back.
```

### 5.6 `agents/quiz-writer.md` (benchmark only)

```markdown
---
name: quiz-writer
description: Writes frozen pre/post quiz items for the Explainer teaching benchmark from a concept's canonical source, independent of any lesson. Use only when building bench/.
model: opus
effort: high
maxTurns: 30
tools: Read, WebSearch, WebFetch, Write
color: cyan
---

Write bench/<concept>/quiz.json for one concept from its canonical source and a standard syllabus, NOT
from any Explainer lesson (never read examples/ or any lesson.mjs). Five items:
1 mechanism (what happens and why), 2 transfer (a new instance with different numbers: predict the outcome),
1 misconception probe (the wrong option is the classic error), 1 free-response "explain why" with a model
answer and a 3-point rubric. Multiple choice: 4 options, one key. Numeric: exact answer and tolerance.
Each item names the objective it tests. Also write a nonce-word version (see bench spec) where the concept
name and its key terms are replaced by invented words given in a glossary. Return the file path.
```

---

## 6. Pipeline orchestration spec (PLAN §2.5)

**Who does what.**
- The lead is the main conversation running `/explainer`.
- All pipeline state lives in the figure's directory `<dir>/`.
- Reviewers never write files. The lead saves their final messages.

```
<dir>/figure.mjs  lesson.mjs  README.md  <name>.html
<dir>/review/
  state.json                 # { stage, round, mode: "fenced"|"unfenced", hashes, history[] }
  curriculum.md
  packet/                    # rebuilt every round (fenced read zone)
  round-1/ novice-a.json novice-b.json expert.json canary.json findings.json scores.json response.md
  round-2/ …
```

| Stage | Actor | Input | Output (files) | Gate (who checks) | On failure |
|---|---|---|---|---|---|
| 0 Intake | lead | the user's prompt | `review/state.json`; size and time estimate told to the user | the concept has a runnable mechanism | ask the user |
| 1 Curriculum | `explainer:curriculum-designer` | concept, level, constraints | `lesson.mjs` skeleton, `review/curriculum.md` | **lint `--skeleton`** (new): every objective has a check stem; every misconception → a planned step + a predict; term load per chapter ≤ the level cap; 3-6 chapters. **Lead** reads the skeleton and confirms the misconceptions are real (sources cited). | respawn with the lint findings, max 2 |
| 2 Simulation | lead (today's skill) | skeleton, `curriculum.md` | `figure.mjs` with `s.step(…, { id })` for every planned id | `verify` 0 failing; **every skeleton step id exists in the run** (new check) | lead fixes |
| 3 Words | `explainer:teacher` | skeleton, run JSON, `figure.mjs` | full `lesson.mjs` | `verify` 0 failing incl. the new lesson-lint gates (§2.5 list) | teacher fixes, max 2 internal attempts, then lead |
| 3.5 Packet | lead (scripts) | `figure.mjs`, `lesson.mjs` | `build`, `shoot --teach`, `review-packet.mjs` → `review/packet/`, `round-N/canary.json` | the packet has every chapter; images present | lead fixes |
| 4 Novice ×2 | `explainer:novice-reader`, two personas, **parallel** | packet path, persona | final message → `round-N/novice-a.json`, `novice-b.json` | `review-check.mjs`: valid JSON, ≥ 3 verified quotes, canary caught | rerun once; second failure → escalate the reader problem to the user |
| 5 Expert | `explainer:expert-reader`, **parallel with 4** | packet path, field | → `round-N/expert.json` | same check | same |
| 5.5 Score | `explainer:scorer` | packet, `findings.json` (verified, canaries stripped) | → `round-N/scores.json` | the gate in §4.5 | — |
| 6 Revise | `explainer:teacher` | `findings.json`, `scores.json` | `lesson.mjs`, `round-N/response.md` | `verify` clean; every finding has a fixed or declined line | → 3.5, next round |
| 7 Look | lead | the built page | `shoot` (both themes, phone), `audit`, `--teach` shots | audit clean; the lead reads the contact sheet and the key PNGs against the SKILL.md visual checklist | lead fixes; if the words changed → 3.5 for one more round |

**Lead duties at each gate:**
- **After 1.** Sanity-check the misconceptions against `curriculum.md` sources. This is the only gate where the lead may involve the user, by showing the skeleton when the request is ambiguous.
- **After 3.5.** Never show the packet to the teacher. Keep `canary.json` out of every agent's input.
- **After 4/5.** Run `review-check.mjs`, which merges, verifies quotes, strips canaries, assigns finding ids, and writes `findings.json`. The scorer gets ids, not reader names.
- **After 5.5.**
  - **Pass** → stage 7.
  - **Fail** → stage 6.
  - **Expert `declined` findings** are adjudicated by the lead with the cited source. Upheld → back to the teacher. Overturned → recorded in `response.md` and closed.
  - **If a finding needs a simulation change** (a wrong number that comes from `figure.mjs`), go back to stage 2, at most once per figure.
- **Delivery note** includes:
  - the rounds used
  - the final scores per chapter
  - the open `missing` and `nit` findings
  - any declined expert findings and the reason
  - the mode (fenced or unfenced)

**Loop limits:**
- At most **3 revise rounds** (stage 6).
- At most **1** return to stage 2.
- At most **1** reader rerun per round for an invalid report.
- **No progress:** if a round raises neither the minimum novice chapter score nor the count of closed `wrong`/`misleading` findings, stop early and escalate.
- **Escalation:** stop and show the user the remaining findings, the scores history, and a diff. Never ship a failing lesson silently.

**Cost per round** (rough, [unverified]):
- two sonnet novice reads of ~3-5k text tokens + ~10-15 images (~1.5k tokens each)
- one opus expert read plus web checks
- one opus scorer

That is roughly 150-250k tokens per round. A three-round figure adds about 0.5-0.8M tokens to today's cost.

**`/explainer:teacher <figure.mjs>`** (the teacher skill) runs stages 3-7 on an existing figure. It is the M6 migration tool for the 8 examples, and the way to re-review after a hand edit.

---

## 7. Benchmark harness spec and its limits (PLAN §2.5)

### 7.1 The core problem

The simulated learner is an LLM, and it already knows linked lists, stacks, binary search, hash tables, TCP, B+ trees, caches, DNS, Raft, GC, virtual memory and attention.
- A plain pre/post design measures `accuracy(with lesson) − accuracy(without)`.
- I expect C0 (no lesson) to sit near the ceiling for most of the 12 concepts [unverified: run the pilot in 7.4 first].
- The gain would then be about 0 whatever the lesson's quality.

**As specified in PLAN §2.5, the benchmark would not measure teaching.**

### 7.2 Design

**Concepts.** The 12 in PLAN, in `bench/concepts.json` (`{ id, level, figure }`).

**Quiz.**
- `bench/<id>/quiz.json` is written by `quiz-writer` from the canonical source, **before and independent of** the lesson. The user reviews it, then it is frozen and versioned.
- The fence denies `bench/` to curriculum-designer and teacher, so lessons are never taught to the test.
- Five items:
  1. mechanism
  2. transfer, on a new instance
  3. transfer, on another new instance
  4. misconception probe
  5. a free "explain why", graded by the scorer with a 3-point rubric
- Items 1-4 are graded deterministically (MCQ or numeric). Item 5 is graded by the scorer against the model answer.

**Conditions** (one stateless call per item per sample; the learner never carries memory between conditions):

| Id | Learner sees | Purpose |
|---|---|---|
| C0 | nothing | prior (the "pre" score) |
| C1 | reader-mode transcript (New level) | "post" |
| C1i | C1 + key frames | multimodal variant |
| C2-why, C2-deeper | C1 with one layer removed | **ablation sensitivity**: does the layer carry the learning? |
| C2-chN | C1 with chapter N removed | which chapters matter |
| P | a placebo text of equal length (a generic encyclopedia-style summary of the concept) | does *this* lesson beat *any* text? |
| N0, N1 | **nonce mode**: concept name and key terms replaced by invented words (glossary given) in both quiz and transcript | reduces retrieval from prior knowledge |

- **Learner models.**
  - `haiku` as the primary learner: a weaker model, so the score has more room to move.
  - `sonnet` as a check.
  - The persona prompt says "answer only from what you read; say 'not stated' if the reading doesn't say". It is used **and measured**: if C0 ≥ 3/5, that concept's persona is marked "contaminated" and its pre/post gain isn't reported.
- **Samples.** k = 5 per (concept × condition × learner). Report mean ± 95% bootstrap CI. Differences under ~0.5 item are noise.
- **Harness.** `node scripts/bench-teach.mjs [--concept id] [--conditions C0,C1,N0,N1,C2-why] [--learner haiku] [--k 5]`.
  - It calls the Claude API (or `claude -p` with `--model`) per item, with no tools.
  - It writes `bench/results/<date>-<sha>.json` and a markdown table.
  - The packet text comes from the same reader-mode formatter as §4.3, so the benchmark and the reviewers see the same thing.
- **What is reported per figure** (this feeds M6):
  - N1 − N0 (nonce gain)
  - C1 − P (beats placebo)
  - the ablation drops (C1 − C2-x)
  - C1 − C0 only where it isn't contaminated
- **Regression use.** A lesson change must not lower C1 or N1 beyond the CI, and the `why` and `deeper` layers should each show a drop > 0 when ablated.
- **Calibration** (shared with §4.2 #8): the known-bad packets should score below the known-good one on N1. If they don't, the harness is broken.

### 7.3 Alternatives considered

- **Knowledge-ablated personas ("pretend you don't know X")**: unreliable. Models leak knowledge under role-play. Keep the persona, but treat it as a modifier and measure it with C0, not as a control.
- **Explanation quality against a rubric (no learner)**: this is what the scorer and the reviewers already do. It is stable and cheap, but it measures text against our own standard, not learning. Keep it as the primary quality gate. The benchmark is a secondary, quantitative regression signal.
- **Counterfactual concepts** (a fictional protocol with changed rules): this removes prior knowledge entirely, but the lessons teach the real thing, so it needs a purpose-built figure. Useful only to validate the harness, once.
- **Teach-back** (the learner explains to a peer): already folded in as quiz item 5 and the novice's say-it-back.

### 7.4 Pilot before building it all

1. Write quizzes for 3 concepts: linked list, B+ tree, Raft.
2. Run C0, C1, P, N0 and N1 with haiku, k = 5.
3. **Kill or reshape the design:**
   - If C0 ≥ 4/5 everywhere, drop the C1 − C0 reporting.
   - If N1 − N0 is also ≈ 0, the benchmark can't see this lesson's teaching. Fall back to the rubric gates plus §4.5 students.

### 7.5 Honest limits

- **What simulated learners lack.** No working-memory limit, no fatigue, no motivation, no confusion from animation pacing, and no misconceptions from a lived past. They read a transcript, not an interactive page with a scrubber, knobs and "your turn" steps. Active learning (§2.3) is invisible to them.
- **Nonce mode is partial.** It hides names, not structure. A model can still recognise "five servers voting for a leader with terms".
- **The gain measures text informativeness** for a model, which is a proxy for clarity at best.
- **LLM grading of item 5 inherits judge biases** (verbosity, self-preference).
- **Multiple-choice items can be gamed** by test-taking heuristics. The transfer items with new numbers reduce this.
- **What the results can and can't support.** Use them to compare versions of the same lesson and to catch regressions. Never claim "students learn X% more". Ground truth is §4.5: real students, think-aloud, and pre/post quizzes with the same frozen items.

---

## 8. Changes I'd make to PLAN.md

**§2.4:**
- Add `formatLesson({ reader: true, level, withhold: true })` to the M1 work. The review packet and the benchmark both depend on it.
- Note that today's `lesson.mjs` prints lint findings, ids and answers, so it cannot be the reader's input as-is.

**§2.5:**
- Replace the 7-row table with §6's table. That adds 3.5 Packet and 5.5 Score, runs stages 4 and 5 in parallel, uses two novice personas, and has readers return reports (never write files).
- State the loop limits: 3 revise rounds, 1 return to simulation, 1 reader rerun, early stop on no progress, escalate to the user.
- Make "only what a reader sees" concrete: a reader-mode packet plus the tested **plugin `PreToolUse` fence hook**. Plugin agents can't carry their own hooks or `permissionMode`.
- Add the scorer and the deterministic `review-check.mjs` (quote verification + canaries) as the anti-rubber-stamp core, plus the calibration set.
- Note that the plugin agents need a fallback path: unfenced single-agent mode when the agents are not loaded, labelled in the delivery note.
- Note that only the lead orchestrates, and no pipeline agent gets the `Agent` tool.
- **Benchmark.**
  - Reframe from pre/post gain to nonce-mode gain + placebo + layer ablation, with C0 reported only where it isn't contaminated.
  - Quizzes are written independently by `quiz-writer`, frozen, and fenced from the authoring agents.
  - Run the 3-concept pilot before writing 60 items.

**§5:** Per-invocation `effort` on the Agent tool exists from v2.1.292. This machine is on v2.1.285, so frontmatter stays the way to pin effort.

**§6:**
- **M1:** its done-when ("passes both personas") needs the persona agents, the fence and the packet, which are listed under M2. Either move `novice-reader`, `expert-reader`, `scorer`, `review-packet.mjs`, `review-check.mjs` and the fence hook into M1, or reword the M1 bar as "passes a manual cold read". I recommend moving them; they are small and the linked-list rewrite should be the first thing they review.
- **M2 contents:** add
  - `.claude-plugin/plugin.json` and `marketplace.json`
  - `"skills": ["./"]`
  - `metadata.internal` on the teacher skill
  - `SKILL.md` paths moved to `${CLAUDE_SKILL_DIR}`
  - the README's two install paths
  - the `/explainer:teacher` skill (stages 3-7 on an existing figure)
- **M2 done-when:** add
  - `claude plugin validate --strict .` passes
  - in a throwaway `HOME`, `npx skills add <repo> -g -a claude-code -y` yields `explainer@skills-dir` with all agents (`claude plugin details explainer`)
  - in another throwaway `HOME`, a local marketplace install yields the same inventory
  - the calibration set: readers catch ≥ 80% of seeded defects and score known-bad ≤ 3
  - the fence denies a reader's Read of `figure.mjs` (a test)
- **M6:** "benchmark gain recorded per figure" becomes "nonce gain, placebo margin and layer ablations recorded per figure (where the pilot showed the benchmark has signal)".

**§8, new risks:**

| Risk | Mitigation |
|---|---|
| Install paths diverge (one loads agents, the other doesn't) | One manifest name; a CI check of both paths in a temp `HOME`; `SKILL.md` single-agent fallback |
| The skills CLI changes discovery or its blob fast path (for root skills, the blob path installs only `SKILL.md` today) | Keep the git-clone install line in the README; re-run the install check before each release |
| An LLM novice already knows the topic, so it under-reports confusion | Deterministic defined-before-use lint; the prior-knowledge flag in the persona; say-it-back grading; real students (§4.5) |
| A reviewer reads the source | Plugin `PreToolUse` fence on `agent_type`; readers get `Read` only and no Write or Bash |
| The plugin hook runs in every session | Early-exit shell pre-filter; match only Read, Grep, Glob, Bash and WebFetch |
| Reviewer drift after a model or prompt change | Calibration set rerun on every change |
| The marketplace copy is pinned by `version` | Bump `version` per release; auto-update is off by default for third-party marketplaces, so the README tells users to run `claude plugin update explainer` |

**§9:** Mark Q3 resolved: the plugin layout is in §2.2 here, and the old npx line keeps working unchanged.

**Appendix B, new files:**
- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
- `hooks/hooks.json`
- `scripts/reader-fence.mjs`, `scripts/review-packet.mjs`, `scripts/review-check.mjs`
- `agents/scorer.md`, `agents/quiz-writer.md`
- `bench/concepts.json`, `bench/<id>/quiz.json`, `bench/calibration/`
- **Changed:** `scripts/lib/lesson.mjs` (reader mode)

---

## Appendix: probe log (scratchpad only)

| # | What I ran | Result |
|---|---|---|
| 1 | `claude plugin validate` on a root-`SKILL.md` + `skills/teacher` + `agents/` + `marketplace.json` (`source "./"`) probe | passed (one warning: no marketplace description) |
| 2 | `claude --plugin-dir probe plugin details xprobe`, with and without `"skills": ["./"]` | `Skills (2) teacher, xprobe` with it; `Skills (1) teacher` without |
| 3 | headless `claude -p --plugin-dir`, asking which agents and skills load | `xprobe:novice-reader`; `xprobe:teacher`, `xprobe:xprobe` |
| 4 | spawned `xprobe:novice-reader` (`tools: Read`) | its tools were `Read` only; `${CLAUDE_PLUGIN_ROOT}` was substituted |
| 5 | plugin `PreToolUse` hook keyed on `agent_type` | allowed `packet/lesson.txt`, denied `scripts/figure.mjs` |
| 6 | `HOME=<tmp>`: probe copied to `~/.claude/skills/xprobe`, then `claude plugin list` and `details` | `xprobe@skills-dir`: teacher skill, agent and hook loaded; root not duplicated |
| 7 | `HOME=<tmp> npx skills@latest add <probe> -g -a claude-code -y` (skills CLI 1.7.2) | full directory copied incl. `.claude-plugin/`; Claude Code then loaded it as `xprobe@skills-dir` |
| 8 | `HOME=<tmp>`: `claude plugin marketplace add <local repo>` + `claude plugin install xprobe@xprobe-mkt` | `Skills (2) teacher, xprobe · Agents (1) · Hooks (1)` |

**Not probed:**
- whether invoking the root skill in skills-dir mode shows exactly `/xprobe`: the headless session in the temp `HOME` had no login. The docs say it does.
- installing from GitHub (`irfanalimd/explainer` isn't a plugin yet). The local-path and clone code paths are the same per the source.
