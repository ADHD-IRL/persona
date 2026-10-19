# MITRE AIP setup

The MITRE provider is implemented in `server/llmProvider.js`. It uses the endpoint from the reviewed PanelRoomStandAlone source, bearer authentication, `GET /models`, and OpenAI-compatible `POST /chat/completions`. The browser uses the authenticated local Node API; it never receives the AIP bearer key or chooses an upstream URL.

## Configure the server

Add these values to the ignored `.env` file beside `package.json`:

```dotenv
LLM_PROVIDER=mitre_aip
MITRE_AIP_BASE_URL=https://models.k8s.aip.mitre.org/v1
MITRE_AIP_API_KEY=<your AIP key>
MITRE_AIP_MODEL=
MITRE_AIP_SUPPORTS_TOOLS=false
MITRE_AIP_TOKEN_LIMIT_FIELD=max_tokens
MITRE_AIP_STREAM_USAGE=true
LLM_MAX_TOKENS=8192
```

Obtain your API key through the MITRE AI Platform access process identified by the reference application: `ai-platform.pages.mitre.org/models/api-access/`. Keep it on the server and out of Git.

Restart Node with `npm start` or `npm run server:dev` after changing configuration. For Docker, run `docker compose up --build -d` to recreate the app with the new environment. There is no silent fallback to Anthropic when an AIP request or configuration fails.

Sign in, open Settings, click **Refresh models**, and select an accessible model. **Test connection** sends a small candidate request without changing saved settings. **Save model** applies the browser's model preference for the current workspace. You can instead set `MITRE_AIP_MODEL` to an accessible default on the server; model names are not guessed.

Provider selection is server-owned. Set `LLM_PROVIDER=anthropic` to deliberately use the existing Anthropic provider. Existing workspace Anthropic keys are neither forwarded to AIP nor used as an AIP fallback.

## Model capabilities

- Set `MITRE_AIP_SUPPORTS_TOOLS=true` only after confirming tool support for the models your users will select. Tool schemas and assistant/tool-result messages are translated by the server. If support is disabled, tool requests fail with an actionable error rather than dropping tools.
- Some models require `max_completion_tokens` instead of `max_tokens`. Set `MITRE_AIP_TOKEN_LIMIT_FIELD` accordingly.
- `MITRE_AIP_STREAM_USAGE=true` requests usage metadata. Set it to `false` if the selected deployment rejects that option. Missing usage is marked unavailable; no Anthropic price estimate is invented for AIP.
- Responses must finish successfully. Token-limit termination, policy rejection, malformed tool arguments, premature EOF, and streamed provider errors fail the call. Partial analysis is not marked complete.
- Streaming text and non-streaming tool workflows are supported. Streaming tool calls are deliberately rejected; the application's tool loop uses non-streaming requests.

## Network and certificates

The machine running Node needs access to `models.k8s.aip.mitre.org`, potentially through the MITRE network or VPN. Browser access and trust on a managed Windows machine do not prove that a Node process or Linux container has the same access and CA trust.

For native Node, set `NODE_EXTRA_CA_CERTS` to a trusted PEM CA bundle before starting the Node process. Do not disable TLS verification.

For Docker, set `MITRE_AIP_CA_BUNDLE` to the absolute host path of the PEM file, then use the optional override:

```powershell
docker compose -f compose.yaml -f compose.aip-ca.yaml up --build -d
```

The override mounts the bundle read-only and points the container's Node process at that path. VPN routes and DNS also need to work inside Docker.

## Application boundary

`GET /api/llm/config` returns public provider status and capability flags. `GET /api/llm/models` lists IDs available to the server key. Both require an authenticated user and membership in the supplied `workspace_id`.

`POST /api/llm/messages` requires the existing session cookie and `x-workspace-id` membership check. The server translates the application's message contract and normalizes completion, tools, and stream events. The legacy `/api/anthropic` route dispatches through the same configured provider, so it cannot bypass an AIP deployment.

Usage is normalized to `input_tokens` and `output_tokens`, exposed in the connection test and through the frontend usage callback/sink. Billing prices are not assumed.

## Verification

`npm run verify` runs lint, the existing PostgreSQL/application tests, provider translation tests, and the production build. Mocked AIP responses exercise model discovery, server-only secrets, authorization, Unicode streaming, interruption/error cases, cancellation, JSON/tool translation, and the real frontend multi-step tool helper.

No live MITRE calls were made during implementation. AIP credentials, actual accessible model IDs, endpoint reachability, CA trust, and selected model capabilities still require confirmation in your environment. PanelRoomStandAlone remains unchanged as the reference.


## Response capacity and recovery

Token limits and evidence preservation: SME rounds request 4,096 output tokens; synthesis, comparison and decision briefs request 6,144. MITRE AIP retries output-limit failures at most twice with a larger allowance, up to the server-configured ceiling (8,192 by default). The input stays unchanged; incomplete text is replaced and never marked complete. Completed SME turns remain saved. Oversized synthesis and brief inputs use section reviews with exact-quote and section-coverage checks. These checks do not guarantee semantic equivalence; review original evidence and disagreements before accepting conclusions. If sections cannot fit or validation fails, the analysis stops explicitly. The knowledge retriever still selects relevant chunks; it does not send the entire library. Retry attempts take additional time and model usage. Provider context limits and output limits are different; verify model support before increasing LLM_MAX_TOKENS. Changes apply to newly generated steps; completed results are not rewritten.
