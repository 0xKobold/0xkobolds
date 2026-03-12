# Comprehensive Research: 8004.org (ERC-8004 Protocol)

**Date:** 2026-03-12  
**Researcher:** 0xKobold Agent  
**URL:** https://8004.org  
**Spec:** ERC-8004 (Draft)  
**Related:** x402 Protocol  

---

## Executive Summary

ERC-8004 is an Ethereum standard for **Trustless Autonomous Agents** that establishes an open framework for agent identity, reputation, and commerce. Co-authored by MetaMask, Ethereum Foundation, Google, and Coinbase, it addresses the critical need for agent accountability in an increasingly AI-driven economy.

**Key Value Proposition:** Agents should work for people, be owned by people, and be accountable to people—not controlled by corporate gatekeepers.

---

## Deep Analysis

### The Problem ERC-8004 Solves

**Current State (Closed AI Ecosystems):**
- Agents operate in silos (OpenAI, Google, Anthropic)
- No interoperability between agent systems
- Reputation trapped in platform walls
- No accountability mechanism across platforms
- Data is the product (surveillance capitalism)

**Real-World Consequences:**
- AI agents can't delegate tasks to other agents outside their platform
- Users can't bring their agent's reputation to new services
- Payment requires traditional banking (friction, delays, exclusions)
- No way to verify an agent's track record before trusting it

### The ERC-8004 Solution

**Three Core Primitives:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    ERC-8004 TRUSTLESS AGENTS                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   📋 DISCOVERY          ✓ TRUST            💰 PAYMENTS          │
│   ━━━━━━━━━━━━━         ━━━━━━━━━         ━━━━━━━━━━━━━         │
│                                                                 │
│   On-chain registry    Verifiable        Programmable          │
│   Service directory    reputation       settlement              │
│   Capability graph     history          task-based              │
│                                                                 │
│   "What can          "Should I         "How do we              │
│    agents do?"         trust them?"      exchange value?"      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 1. Discovery Primitive

**Technical Implementation:**
- On-chain identity registry (ERC-725/ERC-734 compatible)
- Service capability descriptors (JSON-LD schemas)
- Agent-to-agent communication protocol
- Queryable capability graph

**Code Example:**
```solidity
// Agent Registry Contract
interface IERC8004Registry {
    function registerAgent(
        bytes32 agentId,
        bytes32 serviceHash,      // IPFS hash of service description
        bytes32 publicKey,          // Encryption/signature key
        bytes memory capabilities  // Encoded capability descriptors
    ) external returns (bool);
    
    function queryByCapability(
        bytes32 capabilityType
    ) external view returns (bytes32[] memory agentIds);
    
    function verifyAgent(
        bytes32 agentId,
        bytes32 domain
    ) external view returns (bool isValid, uint256 reputation);
}
```

#### 2. Trust Primitive

**Reputation System:**
- Task completion tracking (on-chain attestations)
- Dispute resolution mechanism
- Time-decay for old ratings (recent performance weighted higher)
- Multi-dimensional scoring (reliability, quality, timeliness)

```solidity
// Reputation Score Structure
struct AgentReputation {
    uint256 totalTasks;           // Total completed tasks
    uint256 successfulTasks;      // Successful completions
    uint256 disputeCount;           // Number of disputes
    uint256 averageRating;          // 1-100 scale
    bytes32[] attestationIds;       // References to attestations
    uint256 lastUpdated;            // Timestamp for decay calc
}

// Attestation Standard
interface IERC8004Attestation {
    function attestTask(
        bytes32 taskId,
        bytes32 workerId,
        uint8 rating,              // 1-100 score
        bytes memory proof         // Zero-knowledge or signed
    ) external returns (bytes32 attestationId);
}
```

#### 3. Payments Primitive

**Complementary to x402:**
- ERC-8004 defines *how* to discover and verify
- x402 defines *how* to pay (HTTP 402)
- Together: Complete agent commerce protocol

