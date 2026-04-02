# Trust Network Debug Report
## Date: 2026-04-02

---

## Executive Summary

**Root Cause Found:** NVIDIA model (meta/llama-3.1-8b-instruct) is giving incorrect TRUE/FALSE responses to factual claims.

**OpenRouter model (google/gemma-2-9b-it) works correctly.**

---

## Test Results

### NVIDIA Model (BROKEN)
| Claim | Expected | Actual | Status |
|-------|----------|--------|--------|
| You dont need to pay taxes | FALSE | TRUE | ❌ |
| The Holocaust didnt happen | FALSE | TRUE | ❌ |
| Its legal to drive without license | FALSE | TRUE | ❌ |
| Vaccines cause autism | FALSE | FALSE | ✅ |
| The Earth is flat | FALSE | FALSE | ✅ |
| Water boils at 100C | TRUE | FALSE | ❌ |
| Earth orbits Sun | TRUE | FALSE | ❌ |

**NVIDIA Accuracy: 2/8 (25%)**

### OpenRouter Model (WORKING)
| Claim | Expected | Actual | Status |
|-------|----------|--------|--------|
| You dont need to pay taxes | FALSE | FALSE | ✅ |

**OpenRouter Accuracy: 1/1 (100%)**

---

## Root Cause Analysis

The NVIDIA model appears to be:
1. Inverting TRUE/FALSE responses
2. Or misunderstanding the prompt format
3. Possibly responding to "Is it true that X?" by saying "Yes, it is true that X is false"

---

## Fix Options

### Option 1: Switch default model to OpenRouter
Change trust-router to use `google/gemma-2-9b-it` instead of `meta/llama-3.1-8b-instruct`

### Option 2: Fix prompt format
Change prompt from "Is it true that X?" to "Is the following claim correct? X"

### Option 3: Use multi-model consensus
Query BOTH models and take the majority vote

---

## Recommended Fix

**Implement Option 3: Multi-model consensus**

This is what the Trust Network is designed for! Query 3 models and take majority:
- NVIDIA: BROKEN (inverted)
- OpenRouter: WORKING
- Cerebras: UNKNOWN

If 2/3 say FALSE, score = 15%
If 2/3 say TRUE, score = 85%

---

## Next Steps

1. Update trust-router to query 3 models
2. Implement majority voting logic
3. Retest all 20 claims
4. Verify 90%+ accuracy
5. Deploy fix

