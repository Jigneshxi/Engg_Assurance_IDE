# VVnT Converge — Complete User Manual (user_manual11)
> **Engineering Assurance Platform** | Sovereign Multi-Agent Mesh Architecture

---

## 📌 Document Overview
Yeh user manual bilkul scratch se design kiya gaya hai taaki naye team members application ke har page, feature, aur underlying AI agent mesh ko aasaani se samajh sakein. Purane manuals ko bypass karte hue, yeh guide page-by-page walkthrough provide karega.

---

## 🏢 1. Application Ka High-Level Purpose Kya Hai?
**VVnT Converge** ek **Autonomous Engineering Intelligence & Assurance Platform** hai. 

Aam software development lifecycle mein alag-alag tools use hote hain:
- Requirements ke liye: *Jira, Azure DevOps, Confluence, PRD documents*
- Test Cases ke liye: *TestRail, Zephyr, qTest*
- Automation code ke liye: *Playwright, Cypress, Selenium scripts*
- Security & Compliance ke liye: *Vanta, OWASP, CIS, SonarQube*
- Release Decisions ke liye: *Manual CAB meetings, Spreadsheets*

**VVnT Converge** in sabhi disconnected steps ko replace karta hai ek **Autonomous AI Agent Mesh** ke zariye. Aap sirf raw requirement (PRD, User Story, Video demo, ya File) provide karte hain, aur system autonomously:
1. Requirements ko deeply synthesize aur harden karta hai.
2. Complete test suites aur automation scripts generate karta hai.
3. Security, compliance, aur audit checks run karta hai.
4. Data-backed release recommendation (Go / No-Go + Financial risk dollar figure) provide karta hai.

---

