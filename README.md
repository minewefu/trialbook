# Trialbook

**Run experiments with your agent. Keep the lab notebook together.**

Trialbook is an inquiry-lab workbench for people and their AI agents. You adjust sliders and watch a
simulation. Your agent, through [WebMCP](https://webmachinelearning.github.io/webmcp/) tools on the same
page, runs sweeps, finds optima, quantifies uncertainty, fits the law behind the data, and writes in a shared
lab notebook under its own name. Everything either of you does is attributed, and the exported report says
exactly who did what.

It is built for the way science labs are actually taught: hypothesis first, then trials, then a fit, then a
conclusion someone can grade. Assignment mode makes the agent a lab partner rather than a ghostwriter: it
cannot run a sweep until the student has written a hypothesis, and its conclusions arrive as proposals the
student accepts, edits or rejects.

Built for the [OpenAI WebMCP Challenge](https://webmcp.devpost.com/) (August 25 to September 3, 2026).
All code in this repository was written during the submission period.

> **Status: feature complete.** Four experiments with tested physics (projectile motion, pendulum, predator
> and prey, RC circuit), fourteen WebMCP tools, fitting of sweep results and of single-trial curves,
> optimisation, measurement error with error bars, assignment mode, and a generated tools reference.
> Remaining before submission: screenshots and the demo video.

**Live app:** https://minewefu.github.io/trialbook/

Verified end to end in ChatGPT's built-in browser (GPT-5.6 Sol, Windows desktop app) and in Chrome 151 with
the WebMCP flags: sweeps, charts, notebook entries, the change feed, and the experiment tool swap all work
from a plain conversation.

## The workflow

1. **Ask a question.** "Does the period depend on the length?" In assignment mode, write your hypothesis
   first; until you do, the agent can run single trials but not sweeps.
2. **Let the agent run the tedious part.** `sweep_parameter` runs up to 50 trials with a progress bar you can
   cancel, `optimize_parameter` finds a maximum or minimum by golden-section search, `run_repeats` measures
   the same thing many times with simulated measurement error and reports mean, sd and standard error.
3. **Find the law.** `plot_results` charts any measurement against any parameter, with error bars when there
   are repeats. `fit_model` fits a line, parabola, power law or exponential and returns the equation in the
   real variable names with R², so the agent can say "period ∝ length^0.50" instead of eyeballing it.
4. **Decide together.** The agent's conclusion lands in the notebook, as a proposal if assignment mode is
   on. You accept, edit or reject it. Every entry records who wrote it and the settings at the time.
5. **Hand in the report.** `export_report` writes Markdown with the trials, sweeps, charts, fits, the
   notebook, and a "who did what" table including how many proposals were accepted, edited or rejected.

## Experiments

| Experiment | What you vary | What gets measured | Engine |
|---|---|---|---|
| Projectile motion | speed, angle, launch height, gravity, air drag | range, flight time, max height, impact speed | closed form without drag; semi-implicit Euler with quadratic drag, tested against the closed form within 0.5% |
| Pendulum | length, release angle, gravity, damping | period, small-angle period, deviation, peak speed, decay time | RK4 on the full nonlinear equation, tested against the exact elliptic-integral period within 0.5% |
| Predator and prey | growth, predation, efficiency, death rate, starting numbers, duration | population extremes, cycle length, time averages | RK4 on Lotka–Volterra, tested for conservation of the invariant and the time-average theorem |
| RC circuit | resistance, capacitance, supply voltage, charge or discharge, duration | time constant from the 63% crossing, R·C, half-time, final voltage, initial current, energy | exact first-order solution; the discharge curve fits an exponential with k = −1/τ, and a resistance sweep fits a line whose slope is C |

## Try it with an agent

### ChatGPT desktop app (no setup)

1. Open the built-in browser from the ChatGPT toolbar and load the live URL.
2. A gray arrow in the address bar lists the page's site tools. It turns blue while ChatGPT uses them.
3. Ask: *"Sweep the pendulum length from 0.25 to 4 m in 8 steps, fit a power law to the period, and tell me
   the exponent."*

Requires the latest desktop app with GPT-5.6 Sol or Terra and "Enable site tools" switched on under
Browser settings, Permissions. Site tools are not available on Enterprise or Edu workspaces.

### Google Chrome 149 or newer

1. Enable `chrome://flags/#enable-webmcp-testing` and `chrome://flags/#devtools-webmcp-support`, then relaunch.
2. Open the live URL, then DevTools, Application, WebMCP to see the registered tools and run them by hand.

### Any browser

The Tools panel inside the app lists every registered tool with a Run button. It uses the same code path
the agent uses, so you can exercise the tools without an agent.

## Tools

Lab-wide tools, always registered:

| Tool | Hint | What it does |
|---|---|---|
| `get_lab_state` | read-only | Open experiment, parameters with ranges, latest trial, counts, modes, pending proposals, and what the person changed since the agent last looked. Shrinks itself to stay under the output budget. |
| `open_experiment` | | Switch experiment; swaps the experiment tool group. |
| `get_results` | read-only | Paged trials with parameters and measurements, by sweep or by id. |
| `plot_results` | | Chart a measurement against a parameter, a measurement, or the trial number; repeats become error bars. |
| `fit_model` | | Fit linear, quadratic, power or exponential (or auto) and draw the curve; returns the equation, R², RMSE and a reading. |
| `notebook_add_entry` | | Write a hypothesis, observation, conclusion or note under the agent's name; conclusions become proposals in assignment mode. |
| `notebook_read` | read-only, untrusted content | Read the shared notebook, including what the person wrote. |
| `export_report` | | Build and download the Markdown lab report with attribution counts. |

Experiment tools, registered when an experiment opens and replaced when it changes. Their schemas describe the
open experiment; their handlers always act on whichever experiment is open, so a stale schema still behaves.

| Tool | What it does |
|---|---|
| `set_parameters` | Change parameters without running. Strict validation with the allowed range in every error. |
| `run_trial` | Run once, animate it for the person, return the measurements. |
| `sweep_parameter` | Up to 50 trials across one parameter, optionally with repeats, with a progress bar, cancellation, and per-measurement min and max. |
| `run_repeats` | Repeat the current settings with measurement error and return mean, sd and standard error. |
| `optimize_parameter` | Golden-section search for a maximum or minimum, with the bracket, the trial count and a single-peak caveat. |
| `reset_experiment` | Back to defaults. |

Every tool output stays under about 1.4K characters; larger result sets are paged. The complete reference with
every input schema is generated from the definitions: [`docs/tools.md`](docs/tools.md).

## Assignment mode and measurement error

- **Assignment mode** (off by default, toggle in the notebook): the agent may run single trials freely, but
  `sweep_parameter`, `run_repeats` and `optimize_parameter` refuse until the person has written a hypothesis
  for the open experiment, with an error that says exactly that. Agent conclusions become pending proposals
  with Accept, Edit and accept, and Reject buttons. The report's "who did what" table counts the outcomes.
- **Measurement error** (off by default, toggle in Parameters): every new reading gets a synthetic reading
  resolution plus a small relative error from a seeded generator, so repeats scatter and error bars mean
  something. This is a teaching approximation, not a calibrated instrument model, and it is labelled as
  synthetic in the app, the tool outputs and the report. The motion itself stays exact.

## How WebMCP is used

- Every tool is registered with `document.modelContext.registerTool(...)` through one small wrapper,
  [`src/lib/webmcp.ts`](src/lib/webmcp.ts). It feature-detects the API, keeps a local registry that powers
  the in-app Tools panel and Activity log, clamps results, and turns thrown errors into `{ ok: false, error, hint }`
  so the model can correct itself and retry.
- Read-only tools carry `readOnlyHint`. The tool that returns people's notebook text carries
  `untrustedContentHint`.
- Long operations honour the execution `AbortSignal`, so a cancel from the agent or the on-screen button
  stops a sweep, a repeat run or an optimisation and returns the partial results.
- Experiment-specific tools are registered when an experiment opens and unregistered when it closes
  (`swapGroup`), so the agent only ever sees tools that apply to the current page state.

## Docs

- [`docs/tools.md`](docs/tools.md): every tool with its schema, generated by `src/docs.test.ts` so it cannot drift.
- [`docs/SUBMISSION.md`](docs/SUBMISSION.md): the challenge write-up (fit for WebMCP, experience, what is newly possible, implementation).
- [`docs/VIDEO_SCRIPT.md`](docs/VIDEO_SCRIPT.md): the three-minute demo script.
- [`docs/DEPTH_PLAN.md`](docs/DEPTH_PLAN.md) and [`docs/BUILD_PROMPT.md`](docs/BUILD_PROMPT.md): the plans the project was built from.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173/trialbook/
npm test         # 58 tests: engines, fits, tools, store, docs
npm run build    # type-check + production build into dist/
```

Every push to `main` runs the tests and deploys to GitHub Pages through `.github/workflows/deploy.yml`.

## License

MIT. See [`LICENSE`](LICENSE).
