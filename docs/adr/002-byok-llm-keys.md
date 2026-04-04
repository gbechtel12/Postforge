# ADR-002: Bring Your Own Key (BYOK) for LLM providers

**Date:** 2026-04-03  
**Status:** Accepted

## Context
PostForge generates content via LLMs (OpenAI, Anthropic, Gemini) and images
via generation APIs (DALL-E, Ideogram). We need to decide who pays for API
credits and how keys are managed.

## Decision
Users supply their own API keys. Keys are encrypted at rest using Supabase
Vault and decrypted server-side only at generation time. PostForge never
proxies credits or stores plaintext keys.

## Consequences
**Positive:**
- Zero LLM cost to PostForge operator in Phase 1
- Users have full control and visibility over their own API spend
- No credit management complexity on the platform side
- Clear legal separation — PostForge is a tool, not an API reseller

**Negative:**
- Onboarding friction — users must supply keys before generating
- Users need API accounts with each provider they want to use

**Future option:**
Phase 2 (commercial tier) can introduce a "managed credits" option where
PostForge bundles API access at a markup, as a premium convenience tier.
This doesn't require architectural changes — just an additional key source.