## 🚀 2. Screen Walkthrough: Mission Launchpad
> **Route / Active Menu:** `mission_launchpad` (`http://localhost:5173`)  
> **Source Component:** [`frontend/src/components/MissionLaunchpad.tsx`](file:///c:/Users/VVnT/ai-engineering-assurance-v3/frontend/src/components/MissionLaunchpad.tsx)

**Mission Launchpad** is pure platform ka **Primary Cockpit** (Entry Point) hai. Koi bhi nayi mission ya engineering assurance task yahin se start hoti hai.

```
+---------------------------------------------------------------------------------------------+
| VVnT Converge        [ENGINEER | EXECUTIVE]  [DARK v]  [LIVE MISSION MODE (O)]              |
| [Sidebar Navigation]                                                                        |
|                      +--------------------------------------------------------------------+ |
|                      | 🚀 Mission Launchpad                (● 40 agents ready) [View Mesh] | |
|                      | Add your requirements below, pick a speed, and let A.N.T. mesh do..| |
|                      +--------------------------------------------------------------------+ |
|                      | HOW IT WORKS — FULL AI PIPELINE                                    | |
|                      | [📥 Ingest]  --->  [⚙️ Synthesize]  --->  [🧪 Generate]  ---> [✅ Certify] |
|                      |                                                                    | |
|                      | SCAN DEPTH:  [⚡ Quick (~5m)]  [⚖️ Standard (~19m)]  [🔬 Deep (~37m)] |
|                      +--------------------------------------------------------------------+ |
|                      | REQUIREMENTS INPUT                                                 | |
|                      | Direct Input: [Context Paste] [File Stream] [Video] [OCR] [Path]   | |
|                      | Integrations: [Jira] [Azure DevOps] [SharePoint] [GDrive] [OneDrive] |
|                      +--------------------------------------------------------------------+ |
|                      | [   Add your requirements to continue / Launch CONVERGE Mission    ] |
+---------------------------------------------------------------------------------------------+
```

---

### 2.1 Top Navigation Bar (Header Controls)

1. **Persona Switcher (`ENGINEER` vs `EXECUTIVE`)**:
   - **Engineer Mode:** Sabhi technical details, raw logs, agent nodes, and developer artifacts unlock rehte hain.
   - **Executive Mode:** High-level summaries, compliance scores, ROI, aur financial release risk dashboards focus mein rehte hain.
2. **Theme Selector (`DARK` / `LIGHT` / `SYSTEM`)**:
   - Application theme switch karne ke liye.
3. **Live Mission Mode Toggle**:
   - Real-time live execution aur telemetry visualization enable/disable karne ke liye.
4. **Active Module Quick-Filters (`Ingest`, `Forge`, `Certify`, `Decide`)**:
   - Pipeline ke specific module ko directly focus karne ke liye shortcuts.

---

### 2.2 Hero Card & Mesh Status

- **Banner Title:** `Mission Launchpad`
- **Active Agents Pill:** Ex: `40 agents ready` (ya `57 agents ready`). Yeh batata hai ki kitne background AI specialist agents active hain aur execution ke liye tayyar hain.
- **`View Mesh` Button:** Ispe click karne se system sidhe **Mesh Observatory** view par le jaata hai jahan saare 50+ agent nodes graph visualization ke form mein dikhte hain.

---

### 2.3 How It Works — Full AI Pipeline (4 Core Stages)

System requirement ko 4 stages mein process karta hai:

| Stage | Icon | Name | Kaam Kya Hai? |
|---|:---:|---|---|
| **Stage 1** | 📥 | **Ingest** | Kisi bhi connected source ya direct paste se raw requirement read karta hai. |
| **Stage 2** | ⚙️ | **Synthesize** | Requirements ko analyze karke structured specifications aur acceptance criteria extract karta hai. |
| **Stage 3** | 🧪 | **Generate** | Test cases, Playwright/API test scripts, aur automation code forge karta hai. |
| **Stage 4** | ✅ | **Certify** | Compliance, security audits, aur release readiness report compile karta hai. |

---

### 2.4 Scan Depth Selector

Mission launch karne se pehle aap execution depth select karte hain:

- **⚡ Quick (~5 min):** 
  - Core essential agents run hote hain (~20 nodes).
  - Fast feedback aur initial PRD sanity check ke liye best.
- **⚖️ Standard (~19 min - Default & Recommended):** 
  - Balanced speed aur coverage (~40 nodes).
  - Day-to-day sprint requirements aur test generation ke liye ideal.
- **🔬 Deep (~37 min):** 
  - Full sovereign agent mesh run hota hai (59 nodes).
  - Pre-release audits, security compliance, aur complete end-to-end assurance ke liye.

---

### 2.5 Requirements Input Section

Aap system ko requirement kis tarah provide karna chahte hain, uske options:

#### A. Direct Input (Ad-Hoc Sources)
- 📋 **Context Paste:** Direct PRD, user stories, acceptance criteria text paste karne ke liye box deta hai.
- 📁 **File Stream / File Upload:** PDF, DOCX, TXT, Markdown, CSV requirement documents upload karne ke liye.
- 🎬 **Video Insights:** Demo videos ya product walk-through screen recordings upload karne ke liye (AI audio/video frames se requirements extract karta hai).
- 📷 **Media OCR:** Architecture diagrams, whiteboard sketches, ya screenshots upload karne ke liye (OCR engine text extract karta hai).
- 🌐 **Network Path:** Shared file server ya network path provide karne ke liye.

#### B. Integrations (Enterprise Connectors)
- 🎫 **Jira Software**, 🔷 **Azure DevOps**, 📁 **SharePoint**, 🗂️ **Google Drive**, ☁️ **OneDrive**
- *Note:* In connectors par lock icon tab tak rehta hai jab tak unhe `Settings` mein jaake API token ke sath connect na kiya jaye.

#### C. Pre-Flight Input Classification
Jab aap input daalte hain, to background analysis trigger hota hai:
- System classify karta hai: Kya yeh `full_prd` hai, `feature_request` hai, `bug_report` hai, ya `fragment_insufficient` (adhuri info) hai.
- Agar input bahut chhota ho to warning milti hai taaki execution waste na ho.

---

### 2.6 Primary Action Button: Launch Mission

- **State 1 (Disabled):** `Add your requirements to continue` (Jab tak koi source ya input provide nahi kiya gaya).
- **State 2 (Enabled):** `🚀 Launch CONVERGE Mission`  
  - Button pe estimated time aur active agents count display hota hai (e.g., `~19m · 40 agents`).
  - Is par click karte hi mission initialize ho jaata hai aur task backend LangGraph runtime ko submit ho jaata hai.

---

### 2.7 Left Sidebar Navigation Overview

Sidebar se platform ke alag-alag sections access hote hain:
1. **Command Center:**
   - `Mission Launchpad` *(Current Page)*
   - `Mesh Observatory` *(Real-time 59-node agent canvas)*
   - `Mission Control` *(Human-in-the-Loop review & Phase 2 approvals)*
   - `Live Console` *(Real-time logs stream)*
2. **Module 1 - Ingest & Synthesize:** Semantic Knowledge, Strategic Command, Logic & Compliance.
3. **Module 2 - Generate & Forge:** Test suites, Playwright scripts, BDD feature files.
4. **Module 3 - Certify & Comply:** Security, NFR audits, Compliance evidence pack.
5. **Module 4 - Decide & Optimize:** Release Command Center, Financial risk / ROI figures.
6. **System Care:** Diagnostics, settings, tokens, and database health.
7. **Bottom Profile & Controls:** User (`Admin_Bypass`), `ONLINE MODE` network latency, aur `CLEAR SESSION CACHE` button.

---

## 📝 3. Step-by-Step: Is Page Ko Kaise Use Karein?

1. **Step 1:** `Direct Input` mein se **Context Paste** ya **File Stream** par click karein.
2. **Step 2:** Apna PRD ya feature requirement text box mein paste karein ya file drop karein.
3. **Step 3:** Optional: Scan Depth choose karein (Default: `Standard`).
4. **Step 4:** Pre-flight Input Classification verify karein.
5. **Step 5:** **`Launch CONVERGE Mission`** button dabayein!
6. **Result:** System automatic execution start karega aur aapko **Mesh Observatory** / **Mission Control** par redirect karega jahan agents live kaam karte huye dikhenge.

---

## ⚡ 4. Deep Dive: Scan Depth Profiles & Agents Breakdown
Platform mein 3 depth modes hote hain. Depth select karne par system background mein strictly decide karta hai ki kaun se agents **Active (`auto`)** rahenge aur kaun se **Bypass** rahenge.

| Scan Depth | Node Count | Avg. Execution Time | Primary Target & Use Case |
|---|:---:|:---:|---|
| **⚡ Quick (Rapid)** | **20 Nodes** | ~5 Mins | Fast sanity check, PRD structure validation, atomic unit/API tests |
| **⚖️ Standard** | **40 Nodes** | ~19 Mins | Sprint-level testing, cross-browser, performance, NFR & SRE baseline |
| **🔬 Deep (Full)** | **59 Nodes** | ~37 Mins | Enterprise production release, ASPM security, ROI financials, compliance |

---

### 4.1 Quick / Rapid Mode: 20 Core Agents
Yeh mode sabse fast execution deta hai. Isme essential reasoning, test creation, aur basic code generators active hote hain:

| # | Agent Key | Agent Name | Tier / Role | Kya Kaam Karta Hai? |
|---|---|---|---|---|
| 1 | `ingestor` | Requirements Ingestor | Governance | Input content read karke unified context banata hai. |
| 2 | `clarifier` | Requirement Clarifier | Tier 1 · Intelligence | Ambiguous requirements ko sanitize aur harden karta hai. |
| 3 | `synthesis_initial` | Synthesis Initializer | Tier 1 · Intelligence | Requirement ka initial technical scope outline karta hai. |
| 4 | `governor` | Compliance Governor | Tier 1 · Intelligence | Basic regulatory boundaries aur guardrails set karta hai. |
| 5 | `planning_agent` | Intelligent Test Planner | Tier 1 · Intelligence | Strategic DAG aur test objectives schedule karta hai. |
| 6 | `logician` | Systems Logician | Tier 1 · Intelligence | Semantic logic aur edge-case consistency verify karta hai. |
| 7 | `creator` | Test Case Creator | Tier 2 · Synthesis | BDD / Gherkin atomic scenarios aur test steps likhta hai. |
| 8 | `data_builder` | Test Data Builder | Tier 2 · Synthesis | PII-masked synthetic test data payloads tayyar karta hai. |
| 9 | `api_mock` | API Mock Virtualizer | Tier 2 · Synthesis | External APIs ke lightweight mock contracts banata hai. |
| 10 | `auditor` | Traceability Auditor | Tier 1 · Intelligence | Requirement-to-Test Mapping (RTM) matrix create karta hai. |
| 11 | `lifecycle` | Lifecycle Tracker | Tier 1 · Intelligence | Agent mesh execution topology aur status sync karta hai. |
| 12 | `automation_forge` | Automation Forge | Tier 3 · Automation | Playwright / Cypress / C# automation scaffolds forge karta hai. |
| 13 | `api_coder` | API Automation Generator | Tier 3 · Automation | OpenAPI / Swagger se executable API test scripts generate karta hai. |
| 14 | `self_healing` | Self-Healing Evolution | Tier 6 · Governance | UI tests mein smart-retry aur adaptive locator strategies inject karta hai. |
| 15 | `visual_intel` | Visual Testing Intelligence | Tier 3 · Automation | Visual layout aur basic DOM regressions check karta hai. |
| 16 | `microservices` | Microservices Intelligence | Tier 5 · NFR Guards | Service-to-service communication contracts check karta hai. |
| 17 | `agent_2` | Test Strategy Builder | Tier 2 · Synthesis | Testing pyramid aur risk-based testing strategy tayyar karta hai. |
| 18 | `regression` | Regression & Prioritization | Tier 4 · Execution | P0 se P3 test execution priority aur change impact map karta hai. |
| 19 | `run_orchestrator` | Execution Orchestrator | Tier 4 · Execution | Parallel run distribution aur execution hooks manage karta hai. |
| 20 | `env_provisioner` | Environment Orchestrator | Tier 4 · Execution | Docker containers aur dynamic test environments setup karta hai. |

---

### 4.2 Standard Mode: 40 Agents (Quick ke 20 + 20 Additional Agents)
Standard mode day-to-day sprint runs ke liye recommended hai. Yeh Quick ke sabhi 20 agents ke sath niche diye gaye **20 additional specialized agents** run karta hai:

| # | Agent Key | Agent Name | Tier / Role | Kya Kaam Karta Hai? |
|---|---|---|---|---|
| 21 | `api_validation` | API Validation & Dependency | Tier 2 · Synthesis | Deep API boundary contracts aur dependency isolation audit. |
| 22 | `test_impact` | Test Impact Intelligence | Tier 2 · Synthesis | PR / Code change ka blast radius analyze karta hai. |
| 23 | `performance` | Performance Architect | Tier 5 · NFR Guards | NFR load profiles, target TPS, aur P95/P99 latency benchmarks. |
| 24 | `delivery` | Progressive Delivery | Tier 4 · Execution | Canary analysis, blue/green rollout, aur rollback triggers. |
| 25 | `chaos` | Chaos Engineering | Tier 5 · NFR Guards | Fault injection scenarios (latency, network drops, service kill). |
| 26 | `mobile_testing` | Mobile App Testing | Tier 3 · Automation | Appium / Espresso compatibility for Android aur iOS. |
| 27 | `graphql_validator` | GraphQL Schema Validation | Tier 3 · Automation | Deep-scans graph schemas, resolver auth, aur N+1 query leaks. |
| 28 | `feature_flag` | Feature Flag Testing | Tier 4 · Execution | Multi-variate flag combinations aur A/B experiments test karta hai. |
| 29 | `monitor` | Production Monitor QA | Tier 6 · Governance | Shift-right observability, synthetic monitors, aur alert triggers. |
| 30 | `slo` | SLA/SLO & Error Budget | Tier 6 · Governance | SRE availability targets aur error budget burn rates calculate karta hai. |
| 31 | `tracing` | Distributed Tracing | Tier 5 · NFR Guards | Correlation IDs, distributed spans, aur trace sampling verify karta hai. |
| 32 | `reliability_engineering` | Reliability Engineering | Tier 6 · Governance | Flaky test detection, automatic test quarantine, aur retry policies. |
| 33 | `cross_browser` | Cross-Browser Compatibility | Tier 3 · Automation | Chromium, WebKit (Safari), aur Firefox DOM parity audits. |
| 34 | `data_pipeline` | Database & Data Pipeline | Tier 3 · Automation | DB read/write queries aur ETL pipeline latency constraints. |
| 35 | `suite_optimization` | Test Suite Optimization | Tier 3 · Automation | Redundant execution paths aur dead test cases ko prune karta hai. |
| 36 | `digital_twin` | Digital Twin Simulation | Tier 4 · Execution | Production telemetry mirror karke realistic staging environment banata hai. |
| 37 | `compliance_remediation` | Autonomous Compliance Remediation | Tier 5 · NFR Guards | PCI-DSS aur GDPR compliance violations ke auto-fix code PRs tayyar karta hai. |
| 38 | `event_driven` | Event-Driven Architecture | Tier 5 · NFR Guards | Kafka, RabbitMQ, aur AWS SQS payload schemas aur latency test karta hai. |
| 39 | `ux_intelligence` | User Experience Intelligence | Tier 6 · Governance | Core Web Vitals, animation jank, aur time-to-interactive paint metrics. |
| 40 | `env_consistency` | Multi-Environment Consistency | Tier 6 · Governance | Dev, QA, Staging, aur Prod ke beech configuration drift detect karta hai. |

---

### 4.3 Deep / Full Mesh Mode: All 59 Agents (Standard ke 40 + 19 Deep Intelligence Agents)
Deep mode final production release sign-off, board audit, aur security compliance ke liye use hota hai. Yeh upar ke 40 agents ke alawa **19 advanced governance, economic & assistive agents** trigger karta hai:

| # | Agent Key | Agent Name | Tier / Role | Kya Kaam Karta Hai? |
|---|---|---|---|---|
| 41 | `security` | Security Intelligence (ASPM+) | Tier 5 · NFR Guards | OWASP Top 10, SAST/DAST threat modeling, aur PII exposure audits. |
| 42 | `perf_intel` | Performance Intelligence | Tier 2 · Intelligence | Service-mesh level deep latency analysis aur bottlenecks pin-point karta hai. |
| 43 | `obs_intel` | Observability & Quality Intel | Tier 2 · Intelligence | Real-time monitoring metrics ko quality gates se correlate karta hai. |
| 44 | `rca_intel` | Autonomous RCA | Tier 2 · Intelligence | Predictive Root Cause Analysis of historical failure patterns. |
| 45 | `inc_remed` | Incident Remediation | Tier 2 · Intelligence | Production incident runbooks aur MTTR optimization strategies. |
| 46 | `sys_resil` | System Resilience | Tier 2 · Intelligence | Multi-region failure tolerance aur resilience coverage scoring. |
| 47 | `rel_risk` | Release Risk & Decision | Tier 2 · Intelligence | Autonomous Go / No-Go scoring based on defect density & risk. |
| 48 | `biz_impact` | Business Impact Intelligence | Tier 2 · Intelligence | Identified quality bugs ke against **Revenue-at-Risk ($)** calculate karta hai. |
| 49 | `roi_intel` | ROI & Engineering Economics | Tier 2 · Intelligence | Testing automation spend vs defect leakage savings ka ROI calculate karta hai. |
| 50 | `knowledge_graph` | Engineering Knowledge Graph | Tier 2 · Intelligence | Organization-wide shared memory aur semantic knowledge graph update karta hai. |
| 51 | `meta_intel` | Platform Meta Intelligence | Tier 2 · Intelligence | Self-optimizing mesh reasoning aur cross-cycle learning evaluate karta hai. |
| 52 | `exploratory` | Exploratory Test Assistant | Tier 3 · Assistive | Edge-case hunting ke liye exploratory charters suggest karta hai. |
| 53 | `locator` | Locator Intelligence | Tier 3 · Assistive | Resilient CSS/XPath selectors aur dynamic DOM healing models generate karta hai. |
| 54 | `migration` | Automation Migration Agent | Tier 3 · Assistive | Legacy automation scripts (e.g. Selenium) ko modern Playwright mein convert karta hai. |
| 55 | `mutation` | Mutation Testing Assistant | Tier 3 · Assistive | Test suite effectiveness check karne ke liye code mutations inject karta hai. |
| 56 | `i18n_testing` | Internationalization Assistant | Tier 3 · Assistive | Multi-lingual UI, RTL layouts, aur locale string audits karta hai. |
| 57 | `release_commander` | Release Commander | Tier 6 · Governance | Executive release gatekeeper jo release evidence package sign-off karta hai. |
| 58 | `trend_analyst` | Trend Analyst | Tier 6 · Governance | Multiple sprints aur quarters ka regression trend track karta hai. |
| 59 | `synthesis_final` | Synthesis Final Core | Synthesis Core | Saare 59 agents ke outputs ko combine karke final release contract compile karta hai. |

---

## 🔐 5. Integrations: By Default OFF Kyu Hain & Kaise ON/OFF Karein?

### 5.1 By Default OFF (Locked 🔒) Kyu Hote Hain?

Jab aap first time Launchpad kholte hain, to **Direct Input** (Context Paste, File Stream, etc.) unlocked hote hain, lekin **Integrations** (Jira, Azure DevOps, SharePoint, Google Drive, OneDrive) par **Lock Icon** dikhta hai aur woh click nahi hote.

**Iske 3 mukhya kaaran hain:**
1. **Zero-Trust Security & Missing Credentials:** Enterprise platforms (Jira, Azure DevOps, Cloud Drives) private company networks mein hote hain. Inke paas access karne ke liye specific **Instance URL**, **API Token**, **PAT (Personal Access Token)**, ya **OAuth Consent** chahiye hoti hai. Jab tak credentials provide nahi kiye jaate, system dummy calls nahi bhejta.
2. **Safe Fallback to Local Input:** Agar credentials na ho, to system user ko confuse nahi karta — direct text paste ya file upload hamesha ready rehta hai kyunki unhe kisi external auth ki zaroorat nahi hoti.
3. **Guard Against API Rate-Limits & Auth Failures:** Bina credentials ke Jira call karne se authentication errors aur rate-limit bans se platform ko protect karta hai.

---

### 5.2 Integrations Ko ON (Unlock) Kaise Karein? (Step-by-Step)

Aap kisi bhi integration ko 2 minutes mein unlock kar sakte hain:

#### Tareeqa: Identity Vault Se Configure Karna
1. **Step 1: Sidebar Navigation Kholein**  
   Left sidebar mein scroll karein aur **`System Care`** dropdown par click karein.
2. **Step 2: `Identity Vault` Par Jayein**  
   `System Care` ke andar **`Identity Vault`** (`activeMenu = 'settings'`) option par click karein.
3. **Step 3: "Platform Linkage" Tab Par Click Karein**  
   Page par do tabs dikhenge:
   - `[⚡ Identity Vaults]` *(Yeh AI LLM Models ke liye hai - Gemini, Groq, Ollama)*
   - `[🛡️ Platform Linkage]` *(Yeh Integrations ke liye hai - Jira, Azure DevOps, Cloud Drives)*  
   👉 **Aapko click karna hai: `Platform Linkage` button par!**
4. **Step 4: Platform Card Par "Test Connection" / "Configure" Dabayein**  
   Aapko saare platforms dikhenge:
   - **ALM & DevOps:** Jira, Azure DevOps, GitHub, GitLab, TestRail, Xray, etc.
   - **Strategic Repositories:** SharePoint, Google Drive, OneDrive, Confluence, etc.  
   Jis platform ko unlock karna hai (e.g., Jira), uske card par **`Test Connection`** ya **`Configure`** button dabayein.
5. **Step 5: Credentials Dalein**  
   Ek modal khulega jisme required fields hongi:
   - **Instance URL:** E.g., `https://your-company.atlassian.net` ya `https://dev.azure.com/your-org`
   - **Email / Username:** Aapka corporate email.
   - **API Token / PAT:** Atlassian API Token ya Azure DevOps PAT.
   
   > [!TIP]
   > **Offline Demo / Testing Mode (Mock Mode):**  
   > Agar aapke paas abhi real Jira token nahi hai, to aap **Token** field mein likhein `mock` aur **URL** mein likhein `mock://vvnt`. System ise immediately offline mock mode mein authorize kar dega!

6. **Step 6: "Save & Test Connection" Dabayein**  
   System instant handshake test run karega. Status **`VERIFIED`** ya **`SECURE IDENTITY`** show ho jaayega.
7. **Step 7: Launchpad Par Return Karein**  
   Ab wapas `Mission Launchpad` par aayein. Aap dekhenge ki us integration ka **Lock Icon hat chuka hai**, icon bright ho gaya hai aur aap uspe click karke Jira tickets ya Cloud files select kar sakte hain!

---

### 5.3 Integrations Ko OFF (Lock / Disconnect) Kaise Karein?

Agar aap kisi integration ko band karna chahte hain:
1. **Identity Vault** (`System Care` -> `Identity Vault`) par jayein.
2. **`Platform Linkage`** tab select karein.
3. Us platform card par **`Configured`** button dabayein.
4. Token field ko empty kar dein ya Revoke/Disconnect par click karke Save kar dein.
5. Mission Launchpad par woh platform dobara **Locked** state mein chala jaayega.

---

## 🏛️ 6. Screen Walkthrough: Global Vault & Identity Configurator
> **Route / Active Menu:** `settings` (`http://localhost:5173` -> `System Care` -> `Identity Vault`)  
> **Source Component:** [`frontend/src/components/SettingsView.tsx`](file:///c:/Users/VVnT/ai-engineering-assurance-v3/frontend/src/components/SettingsView.tsx)

Yeh screen application ka **Security, AI Brains & Integrations Control Center** hai. Iske do main hisse hain jo screen ke tabs se control hote hain:

```
+---------------------------------------------------------------------------------------------+
| GLOBAL VAULT & IDENTITY CONFIGURATOR                                                        |
|                                                                                             |
| (i) Operational Guide: Manage your Resilient Identity Mesh and Platform Linkage...        |
|                                                                                             |
| [👁️ ACTIVE INFERENCE CHAIN] [LIVE]                                                         |
| [👑 Strategic Tier (IN USE)] ---> [⚡ Primary Tier] ---> [📈 Economy Tier] ---> [🛡️ Privacy Shield]|
|  gemini-2.5-flash                  llama-3.3-70b          llama-3.1-8b          deepseek-r1:32b     |
|                                                                                             |
| Active inference: gemini / gemini-2.5-flash (Strategic Tier)                                |
|                                                                                             |
|                  [⚡ Identity Vaults]       [🛡️ Platform Linkage]                           |
|                      (Tab 1: Active)              (Tab 2)                                   |
+---------------------------------------------------------------------------------------------+
```

---

### 6.1 Top Banner: Active Inference Chain (Fail-Safe AI Reasoning)

Screen ke top par jo pipeline chart dikh raha hai, woh platform ka **Fail-Safe AI Brain Chain** hai:

1. **👑 Strategic Tier (`gemini · gemini-2.5-flash` - Currently IN USE):**
   - Sabse high-intelligence model jo complex reasoning, architecture planning, aur formal logic synthesis ke liye use hota hai.
2. **⚡ Primary Tier (`groq · llama-3.3-70b-versatile`):**
   - High-speed inference tier. Agar Gemini mein rate-limit ya API timeout hota hai, system seamlessly bina kisi crash ke Groq 70B par failover ho jaata hai.
3. **📈 Economy Tier (`groq · llama-3.1-8b-instant`):**
   - Ultra-fast aur low-cost tier for high-volume text parsing aur token-heavy intermediate steps.
4. **🛡️ Privacy Shield (`ollama · deepseek-r1:32b`):**
   - Local offline fallback. Agar internet connection disconnect ho jaye, to Zero-Data-Egress local Ollama model mesh ko zinda rakhta hai.

---

### 6.2 Tab 1: `Identity Vaults` (AI Model Keys Management)
- Is tab mein aap alag-alag AI providers (Gemini, Groq, OpenRouter, OpenAI, Ollama) ke API keys add, test, revoke, ya rotate kar sakte hain.
- Backend startup par hi `.env` file se keys ko AES-encrypted vault DB mein auto-seed kar deta hai.

---

### 6.3 Tab 2: `Platform Linkage` (Enterprise Tools Connection)
- **Yahi woh tab hai jahan aapko click karna hai agar aap Jira, Azure DevOps, SharePoint unlock karna chahte hain!**
- Is tab mein platforms 3 categories mein divided hain:
  1. **ALM & DevOps:** Jira, Azure DevOps, GitHub, GitLab, Bitbucket, TestRail, Xray, Zephyr, qTest, ALM/QC, Rally.
  2. **Strategic Repositories:** SharePoint, Google Drive, OneDrive, Confluence, Notion.
  3. **Ad-Hoc & Conversational:** Context Paste, File Upload, Video, OCR, Swagger (yeh by default ALWAYS ready rehte hain).
- Har card par **Test Connection** button hota hai. Credentials bharne ke baad connection verify hota hai aur Launchpad par wo tool automatically unlock ho jaata hai.

---

## 🛠️ 7. Deep Dive: System Care (Saare Options Ka Complete Walkthrough)

Sidebar mein sabse niche **`SYSTEM CARE`** section hota hai (yeh sirf `ENGINEER` persona mein dikhta hai). Yeh is platform ka **Administration, Diagnostics, Telemetry, aur Governance Engine** hai.

```
+-------------------------------------------------------------+
| SYSTEM CARE                                               v |
|  ├─ ▦ Agent Sovereign Mesh                                  |
|  ├─ ⚙ Identity Vault                                        |
|  ├─ 🎛 Global Thresholds                                     |
|  ├─ 🕒 Mission History                                       |
|  └─ 💻 Debug Window                                         |
|                                                             |
| [A] Admin_Bypass (Admin)                                (O) |
| ● ONLINE MODE 329MS                                         |
| [🗑 CLEAR SESSION CACHE]                                    |
| [⚡ HARD MISSION RESET] (Active when running/stuck)         |
+-------------------------------------------------------------+
```

---

### 7.1 Option 1: Agent Sovereign Mesh (`activeMenu = 'registry'`)
> **Source Component:** [`frontend/src/components/AgentRegistry.tsx`](file:///c:/Users/VVnT/ai-engineering-assurance-v3/frontend/src/components/AgentRegistry.tsx)

Yeh pure 59-agent mesh ka **Master Control Registry** hai.

#### Yeh Kyu Hai?
System ke 59 agents alag-alag crews aur pillars mein divided hain. Ek engineer ko yeh azaadi chahiye hoti hai ki woh dekh sake kaun sa agent kya karta hai, aur kisi specific agent ko manually ON ya OFF kar sake.

#### Iske Andar Kya-Kya Hota Hai?
1. **Pillars & Crews Organization:** Saare agents structured groups mein organized hain:
   - **Foundation Mesh:** Strategic Command, Logic & Compliance, Economics & Risk, Knowledge Engine.
   - **Artifact Factory:** Strategy & Impact, Scenario & Data Forge, API Virtualization.
   - **Execution Array:** Code Generators, Interface & Mobile, Orchestration Matrix, Cloud Environments.
   - **NFR & Guards:** Performance & Chaos, Security & ASPM, SRE & Reliability, UX Monitoring.
2. **Capability Badges:** Har agent par capability tag hota hai: `Intelligence`, `Synthesis`, `Automation`, `Operations`, `Security`, `Reliability`.
3. **Agent Execution Overrides (Sabse Powerful Feature):**
   Aap har agent ka state customize kar sakte hain:
   - **`Auto`:** Agent Scan Depth preset (Quick/Standard/Deep) ke hisab se chalega.
   - **`Manual`:** Agar koi agent Quick mode mein bypassed hai, lekin aap chahte hain ki woh zaroor chale (e.g., Security scan), to aap use `Manual` par set kar sakte hain.
   - **`Bypass`:** Agar aap kisi agent ko execute nahi karna chahte (taaki tokens aur time bache), to use `Bypass` kar sakte hain.
4. **Search & Filter:** Kisi bhi agent ko naam, role ya mission se instantly search kar sakte hain.
5. **Protected Crews Guard:** Critical governance nodes (jaise Strategic Command, Logic) ko accidentally disable hone se protect kiya gaya hai.

---

### 7.2 Option 2: Identity Vault (`activeMenu = 'settings'`)
> **Source Component:** [`frontend/src/components/SettingsView.tsx`](file:///c:/Users/VVnT/ai-engineering-assurance-v3/frontend/src/components/SettingsView.tsx)

Yeh platform ka **Central Security & Identity Manager** hai jisko humne Section 6 mein explore kiya:
1. **`Identity Vaults` Tab (AI Inference Chain):** 4-tier model mesh (`Strategic: Gemini` ➔ `Primary: Groq 70B` ➔ `Economy: Groq 8B` ➔ `Privacy Shield: Ollama`). Live pulse checks, tokens monitoring, aur keys management.
2. **`Platform Linkage` Tab (Integrations):** Jira, Azure DevOps, SharePoint, Google Drive, OneDrive, TestRail ke API tokens aur instance URLs connect karne ki jagah (with `mock` offline demo mode).

---

### 7.3 Option 3: Global Thresholds (`activeMenu = 'config_settings'`)
> **Source Component:** [`frontend/src/components/ConfigSettings.tsx`](file:///c:/Users/VVnT/ai-engineering-assurance-v3/frontend/src/components/ConfigSettings.tsx)

Yeh platform ke **Runtime Telemetry aur Performance Knobs** ko tune karne ke liye hai:

#### 1. Intelligence Threshold (Reasoning Depth)
Reasoning console aur agent logs ka granularity level set karta hai:
- **Standard (INFO - Level 3):** Sirf major milestones aur task completions dikhata hai (Clean & fast).
- **Deep-Dive (DEBUG - Level 4):** Har agent ke bench decisions, logic drifts, aur inter-agent state handoffs dikhata hai.
- **Master (TRACE - Level 5):** Raw LLM prompts, raw model responses, aur token iteration deltas capture karta hai (Deep debugging ke liye).

#### 2. Strategic Reasoning Cache (Persistence Logic)
- **ON (Default):** System pehle se computed reasoning results ko cache (S3/local) mein save kar leta hai. Agar aap same requirement dubara run karte hain, to system instant CACHE_HIT karke time aur LLM cost bacha leta hai.
- **OFF:** Agar aap kisi network path ya document mein updates kar rahe hain aur bilkul fresh re-ingestion chahte hain, to ise OFF kar dein.

#### 3. Sidebar Fan-out (Autonomous Focus Expansion)
- **ON:** Jaise-jaise pipeline aage badhti hai (Module 1 ➔ Module 2 ➔ Module 3), sidebar automatically us active module/crew ko expand kar deta hai aur user ka focus wahan shift karta hai.
- **OFF:** Sidebar collapsed rehta hai jab tak user manual click na kare.

---

### 7.4 Option 4: Mission History (`activeMenu = 'history'`)
> **Source Component:** [`frontend/src/components/MissionHistory.tsx`](file:///c:/Users/VVnT/ai-engineering-assurance-v3/frontend/src/components/MissionHistory.tsx)

Platform par run kiye gaye sabhi past missions ka **Permanent Audit Trail**:

#### Isme Kya Dikhata Hai?
1. **Mission Records Table:**
   - **Mission Name & Correlation ID:** Unique task tracking identifier.
   - **Status:** `RUNNING` (Blue), `COMPLETED` (Green), `FAILED` (Red), `CANCELLED` (Grey).
   - **Execution Depth:** Quick, Standard, ya Full.
   - **Agent Metrics:** Total agents invoked, completed agents, failed count, total duration (in seconds/ms).
2. **Drill-Down Inspection (Mission Card par click karne par):**
   - **Events Stream:** Har stage par kab kaun sa event fire hua.
   - **Generated Artifacts:** Test plans, BDD feature files, Playwright scripts, SOC2 compliance packs, aur DOCX reports.
   - **One-Click Download:** Kisi bhi generated artifact ko seedhe JSON/DOCX/Code ke roop mein download kar sakte hain.
   - **Tool Executions:** Kisme kaun se external tools (e.g., SAST scanners, browser engines) trigger huye unka status.
3. **Delete Mission:** Unwanted test runs ko purge karne ka button.

---

### 7.5 Option 5: Debug Window (`showDebugWindow = true`)
> **Source Component:** [`frontend/src/components/DebugWindow.tsx`](file:///c:/Users/VVnT/ai-engineering-assurance-v3/frontend/src/components/DebugWindow.tsx)

Yeh engineers ke liye ek **Pop-Up Live Raw Terminal** hai.

#### Yeh Kyu Hai?
Kabhi-kabhi background mein agent execute hote waqt koi step slow ho jaata hai ya error throw karta hai. Debug Window khol kar aap backend ka raw stream dekh sakte hain bina terminal par switch kiye.

#### Features:
- **Real-Time Polling:** Har 2 second mein automatically backend se fresh logs fetch karta hai.
- **Log Level Filtering:** `ALL`, `INFO`, `DEBUG`, `WARN`, `ERROR` pills se logs filter karein.
- **Search Bar:** Kisi specific keyword (e.g. `timeout`, `token`, `jira`, `playwright`) ko instantly filter karein.
- **Auto-Scroll Toggle:** Logs ke flow ke sath automatically niche scroll hota hai.
- **Copy All Logs:** Ek click mein pura log stack clipboard mein copy ho jaata hai bug reporting ke liye.

---

### 7.6 Sidebar Footer System Controls

Sidebar ke bilkul bottom mein critical system controls hote hain:

1. **User Identity Card (`Admin_Bypass`):**
   - Current logged-in user profile aur permission tier (`Admin` ya `Operator`).
   - Red Power Icon: Current session disconnect / logout karne ke liye.
2. **Status Ping (`ONLINE MODE 329MS`):**
   - Real-time heartbeat probe. Green circle ka matlab backend FastAPI server live hai aur latency ~329ms hai. Red hone par network/server fault alert deta hai.
3. **`CLEAR SESSION CACHE`:**
   - Red dashed button. Yeh browser ki `sessionStorage`, active view state, aur local cache ko flush karta hai. Database ya mission history ko nuksan pahunchaye bina agar UI kisi ajeeb state mein atak jaye, to ise dabane se fresh load ho jaata hai.
4. **`HARD MISSION RESET` (Emergency Button):**
   - Yeh button tab visible hota hai jab koi mission RUNNING ya STUCK state mein ho.
   - Ispe click karte hi backend LangGraph runner ko hard kill signal jaata hai, locks release hote hain aur platform turant idle ready state mein wapas aa jaata hai.

---

## ❓ 8. Troubleshooting FAQ: "Local Pe Online vs IP / API Pe Offline" Kyu Dikhata Hai?

Yeh naye developers ke sath aane wala sabse common confusion hai. Iske do main aspects hain:

---

### Case 1: Agar Aapka Matlab "Network IP Se Kholne Par Offline" Hai
Jaise agar aapne `http://localhost:5173` par khola to **Online Mode** dikh raha hai, lekin jab apne system ke IP se khola (jaise `http://192.168.x.x:5173` ya mobile/dusre laptop se) to **Offline Mode** dikha raha hai:

#### Asli Wajah (Root Cause):
1. **Backend Server Host Binding (`127.0.0.1` vs `0.0.0.0`):**
   - Backend terminal mein run command dekhein:  
     `uvicorn backend.main:app --host 127.0.0.1 --port 8585`
   - `--host 127.0.0.1` ka matlab hota hai **"Sirf isi computer ke internal loopback se aane wali requests allow karo"**. Yeh local network ke IP se aane wale traffic ko block/reject kar deta hai.
2. **Frontend Dynamic URL Resolution (`config.ts`):**
   - Frontend `config.ts` mein likha hai:
     ```javascript
     if (hostname === 'localhost' || hostname === '127.0.0.1') {
       return 'http://localhost:8585';
     }
     return `http://${hostname}:8585`;
     ```
   - Jab aap browser mein `http://192.168.1.10:5173` kholte hain, to frontend backend ko dhoondhne ke liye request bhejta hai `http://192.168.1.10:8585/api/health` par.
   - Lekin backend sirf `127.0.0.1` par sun raha tha, isliye Windows connection drop kar deta hai. 3 retries ke baad UI declare kar deti hai: **`Offline Mode — Service tunnel collapsed`**.

#### Solution (Network Par Online Kaise Karein?):
Backend ko run karte waqt host ko `0.0.0.0` set karein:
```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8585
```
Isse backend machine ke sabhi network IPs par sunna shuru kar dega aur har device par Online dikhayega!

---

### Case 2: Agar Aapka Matlab "Direct Backend API / Port 8585 Kholne Par Offline" Hai
Jaise agar aapne browser mein direct `http://localhost:8585` khola:

#### Asli Wajah (Root Cause):
1. **Root URL Par Koi Homepage Nahi Hai:**  
   - Backend ek pure REST API hai. Direct `http://localhost:8585/` kholne par `{"detail": "Not Found"}` (404 Error) aata hai kyunki frontend files port `5173` (Vite) par host hoti hain, na ki backend port par.
2. **Interactive Swagger Docs URL:**  
   - Backend APIs ko test karne ke liye sahi URL hai:  
     👉 **`http://localhost:8585/docs`** (FastAPI Swagger Interactive UI)
3. **Health Check Ka Asli Endpoint:**  
   - Backend health check API ka sahi path hai:  
     👉 **`http://localhost:8585/api/health`** (Yeh return karta hai: `{"status": "online", "database": "connected", "vault": "secure"}`)
4. **JWT Authentication Barrier:**  
   - Backend ke kayi endpoints (jaise `/llm/vault`, `/missions`, `/llm/health`) protected hain. Unhe access karne ke liye Authorization Bearer Token chahiye hota hai. Direct browser se hit karne par `401 Unauthorized` milta hai, isliye lagta hai ki service offline hai.

---

## 🖥️ 9. Screen Walkthrough: Mission Control & Phase 2 Outputs (Certify View)
> **Route / Active View:** `Mission Control` (`http://192.168.0.73:5173`)  
> **Source Component:** [`frontend/src/components/MissionControl.tsx`](file:///c:/Users/VVnT/ai-engineering-assurance-v3/frontend/src/components/MissionControl.tsx)

Is screen par **Phase 2 (Generate & Synthesize)** ke saare generated outputs, Engineering Tasks, Acceptance Criteria, aur TDD Test Contracts visual aur interactive format mein display hote hain.

---

### 9.1 Header Bar & System Status Controls

1. **URL & Network Context (`http://192.168.0.73:5173`):**
   - Application network IP `192.168.0.73` par serve ho rahi hai, jisse same WiFi/LAN ke kisi bhi system se access kiya ja sakta hai.
2. **Title & Mission State Banner:**
   - **`MISSION CONTROL & PIPELINE OVERVIEW`**: Primary cockpit header.
   - **`MISSION DORMANT: Project VVNT-Omega [b4ce026a]`**: 
     - `DORMANT`: Task processing complete hone ke baad system pipeline pause/ready state mein hai.
     - `Project VVNT-Omega`: Active target project scope.
     - `[b4ce026a]`: Unique hash key generated for this specific mission run.
3. **Persona Switcher & Mode Toggles:**
   - **`ENGINEER` (Selected)**: Technical details, code blocks, aur test assertions visible hain.
   - **`EXECUTIVE`**: High-level ROI, financial risk, aur compliance score overview ke liye toggle button.
   - **`DARK v`**: Theme selector dropdown.
   - **`LIVE MISSION MODE (OFF)`**: Real-time agent event stream stream toggle.
4. **Phase Status Notification (Green Pill):**
   - **`Phase 2 Artifact Synthesis Complete. Awaiting Engineering Contract Approval.`**
   - **Meaning:** AI Agents ne saare tasks aur tests forge kar liye hain. Human lead / Engineer ki contract sign-off pending hai.

---

### 9.2 Navigation Tabs & Sidebar Indicators

1. **Pipeline Module Quick Tabs:**
   - `Ingest` (Module 1 - Inactive)
   - `Forge` (Module 2 - Completed)
   - **`Certify` (Golden Highlighted Tab - Currently Active View)**
   - `Decide` (Module 4 - Upcoming)
2. **Left Sidebar Controls:**
   - `Live Console`: Raw agent trace streaming logs.
   - `MODULE 1` to `MODULE 4` expandable accordion menus.
   - **User identity:** `Admin_Bypass (Admin)` with instant session logout power icon.
   - **System Telemetry:** `🟢 ONLINE MODE  33MS` — Backend FastAPI (`port 8585`) se 33ms latency ke sath active live socket ping link.
   - **`HARD MISSION RESET`**: Emergency red button to clear stuck graph locks.

---

### 9.3 Generated Outputs & Content Card Breakdown

Main content section mein PRD se extract hue engineering tasks aur contracts display hote hain:

#### 1. Upper Test Contract Snippet (Previous Task Code):
- Python `pytest` + `httpx` code snippet:
  ```python
  "user_id": 1
  }, timeout=10)
  assert response.status_code == 400
  ```
- **Purpose:** Negative test cases aur boundary validation (e.g. invalid user_id request par 400 Bad Request verify karna).

#### 2. Featured Card Output — `TASK-23: Implement HIPAA Compliance Measures`

- **Task Identifier:** `TASK-23`
- **Task Title:** `Implement HIPAA Compliance Measures`
- **Description:**
  - Technical controls implement karna for HIPAA compliance: Role-Based Access Controls (RBAC), non-production data masking, aur TLS encrypted data transmission. Audit trail logging aur periodic security audits enforce karna.

- **Acceptance Criteria (Generated Functional Requirements):**
  1. **Access Control:** Sensitive patient data access is strictly restricted based on authenticated user roles.
  2. **Data Masking:** Non-production environments (staging/dev) mein sensitive patient data (PHI/PII) fully masked/obfuscated rehta hai.
  3. **Transport Encryption:** Subhi network data transmission TLS 1.3 / HTTPS encrypted rehti hain.
  4. **Audit Logging:** Data access aur modifications ki immutable audit trail maintain ki jaati hai.
  5. **Security Cadence:** Regular automated aur manual security audits conduct karke vulnerabilities fix ki jaati hain.

- **TDD Test Contract (Test Code Section):**
  - Developer ke implementation code se PEHLE hi automated test script generate ho chuki hai, jo Phase 3 mein execute hoke 100% compliance test pass/fail report generate karegi.

---

### 9.4 Codebase Deep-Dive: Phase 2 Me Back-End Code Me Kya-Kya Generate Hua Hai?
> **Graph Source File:** [`backend/agents/graphs/phase2_graph.py`](file:///c:/Users/VVnT/ai-engineering-assurance-v3/backend/agents/graphs/phase2_graph.py)

Screen par surf `TASK-23` dikhne ka matlab yeh nahi ki baaki kaam nahi hua. Background me **18 AI Specialist Agents** ne ek sequential execution chain chala kar complete system architecture & test suite generate kiya hai:

```
[START] ➔ logician_node ➔ architect_node ➔ service_mesh_node ➔ db_architect_node
➔ planning_agent_node ➔ creator_node ➔ test_data_builder_node ➔ api_mock_node
➔ requirement_clarifier_node ➔ synthesis_optimizer_node ➔ traceability_auditor_node
➔ api_dependency_mapper_node ➔ mcp_advisor_node ➔ performance_architect_node
➔ security_intelligence_node ➔ compliance_governor_node ➔ hook_guardrails_advisor_node
➔ auditor_node ➔ engineering_contract_node ➔ phase2_exit_node ➔ hitl2_gate_node (INTERRUPT)
```

#### Back-End Code & DB Artifacts Generated:
1. **`system_specification` (Architect Node):** C4 System Context Diagram + Client-Server/Microservice Architecture Blueprint.
2. **`service_architecture` (Service Mesh Node):** Microservice Boundaries & Communication Topology.
3. **`database_schema` (DB Architect Node):** ERD Schema Definitions, Tables, Primary/Foreign Keys, aur Constraints.
4. **`engineering_tasks` (Planning Agent Node):** Complete Task Breakdown (TASK-1 se leke TASK-23 tak, e.g. Auth, Order Engine, HIPAA, etc.).
5. **`tdd_contracts` (Creator Node):** Har ek task ke liye Pytest + HTTPX functional aur security test contracts.
6. **`test_data_builders` & `api_mocks` (Data Builder & Mock Nodes):** Synthetic test data generators & REST API mock wire-stubs.
7. **`security_constraints` & `compliance_requirements` (Security & Compliance Nodes):** Threat model, TLS rules, HIPAA/GDPR bindings.
8. **`engineering_contract` (Engineering Contract Node):** Complete combined JSON payload जो SQLite table `missions` (`phase_outputs`) aur `mission_artifacts` me save ho chuka hai.
9. **State Transition:** Mission status set ho chuka hai **`HITL2_PENDING`** par aur graph runner interrupt mode me wait kar raha hai.

---

### 9.5 Codebase Deep-Dive: Ab Agla Step (Phase 3 & Phase 4) Code Me Kya Hoga?
> **Graph Source File:** [`backend/agents/graphs/phase3_graph.py`](file:///c:/Users/VVnT/ai-engineering-assurance-v3/backend/agents/graphs/phase3_graph.py)

Jab aap UI ya API se `/missions/{mission_id}/approve/phase2` trigger karenge, tab codebase me nimnlikhit automated pipeline execute hoga:

```
[START] ➔ per_module_forge_node ➔ forge_file_writer_node ➔ auto_tdd_validation_node
➔ tdd_gate_node ➔ (If GREEN ➔ phase3_exit_node ➔ Launch Phase 4)
```

1. **Phase 2 Contract Approval:**
   - Mission status change hoga: `HITL2_PENDING` ➔ `PHASE2_APPROVED` ➔ `PHASE3_RUNNING`.
2. **Module Forge Code Generation (`per_module_forge_node`):**
   - AI Coder agents har task (TASK-1 se TASK-23) ke liye actual feature implementation source code forge karenge.
3. **File Writer (`forge_file_writer_node`):**
   - Generated code ko project workspace / Git repository files me write karega.
4. **Automated TDD Test Execution (`auto_tdd_validation_node`):**
   - Phase 2 me bane saare Pytest TDD contracts ko new generated code par live run karega.
5. **TDD Gate (`tdd_gate_node`):**
   - Agar saare tests **GREEN (Pass)** hote hain ➔ Status: `TDD_GREEN`.
   - Agar tests FAIL hote hain ➔ Auto-healing self-correction loop chala kar code fix karega.
6. **Phase 4 Launch (Certify & NFR Audit Mesh):**
   - Phase 3 complete hote hi backend automatically `execute_phase_4_mission` trigger karega, jisse Security, Performance, aur Reliability audit crews final Release Assurance Report generate karenge.

---

### 9.6 Node 1 Fix Summary: Requirements Ingestor Domain & Capability Alignment
> **Graph Source File:** [`backend/agents/graphs/phase1_graph.py`](file:///c:/Users/VVnT/ai-engineering-assurance-v3/backend/agents/graphs/phase1_graph.py)

#### Problem Identified:
Pehele `ingestor_node` me basic keyword matching logic thhi jo `prd_lower.count(...)` use karke domain guess kar rahi thhi. AmereyConnect PRD me *"patient"*, *"hospital"*, aur *"medical"* jaise terms hone ki wajah se system domain ko `Healthcare` classify kar leta tha, jabki AmereyConnect ek **Affiliate E-Commerce & Mobility Aids Retail Platform** hai (Wheelchairs, Walkers, Chemist QR Codes, Commissions, Distributor Order Fulfillment). Iski wajah se downstream nodes doctor appointment ya facility data ingestion system ka implementation plan generate kar rahe thhe.

#### Fixes Implemented:
1. **LLM Pre-Flight Classification & Domain Detection:** `prompt_classify` ko update kiya gaya hai taaki LLM deep analysis karke PRD ka sahi domain (`E-Commerce` vs `Healthcare` vs `Banking` vs `Travel`) aur `domain_details` accurately detect kare.
2. **Smart Keyword Fallback:** Agar LLM fail ho, toh updated keyword sets (`["cart", "checkout", "product", "inventory", "shipping", "order", "chemist", "affiliate", "commission", "qr", "wheelchair", "walker", "distributor"]`) retail/e-commerce aur affiliate flows ko accurate weighting dete hain.
3. **Domain-Aware Capabilities Extraction Prompt:** `prompt_caps` me detected domain aur domain details pass kiye gaye hain taaki capability extraction Customer, Chemist Affiliate, Distributor, aur Ops Admin personas ke real features (QR Attribution, Mobility Catalog, Commission Engine, Order Routing) extract kare.
4. **Unified Context Contract:** `unified_context_contract` me `domain`, `domain_details`, aur `domain_context` cleanly expose kiye gaye hain taaki downstream Phase 2 & Phase 3 nodes (Architect, Service Mesh, DB Architect, Plan Graph) exact target business logic generate kar sakein.