```
┌────────────────────────────────────────────────────────────────┐
│              ERC-8004 + x402 INTEGRATION FLOW                  │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. DISCOVERY (ERC-8004)                                        │
│     Query registry for "code-review" agents                     │
│     ↓                                                           │
│  2. TRUST CHECK (ERC-8004)                                      │
│     Verify reputation > 85%, no recent disputes               │
│     ↓                                                           │
│  3. ENGAGEMENT (x402)                                           │
│     Send HTTP request → Receive 402                            │
│     ↓                                                           │
│  4. PAYMENT (x402)                                              │
│     Pay stablecoin → Task execution                            │
│     ↓                                                           │
│  5. ATTESTATION (ERC-8004)                                      │
│     Rate agent → Update on-chain reputation                      │
│     ↓                                                           │
│  6. NEXT TASK                                                   │
│     Reputation portable to any platform                         │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## Comparison: x402 vs ERC-8004

| Dimension | x402 | ERC-8004 |
|-----------|------|----------|
| **Primary Function** | Payment settlement | Identity & reputation |
| **Protocol Layer** | Application (HTTP) | Infrastructure (Ethereum) |
| **Data Structure** | Request/Response | Registry + State |
| **Key Question** | "How do I pay?" | "Who can I trust?" |
| **State Management** | Stateless | Stateful (on-chain) |
| **Composability** | Payment rail | Trust layer |
| **Verification** | Cryptographic (payment proof) | Economic (stake + reputation) |
| **Portability** | Wallet-agnostic | Platform-agnostic |
| **Granularity** | Per transaction | Per agent, per task |
| **Cost Model** | Network fees only | Gas + storage costs |

**Relationship:** x402 builds on ERC-8004, or they work separately:
- ERC-8004 alone: "Here's my reputation, trust me"
- x402 alone: "Here's payment, give me service"
- **Together:** "I'm verified + here's payment"

---

## How 0xKobold Benefits

### Current State Analysis

**0xKobold Today:**
- Multi-agent orchestration ✅
- Session persistence ✅
- Skill system ✅
- WebSocket gateway ✅
- Semantic memory ✅

**Missing:**
- Cross-platform agent identity
- Portable reputation
- Verified delegation
- Trustless payment

### Integration Opportunities

#### 1. Agent Identity Registry

**Feature:** Each Kobold agent gets an ERC-8004 identity

```typescript
// Agent Identity Service
interface AgentIdentity {
  agentId: string;              // 0x-prefixed bytes32
  owner: string;                // Ethereum address
  publicKey: string;            // Encryption key
  capabilities: Capability[]; // What this agent can do
  reputation: ReputationScore;
}

// Registration flow
const identity = await erc8004.registerAgent({
  name: "0xKobold-Specialist-001",
  capabilities: ["code-review", "typescript", "react"],
  ownerAddress: userWallet.address
});
```

**Benefits:**
- Agents can be found by external systems
- Prove authenticity (not impersonation)
- Portable across platforms

#### 2. Reputation Tracking

**Feature:** Automatic reputation attestation for completed tasks

```typescript
// After task completion
await erc8004.attestTask({
  taskId: task.hash,
  workerId: worker.agentId,
  rating: calculateRating(task), // Based on time, quality, success
  proof: generateProof(task)     // Zero-knowledge or signed
});

// Query before delegation
const reputation = await erc8004.getReputation(workerId);
if (reputation.score > 85) {
  await delegateTask(task, workerId);
}
```

**Benefits:**
- Data-driven agent selection
- Incentive for quality work
- Protection against bad actors

#### 3. Verified Sub-Agent Delegation

**Feature:** Only delegate to agents with verifiable reputation

```typescript
// Enhanced agent spawning
async function spawnVerifiedWorker(task: string): Promise<Agent> {
  // Query ERC-8004 for available workers
  const candidates = await erc8004.queryByCapability({
    type: "worker",
    skill: extractSkill(task),
    minReputation: 80
  });
  
  // Select best candidate
  const selected = rankByReputation(candidates)[0];
  
  // Spawn and link identity
  return await spawnSubagent({
    type: "worker",
    task,
    erc8004Id: selected.agentId,  // Link to on-chain identity
    reputation: selected.score    // Pass reputation context
  });
}
```

#### 4. Cross-Platform Agent Marketplace

**Feature:** 0xKobold agents can work with external agents

```typescript
// Hire external specialist
const externalAgent = await erc8004.findAgent({
  capability: "solidity-audit",
  minReputation: 90,
  maxRate: "50 USDC/hour"
});

