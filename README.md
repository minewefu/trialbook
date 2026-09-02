# Trialbook

**Run experiments with your agent. Keep the lab notebook together.**

Trialbook is a browser science lab built for people and their AI agents. You adjust sliders and watch a
simulation. Your agent, through [WebMCP](https://webmachinelearning.github.io/webmcp/) tools, sets
parameters, runs single trials and cancellable parameter sweeps, plots the results, and writes hypotheses,
observations and conclusions into a shared lab notebook under its own name. Everything either of you does is
attributed and editable.

Built for the [OpenAI WebMCP Challenge](https://webmcp.devpost.com/) (August 25 to September 3, 2026).
All code in this repository was written during the submission period.

> **Status: milestone 1 of 5.** The WebMCP layer, the in-app Tools panel and the first tool
> (`get_lab_state`) are live. Experiments, sweeps, charts and the notebook come next.

**Live app:** https://minewefu.github.io/trialbook/

## Try it with an agent

### ChatGPT desktop app (no setup)

1. Open the built-in browser from the ChatGPT toolbar and load the live URL.
2. A gray arrow in the address bar lists the page's site tools. It turns blue while ChatGPT uses them.
3. Ask: *"Read the lab state and tell me what you can do here."*

Requires the latest desktop app with GPT-5.6 Sol or Terra and "Enable site tools" switched on under
Browser settings, Permissions. Site tools are not available on Enterprise or Edu workspaces.

### Google Chrome 149 or newer

1. Enable `chrome://flags/#enable-webmcp-testing` and `chrome://flags/#devtools-webmcp-support`, then relaunch.
2. Open the live URL, then DevTools, Application, WebMCP to see the registered tools and run them by hand.

### Any browser

The Tools panel inside the app lists every registered tool with a Run button. It uses the same code path
the agent uses, so you can exercise the tools without an agent.

## Tools

| Tool | Hint | What it does |
|---|---|---|
| `get_lab_state` | read-only | Which experiment is open, its parameters and latest measurements, notebook and result counts, and what the person changed since the agent last looked. |

More tools land with each experiment. The full plan is in [`docs/BUILD_PROMPT.md`](docs/BUILD_PROMPT.md).

## How WebMCP is used

- Every tool is registered with `document.modelContext.registerTool(...)` through one small wrapper,
  [`src/lib/webmcp.ts`](src/lib/webmcp.ts). It feature-detects the API, keeps a local registry that powers
  the in-app Tools panel and Activity log, clamps results to about 1.4K characters, and turns thrown errors
  into `{ ok: false, error, hint }` so the model can correct itself and retry.
- Read-only tools carry `readOnlyHint`. Tools that return text written by people carry
  `untrustedContentHint`.
- Experiment-specific tools are registered when an experiment opens and unregistered when it closes
  (`swapGroup`), so the agent only ever sees tools that apply to the current page state.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173/trialbook/
npm run build    # type-check + production build into dist/
```

Every push to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`.

## License

MIT. See [`LICENSE`](LICENSE).