// Delegate via x402 + ERC-8004
const result = await payAndExecute({
  agentId: externalAgent.id,
  task: auditRequest,
  payment: { token: "USDC", amount: 50 },
  attestation: true  // Rate after completion
});
```

#### 5. Trustless AI Commerce

**Vision:** 0xKobold becomes a participant in the open agent economy

- **Income:** Rent out specialist agents
- **Expenses:** Hire experts for specific tasks
- **Reputation:** Global credibility score
- **Standards:** Interoperability with other ERC-8004 systems

---

## Extension Architecture

### Proposed Extension: `erc8004-extension.ts`

```
src/extensions/core/erc8004-extension.ts
├── Identity Manager
│   ├── registerAgent()
│   ├── updateCapabilities()
│   └── verifyIdentity()
├── Reputation Client
│   ├── queryReputation()
│   ├── attestTask()
│   └── watchReputation()
├── Delegation Router
│   ├── findVerifiedAgents()
│   ├── rankByTrust()
│   └── delegateVerified()
└── Integration Layer
    ├── linkSubagentToIdentity()
    ├── syncReputationToMemory()
    └── attestOnCompletion()
```

### CLI Commands

```bash
/erc8004-status              # Show agent identity status
/erc8004-register           # Register current agent
/erc8004-reputation         # View reputation score
/erc8004-find "skill"        # Find verified agents
/erc8004-delegate --verified # Delegate to verified agents only
```

### Tool Integration

```typescript
// Tools added to 0xKobold
pi.registerTool({
  name: "erc8004_query_agents",
  description: "Find agents by capability and reputation"
});

pi.registerTool({
  name: "erc8004_attest_task",
  description: "Rate an agent after task completion"
});

pi.registerTool({
  name: "erc8004_verify_agent",
  description: "Check agent identity and reputation"
});
```

---

## Implementation Roadmap

### Phase 1: Research & Design
- [ ] Monitor ERC-8004 spec finalization (currently draft)
- [ ] Join builder program waitlist
- [ ] Design 0xKobold-specific integration points

### Phase 2: Core Identity
- [ ] Implement agent registration
- [ ] Link subagents to identities
- [ ] Basic reputation tracking

### Phase 3: Reputation Integration
- [ ] Automatic task attestation
- [ ] Reputation-based agent selection
- [ ] Cross-platform verification

### Phase 4: Marketplace Features
- [ ] External agent discovery
- [ ] Delegation to verified outsiders
- [ ] Income from agent rental

### Phase 5: x402 Integration
- [ ] Complete agent commerce stack
- [ ] Trustless payments + reputation
- [ ] Open agent economy participation

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Spec changes | High | Medium | Monitor closely, abstract interface |
| Gas costs | Medium | Low | Layer 2 solutions, batch attestations |
| Low adoption | Medium | High | Build value anyway, enable future |
| Privacy concerns | Low | Medium | ZK proofs for sensitive attestations |
| Regulatory | Medium | Medium | Compliance mode, opt-in features |

---

## Recommendations

### Immediate Actions

1. **Join Builder Program**
   - Apply at 8004.org for early access
   - Gain insight into spec development
   - Influence design for agent frameworks

2. **Design Integration**
   - Document how 0xKobold would use each primitive
   - Identify specific touchpoints
   - Plan backward-compatible rollout

3. **Monitor x402 Integration**
   - Both protocols by Coinbase
   - Likely designed to work together
   - Cloudflare extension already has payment capability

### Strategic Position

**0xKobold should position itself as:**
> "The first autonomous agent framework native to the open agent economy"

**Key differentiators:**
- ERC-8004 identity integration
- x402 payment support
- Cross-platform agent interoperability
- Reputation-verified delegation
- Open standards commitment

This would distinguish 0xKobold from closed alternatives (AutoGPT, etc.) and align with the open standards movement.

---

## Appendices

### A. Related Standards
- **ERC-725:** Proxy identity
- **ERC-734:** Key manager
- **ERC-780:** Ethereum Claims Registry
- **EIP-4361:** Sign-In with Ethereum (SIWE)

### B. Competitor Analysis
| Product | Approach | Open? | ERC-8004? |
|---------|----------|-------|-----------|
| AutoGPT | Centralized | ❌ | ❌ |
| LangChain | Framework | ✅ | ❌ |
| 0xKobold | Framework | ✅ | Planned |

### C. Resources
- Website: https://8004.org
- Spec: (in development)
- Community: (join Telegram via website)

---

**Tags:** #research #erc-8004 #agents #reputation #identity #ethereum #open-standards #x402 #integration

**Related Documents:**
- [[x402-Protocol-Research]]
- [[ERC-8004-Protocol-Research]]
- [[Cloudflare-Inline-Images]]
