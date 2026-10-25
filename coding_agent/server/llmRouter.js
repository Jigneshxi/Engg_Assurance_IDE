import fetch from 'node-fetch';

class LLMError extends Error {
  constructor(message, category, affordable = null) {
    super(message);
    this.name = 'LLMError';
    this.category = category; 
    this.affordable = affordable;
  }
}

class TokenBudgeter {
  static estimate(text) {
    return Math.ceil(text.length / 4);
  }
  static calculateBudget(system, user, maxModelTokens, baseLimit) {
    const sysTokens = this.estimate(system);
    const userTokens = this.estimate(user);
    const available = maxModelTokens - sysTokens - userTokens - 100;
    return Math.max(10, Math.min(baseLimit, available));
  }
}

function requireEnv(key, type = 'string') {
  let val = process.env[key];
  if (val === undefined || val === '') throw new Error(`Missing required env: ${key}`);
  if (type === 'number') {
    val = Number(val);
    if (!Number.isFinite(val)) throw new Error(`${key} must be a number`);
  }
  return val;
}

export function getLLMConfig() {
  const rawOllamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const rawOllamaModel = process.env.OLLAMA_MODEL || 'llama3';
  
  const getKeys = (prefix) => {
    return Object.keys(process.env)
      .filter(k => k.startsWith(prefix) && process.env[k])
      .sort((a, b) => {
        const numA = parseInt(a.replace(prefix + '_', '')) || 0;
        const numB = parseInt(b.replace(prefix + '_', '')) || 0;
        return numA - numB;
      })
      .map(k => process.env[k]);
  };

  const googleKeys = getKeys('GOOGLE_API_KEY');
  const groqKeys = getKeys('GROQ_API_KEY');
  const openaiKeys = getKeys('OPENAI_API_KEY');
  const openrouterKeys = getKeys('OPENROUTER_API_KEY');

  // Validate that at least one provider is enabled and has keys
  const enabledProviders = [];
  if (process.env.LLM_ENABLE_OLLAMA === 'true') enabledProviders.push('ollama');
  if (process.env.LLM_ENABLE_GROQ === 'true' && groqKeys.length > 0) enabledProviders.push('groq');
  if (process.env.LLM_ENABLE_GOOGLE === 'true' && googleKeys.length > 0) enabledProviders.push('google');
  if (process.env.LLM_ENABLE_OPENAI === 'true' && openaiKeys.length > 0) enabledProviders.push('openai');
  if (process.env.LLM_ENABLE_OPENROUTER === 'true' && openrouterKeys.length > 0) enabledProviders.push('openrouter');

  if (enabledProviders.length === 0) {
    const available = [];
    if (groqKeys.length > 0) available.push('GROQ (set LLM_ENABLE_GROQ=true)');
    if (googleKeys.length > 0) available.push('GOOGLE (set LLM_ENABLE_GOOGLE=true)');
    if (openaiKeys.length > 0) available.push('OPENAI (set LLM_ENABLE_OPENAI=true)');
    if (openrouterKeys.length > 0) available.push('OPENROUTER (set LLM_ENABLE_OPENROUTER=true)');
    if (process.env.OLLAMA_URL) available.push('OLLAMA (set LLM_ENABLE_OLLAMA=true)');
    throw new Error(
      `No LLM provider enabled with valid keys. ` +
      `Configure at least one: ${available.join(', ') || 'none found'}. ` +
      `Set LLM_ENABLE_<PROVIDER>=true and provide corresponding API keys.`
    );
  }

  const getFallbacks = () => {
    return [
      process.env.LLM_FALLBACK_1,
      process.env.LLM_FALLBACK_2,
      process.env.LLM_FALLBACK_3,
      process.env.LLM_FALLBACK_4,
      process.env.LLM_FALLBACK_5,
    ].filter(Boolean).map(s => s.toLowerCase());
  };

  return {
    temperature: requireEnv('LLM_TEMPERATURE', 'number'),
    maxTokens: requireEnv('LLM_MAX_TOKENS', 'number'),
    maxPrdChars: requireEnv('LLM_MAX_PRD_CHARS', 'number'),
    groqMaxTokens: requireEnv('LLM_GROQ_MAX_TOKENS', 'number'),
    groqMaxPrdChars: requireEnv('LLM_GROQ_MAX_PRD_CHARS', 'number'),
    ollamaNumCtx: process.env.LLM_ENABLE_OLLAMA === 'true' ? requireEnv('OLLAMA_NUM_CTX', 'number') : null,
    ollamaNumPredict: process.env.LLM_ENABLE_OLLAMA === 'true' ? requireEnv('OLLAMA_NUM_PREDICT', 'number') : null,
    ollamaUrl: rawOllamaUrl,
    ollamaModel: rawOllamaModel,
    ollamaTimeoutMs: process.env.OLLAMA_TIMEOUT_MS ? Number(process.env.OLLAMA_TIMEOUT_MS) : 180000,
    
    isOllamaEnabled: process.env.LLM_ENABLE_OLLAMA === 'true',
    isGroqEnabled: process.env.LLM_ENABLE_GROQ === 'true',
    isGoogleEnabled: process.env.LLM_ENABLE_GOOGLE === 'true',
    isOpenAIEnabled: process.env.LLM_ENABLE_OPENAI === 'true',
    isOpenRouterEnabled: process.env.LLM_ENABLE_OPENROUTER === 'true',

    googleKeys,
    groqKeys,
    openaiKeys,
    openrouterKeys,

    fallbacks: getFallbacks(),

    models: {
      google: process.env.LLM_FALLBACK_GOOGLE_MODEL,
      groq: process.env.LLM_FALLBACK_GROQ_MODEL,
      ollama: process.env.LLM_FALLBACK_OLLAMA_MODEL,
      openai: process.env.LLM_FALLBACK_OPENAI_MODEL,
      openrouter: process.env.LLM_FALLBACK_OPENROUTER_MODEL,
    }
  };
}

export async function callOllama(systemPrompt, userPrompt, config, maxTokensOverride) {
  if (!config.isOllamaEnabled) throw new Error('Ollama is disabled.');
  if (!config.ollamaUrl) throw new Error('OLLAMA_URL is not configured.');
  if (!config.ollamaModel) throw new Error('OLLAMA_MODEL is not configured.');

  const modelId = config.ollamaModel.replace(/^ollama\//, '');
  let ollamaUrl = config.ollamaUrl;
  if (!ollamaUrl.includes('/api/')) {
    ollamaUrl = ollamaUrl.replace(/\/+$/, '') + '/api/chat';
  }
  
  let safeUserPrompt = userPrompt;

  let res;
  try {
    res = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: safeUserPrompt }
        ],
        stream: false,
        options: {
          temperature: config.temperature,
          num_predict: maxTokensOverride || config.ollamaNumPredict,
          num_ctx: config.ollamaNumCtx
        }
      }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(config.ollamaTimeoutMs || 180000) : undefined
    });
  } catch (netErr) {
    throw new LLMError(`Network request to Ollama failed (${netErr.message})`, 'TRANSIENT_ERROR');
  }

  let data;
  try {
    data = await res.json();
  } catch (jsonErr) {
    throw new LLMError(`Invalid JSON response from Ollama (${jsonErr.message})`, 'TRANSIENT_ERROR');
  }

  if (!res.ok || data.error) {
    throw new LLMError(data?.error || JSON.stringify(data), 'TRANSIENT_ERROR');
  }
  return data.message?.content || '';
}

export async function callGemini(apiKey, model, systemPrompt, userPrompt, config, maxTokensOverride) {
  if (!config.isGoogleEnabled) throw new Error('Google is disabled.');
  const modelsToTry = ['gemini-3.8-flash'];
  let lastError = null;

  for (const currentModel of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`;
    let safeUserPrompt = userPrompt;

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: safeUserPrompt }] }],
          generationConfig: { 
              temperature: config.temperature, 
              maxOutputTokens: maxTokensOverride || config.maxTokens,
              thinkingConfig: { thinkingBudget: 0 }
          }
        })
      });
    } catch (netErr) {
      lastError = new LLMError(`Network request to Google failed (${netErr.message})`, 'TRANSIENT_ERROR');
      continue;
    }

    let data;
    try {
      data = await res.json();
    } catch (jsonErr) {
      lastError = new LLMError(`Invalid JSON response from Google (${jsonErr.message})`, 'TRANSIENT_ERROR');
      continue;
    }

    // Throw error if not OK or if error object exists
    if (!res.ok || data.error) {
      const errorMsg = data?.error?.message || JSON.stringify(data);
      const code = data?.error?.code;
      const status = data?.error?.status;
      
      // If it is a model-specific error or temporary high demand, fallback to next model
      if (status === 'NOT_FOUND' || errorMsg.includes('not found') || errorMsg.includes('no longer available') || status === 'UNAVAILABLE' || code === 503 || errorMsg.includes('high demand')) {
        lastError = new LLMError(errorMsg, 'TRANSIENT_ERROR');
        continue;
      }
      if (status === 'UNAUTHENTICATED' || status === 'PERMISSION_DENIED' || errorMsg.includes('API key') || errorMsg.includes('denied access')) {
        throw new LLMError(errorMsg, 'KEY_SPECIFIC_ERROR');
      }
      if (errorMsg.includes('free_tier_requests') || errorMsg.includes('requests per day') || errorMsg.includes('exceeded your current quota') || errorMsg.includes('billing details') || errorMsg.includes('credit')) {
        throw new LLMError(errorMsg, 'KEY_SPECIFIC_ERROR');
      }
      if (errorMsg.includes('Please retry in')) {
        const retryMatch = errorMsg.match(/Please retry in\s+([0-9.]+)\s*s/i);
        const retryMs = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) + 1500 : 25000;
        const err = new LLMError(errorMsg, 'TRANSIENT_ERROR');
        err.retryAfterMs = retryMs;
        throw err;
      }
      if (status === 'RESOURCE_EXHAUSTED' || code === 429 || errorMsg.includes('rate limit')) {
        const err = new LLMError(errorMsg, 'TRANSIENT_ERROR');
        err.retryAfterMs = 25000;
        throw err;
      }
      if (errorMsg.includes('quota')) {
        throw new LLMError(errorMsg, 'KEY_SPECIFIC_ERROR');
      }
      throw new LLMError(errorMsg, 'KEY_SPECIFIC_ERROR');
    }

    const candidate = data?.candidates?.[0];
    if (!candidate) {
      lastError = new LLMError('Gemini returned no candidates (possible silent quota issue)', 'KEY_SPECIFIC_ERROR');
      continue;
    }
    const resultText = (candidate.content?.parts || []).map(p => p.text || '').join('');
    if (!resultText && candidate.finishReason === 'MAX_TOKENS') {
      lastError = new LLMError('Gemini token limit reached during reasoning/generation', 'TRANSIENT_ERROR');
      continue;
    }
    if (resultText.includes('This model is currently experiencing high demand')) {
      lastError = new LLMError(resultText, 'TRANSIENT_ERROR');
      continue;
    }
    return resultText;
  }
  throw lastError || new LLMError('All Gemini candidate models failed', 'TRANSIENT_ERROR');
}

export async function callGroq(apiKey, model, systemPrompt, userPrompt, config, maxTokensOverride) {
  if (!config.isGroqEnabled) throw new Error('Groq is disabled.');
  let safeUserPrompt = userPrompt;

  // Protect against Groq ITPM limit (Strict 7000 token limit = ~19,000 characters total)
  const groqMaxChars = 19000;
  const sysLen = (systemPrompt || '').length;
  const totalCharLength = sysLen + (safeUserPrompt || '').length;
  if (totalCharLength > groqMaxChars) {
    const maxUserChars = Math.max(3000, groqMaxChars - sysLen - 100);
    safeUserPrompt = safeUserPrompt.slice(0, maxUserChars) + '\n\n[Context truncated to fit Groq ITPM limit]';
  }

  let res;
  try {
    const payload = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: safeUserPrompt }
      ],
      temperature: config.temperature,
      max_tokens: maxTokensOverride || config.groqMaxTokens
    };
    if (model.includes('gpt-oss') || model.includes('reasoning')) {
      payload.reasoning_effort = 'low';
    }
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (netErr) {
    throw new LLMError(`Network request to Groq failed (${netErr.message})`, 'TRANSIENT_ERROR');
  }

  let data;
  try {
    data = await res.json();
  } catch (jsonErr) {
    throw new LLMError(`Invalid JSON response from Groq (${jsonErr.message})`, 'TRANSIENT_ERROR');
  }

  if (!res.ok || data.error) {
    const errorMsg = data?.error?.message || JSON.stringify(data);
    const lowerMsg = errorMsg.toLowerCase();
    if (lowerMsg.includes('does not exist') || lowerMsg.includes('decommissioned')) {
        throw new LLMError(errorMsg, 'PERMANENT_PROVIDER_ERROR');
    }
    if (lowerMsg.includes('rate limit') || lowerMsg.includes('429') || lowerMsg.includes('tpm') || lowerMsg.includes('rpm') || lowerMsg.includes('try again in')) {
        const match = errorMsg.match(/try again in ([0-9.]+)s/i);
        const retryAfterMs = match ? Math.ceil(parseFloat(match[1]) * 1000) : 20000;
        const err = new LLMError(errorMsg, 'TRANSIENT_ERROR');
        err.retryAfterMs = retryAfterMs;
        err.isQuotaRateLimit = true;
        throw err;
    }
    if (lowerMsg.includes('api key')) {
        throw new LLMError(errorMsg, 'KEY_SPECIFIC_ERROR');
    }
    throw new LLMError(errorMsg, 'KEY_SPECIFIC_ERROR');
  }
  
  const choice = data.choices?.[0];
  if (!choice) {
    throw new LLMError('No choices returned by Groq', 'TRANSIENT_ERROR');
  }
  const msg = choice.message;
  let content = msg?.content || '';
  if (!content.trim() && msg?.reasoning) {
    content = msg.reasoning;
  }
  return content;
}

export async function callOpenAI(apiKey, model, systemPrompt, userPrompt, config, maxTokensOverride) {
  if (!config.isOpenAIEnabled) throw new Error('OpenAI is disabled.');
  let safeUserPrompt = userPrompt;

  let res;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: safeUserPrompt }
        ],
        temperature: config.temperature,
        max_tokens: maxTokensOverride || config.maxTokens
      })
    });
  } catch (netErr) {
    throw new LLMError(`Network request to OpenAI failed (${netErr.message})`, 'TRANSIENT_ERROR');
  }

  let data;
  try {
    data = await res.json();
  } catch (jsonErr) {
    throw new LLMError(`Invalid JSON response from OpenAI (${jsonErr.message})`, 'TRANSIENT_ERROR');
  }

  if (!res.ok || data.error) {
    const errorMsg = data?.error?.message || JSON.stringify(data);
    if (errorMsg.includes('rate limit') || errorMsg.includes('429') || errorMsg.includes('quota')) {
        throw new LLMError(errorMsg, 'TRANSIENT_ERROR');
    }
    throw new LLMError(errorMsg, 'KEY_SPECIFIC_ERROR');
  }
  
  return data.choices[0].message.content;
}

export async function callOpenRouter(apiKey, model, systemPrompt, userPrompt, config, maxTokensOverride) {
  if (!config.isOpenRouterEnabled) throw new Error('OpenRouter is disabled.');
  let safeUserPrompt = userPrompt;

  let res;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 
          'Authorization': `Bearer ${apiKey}`, 
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'OpenClaw IDE'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: safeUserPrompt }
        ],
        temperature: config.temperature,
        max_tokens: maxTokensOverride || config.maxTokens
      }),
      signal: AbortSignal.timeout(90000)
    });
  } catch (netErr) {
    throw new LLMError(`Network request to OpenRouter failed (${netErr.message})`, 'TRANSIENT_ERROR');
  }

  let data;
  try {
    data = await res.json();
  } catch (jsonErr) {
    throw new LLMError(`Invalid JSON response from OpenRouter (${jsonErr.message})`, 'TRANSIENT_ERROR');
  }

  if (!res.ok || data.error) {
    const errorMsg = data?.error?.message || JSON.stringify(data);
    if (errorMsg.includes('can only afford')) {
        const match = errorMsg.match(/afford (\d+)/);
        const affordable = match ? parseInt(match[1]) : null;
        throw new LLMError(errorMsg, 'CREDIT_EXHAUSTED', affordable);
    }
    if (errorMsg.includes('rate limit') || errorMsg.includes('429')) throw new LLMError(errorMsg, 'TRANSIENT_ERROR');
    if (errorMsg.includes('API key')) throw new LLMError(errorMsg, 'KEY_SPECIFIC_ERROR');
    throw new LLMError(errorMsg, 'KEY_SPECIFIC_ERROR');
  }
  
  const choice = data.choices?.[0];
  const content = (choice?.message?.content || choice?.message?.reasoning || choice?.text || '').trim();
  if (!content) {
    throw new LLMError('OpenRouter returned empty content', 'TRANSIENT_ERROR');
  }
  return content;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

const globalExhaustedKeys = new Map();
const globalExhaustedProviders = new Map();
const globalKeyCooldowns = new Map();

export async function callLLM(systemPrompt, userPrompt, context = {}) {
  const { sendEvent, generationId = 'unknown', targetFile = '' } = context;
  const config = getLLMConfig();
  const pacingMs = (config.isGoogleEnabled && config.fallbacks[0] === 'google') ? 2200 : 1000;
  await sleep(pacingMs); // Prevent tight loop rate limits
  const attempts = [];
  const isBusinessCritical = /model|auth|schema|migration|config|contract|database/i.test(targetFile);

  for (const provider of config.fallbacks) {
    if (provider === 'google' && config.isGoogleEnabled) {
      for (let i = 0; i < config.googleKeys.length; i++) {
        const key = config.googleKeys[i];
        attempts.push({
          providerBase: 'Google',
          name: `Google (Key ${i + 1})`,
          isCloud: true,
          fn: (sys, usr, override) => callGemini(key, config.models.google, sys, usr, config, override)
        });
      }
    } else if (provider === 'groq' && config.isGroqEnabled) {
      for (let i = 0; i < config.groqKeys.length; i++) {
        const key = config.groqKeys[i];
        attempts.push({
          providerBase: 'Groq',
          name: `Groq (Key ${i + 1})`,
          isCloud: true,
          fn: (sys, usr, override) => callGroq(key, config.models.groq, sys, usr, config, override)
        });
      }
    } else if (provider === 'openai' && config.isOpenAIEnabled) {
      for (let i = 0; i < config.openaiKeys.length; i++) {
        const key = config.openaiKeys[i];
        attempts.push({
          providerBase: 'OpenAI',
          name: `OpenAI (Key ${i + 1})`,
          isCloud: true,
          fn: (sys, usr, override) => callOpenAI(key, config.models.openai, sys, usr, config, override)
        });
      }
    } else if (provider === 'openrouter' && config.isOpenRouterEnabled) {
      for (let i = 0; i < config.openrouterKeys.length; i++) {
        const key = config.openrouterKeys[i];
        attempts.push({
          providerBase: 'OpenRouter',
          name: `OpenRouter (Key ${i + 1})`,
          isCloud: true,
          fn: (sys, usr, override) => callOpenRouter(key, config.models.openrouter, sys, usr, config, override)
        });
      }
    } else if (provider === 'ollama' && config.isOllamaEnabled) {
      attempts.push({
        providerBase: 'Ollama',
        name: `Ollama`,
        isCloud: false,
        fn: (sys, usr, override) => callOllama(sys, usr, config, override)
      });
    }
  }

  // Respect the explicit fallback order configured in server/.env (LLM_FALLBACK_1, LLM_FALLBACK_2, etc.)
  // Do not re-sort cloud providers ahead of Ollama when Ollama is selected as primary.

  if (attempts.length === 0) {
    throw new Error("No LLM providers are configured or enabled in the fallback sequence.");
  }

  if (targetFile && sendEvent) {
    const chosen = attempts[0]?.name || 'Default Provider';
    sendEvent('log', `🤖 [llm_router] Routing ${targetFile} to ${chosen} (business-critical: ${isBusinessCritical})`);
  }

  if (!globalExhaustedKeys.has(generationId)) {
      globalExhaustedKeys.set(generationId, new Set());
  }
  if (!globalExhaustedProviders.has(generationId)) {
      globalExhaustedProviders.set(generationId, new Set());
  }
  if (!globalKeyCooldowns.has(generationId)) {
      globalKeyCooldowns.set(generationId, new Map());
  }
  
  const exhaustedKeys = globalExhaustedKeys.get(generationId);
  const exhaustedProviders = globalExhaustedProviders.get(generationId);
  const keyCooldowns = globalKeyCooldowns.get(generationId);
  
  let currentProviderBase = null;

  if (sendEvent) {
     sendEvent('llm_request_started', { generationId, timestamp: new Date().toISOString() });
  }

  // Multi-pass resilient executor: up to 3 passes if all failures were transient/network
  for (let pass = 1; pass <= 3; pass++) {
    const errors = [];
    let hadTransientError = false;
    let maxRetryAfterMs = 0;

    for (const attempt of attempts) {
      if (exhaustedProviders.has(attempt.providerBase)) continue;
      if (exhaustedKeys.has(attempt.name)) continue;

      // Check if key is currently in temporary cooldown (e.g. 8-second temporary demand pause or 25s rate-limit)
      const cooldownUntil = keyCooldowns.get(attempt.name) || 0;
      if (cooldownUntil > Date.now()) {
        hadTransientError = true;
        const remainingMs = cooldownUntil - Date.now();
        if (remainingMs > maxRetryAfterMs) {
          maxRetryAfterMs = remainingMs;
        }
        continue;
      }

      let maxTokens = config.maxTokens;
      let safeUserPrompt = userPrompt;

      if (attempt.providerBase === 'Ollama' && config.ollamaNumPredict) {
          maxTokens = config.ollamaNumPredict;
      } else if (attempt.providerBase === 'Groq') {
          const groqLimit = 8000;
          const sysLen = (systemPrompt || '').length;
          const maxPromptChars = Math.max(3000, 18000 - sysLen - 100);
          if (safeUserPrompt.length > maxPromptChars) {
              safeUserPrompt = safeUserPrompt.slice(0, maxPromptChars) + '\n\n[Context truncated to fit Groq token window]';
          }
          maxTokens = Math.min(TokenBudgeter.calculateBudget(systemPrompt, safeUserPrompt, groqLimit, config.groqMaxTokens), config.groqMaxTokens || 3500);
      }

      if (sendEvent) {
          if (currentProviderBase !== attempt.providerBase) {
              if (currentProviderBase !== null) {
                  sendEvent('llm_provider_fallback', { generationId, from: currentProviderBase, to: attempt.providerBase, timestamp: new Date().toISOString() });
              }
              currentProviderBase = attempt.providerBase;
          }
          sendEvent('llm_provider_attempt', { generationId, provider: attempt.providerBase, model: attempt.name, timestamp: new Date().toISOString() });
      }

      console.log(`[LLM Router] Trying: ${attempt.name} (Pass ${pass}, Budgeted Max Tokens: ${maxTokens})`);
      
      try {
          const result = await attempt.fn(systemPrompt, safeUserPrompt, maxTokens);
          console.log(`[LLM Router] ✅ Success: ${attempt.name}`);
          
          if (sendEvent) {
              sendEvent('llm_provider_selected', { generationId, provider: attempt.providerBase, model: attempt.name, timestamp: new Date().toISOString() });
          }
          
          // Clear any historical cooldown on success
          keyCooldowns.delete(attempt.name);
          return result;
      } catch (err) {
          const msg = err.message || err.toString();
          console.warn(`[LLM Router] ⚠️ Failed ${attempt.name}: ${msg}`);
          errors.push(`${attempt.name}: ${msg}`);
          
          if (sendEvent) {
              sendEvent('llm_provider_failed', { generationId, provider: attempt.providerBase, model: attempt.name, reason: msg, timestamp: new Date().toISOString() });
          }
          
          const isNetError = /ECONNRESET|ENOTFOUND|ETIMEDOUT|fetch failed|network|timeout/i.test(msg);

          if (err instanceof LLMError) {
              if (err.category === 'PERMANENT_PROVIDER_ERROR') {
                  exhaustedProviders.add(attempt.providerBase);
                  if (sendEvent) {
                      sendEvent('llm_provider_exhausted', { generationId, provider: attempt.providerBase, reason: msg, timestamp: new Date().toISOString() });
                  }
              } else if (err.category === 'KEY_SPECIFIC_ERROR' || err.category === 'CREDIT_EXHAUSTED') {
                  // Truly dead/invalid/unauthenticated key
                  exhaustedKeys.add(attempt.name);
                  if (sendEvent) {
                      sendEvent('llm_key_rotation', { generationId, provider: attempt.providerBase, failedModel: attempt.name, reason: msg, timestamp: new Date().toISOString() });
                  }
              } else if (err.category === 'TRANSIENT_ERROR' || isNetError) {
                  // Temporary demand spike, rate-limit, or brief network glitch: DO NOT PERMANENTLY BURN KEY!
                  hadTransientError = true;
                  const retryDelay = err.retryAfterMs || 8000;
                  if (err.retryAfterMs && err.retryAfterMs > maxRetryAfterMs) {
                      maxRetryAfterMs = err.retryAfterMs;
                  }
                  
                  const isProjectQuota = (attempt.providerBase.toLowerCase() !== 'groq' && attempt.providerBase.toLowerCase() !== 'google') && (err.isQuotaRateLimit || /Please retry in|Please try again in|rate limit|429|RESOURCE_EXHAUSTED/i.test(msg));
                  if (isProjectQuota) {
                    // R1: Free-tier project rate limit applies to all keys of this provider project
                    for (const a of attempts) {
                      if (a.providerBase === attempt.providerBase) {
                        keyCooldowns.set(a.name, Date.now() + retryDelay);
                      }
                    }
                    if (sendEvent) {
                      sendEvent('log', `⏳ [rate_limit_cooldown] Provider ${attempt.providerBase} hit project rate limit (${msg.slice(0, 60)}...). Pausing all ${attempt.providerBase} keys for ${Math.round(retryDelay / 1000)}s.`);
                    }
                  } else {
                    keyCooldowns.set(attempt.name, Date.now() + retryDelay);
                    if (sendEvent) {
                      sendEvent('log', `⚠️ Transient error on ${attempt.name} (${msg.slice(0, 70)}). Key paused for ${Math.round(retryDelay / 1000)}s; rotating to next active key.`);
                    }
                  }
                  await sleep(1000); // Breathe 1s before next key attempt
              }
          } else if (isNetError) {
              // Network-level glitch: DO NOT permanently burn cloud keys, but mark unreachable local daemon offline
              if (attempt.providerBase === 'Ollama' && attempts.length > 1) {
                  exhaustedProviders.add('Ollama');
                  if (sendEvent) {
                      sendEvent('log', `⚠️ Ollama daemon unreachable (${msg.slice(0, 70)}). Bypassing Ollama for this generation.`);
                  }
              } else {
                  hadTransientError = true;
                  keyCooldowns.set(attempt.name, Date.now() + 6000);
                  await sleep(1000);
              }
          } else {
              // Unknown fatal error: mark key as exhausted
              exhaustedKeys.add(attempt.name);
              if (sendEvent) {
                  sendEvent('llm_key_rotation', { generationId, provider: attempt.providerBase, failedModel: attempt.name, reason: msg, timestamp: new Date().toISOString() });
              }
          }
      }
    }

    // If we completed the loop and had transient errors, wait and retry pass before throwing
    if (pass < 3 && hadTransientError) {
      const waitMs = Math.max(15000, Math.min(45000, maxRetryAfterMs || 20000));
      console.log(`[LLM Router] Pass ${pass} ended with transient/network issues. Waiting ${Math.round(waitMs / 1000)}s for provider/network recovery before Pass ${pass + 1}...`);
      if (sendEvent) {
        sendEvent('log', `⏳ All available keys encountered temporary demand/network spikes. Waiting ${Math.round(waitMs / 1000)}s for provider recovery before retry pass ${pass + 1}/3...`);
      }
      await sleep(waitMs);
      keyCooldowns.clear(); // Reset temporary cooldowns for next pass
      continue;
    }

    if (pass === 3 || !hadTransientError) {
      throw new Error(`All configured LLMs failed in fallback queue.\nDetails:\n${errors.join('\n')}`);
    }
  }
}

export function getLLMClientConfig() {
  const config = getLLMConfig();
  const primaryProvider = config.fallbacks[0];
  if (!primaryProvider) {
    throw new Error('CRITICAL CONFIGURATION ERROR: No LLM fallback provider configured in .env (LLM_FALLBACK_1).');
  }
  
  let actualModel = '';
  if (primaryProvider === 'ollama') actualModel = config.ollamaModel;
  else if (primaryProvider === 'groq') actualModel = config.models.groq;
  else if (primaryProvider === 'google') actualModel = config.models.google;
  else if (primaryProvider === 'openai') actualModel = config.models.openai;
  else if (primaryProvider === 'openrouter') actualModel = config.models.openrouter;
  else actualModel = config.models[primaryProvider] || '';

  const modelShortName = actualModel.replace(/^ollama\//, '');
  
  return {
    provider: primaryProvider,
    model: modelShortName,
    configured: true,
    source: 'server/.env (Fallback Router)',
    status: 'active',
    activeModel: {
      id: `${primaryProvider}/${modelShortName}`,
      name: `${modelShortName} (Provider: ${primaryProvider})`,
      provider: primaryProvider,
      color: '#8b5cf6'
    },
    fallbacksConfigured: config.fallbacks,
    limits: {
      maxPrdChars: config.maxPrdChars,
      maxTokens: config.maxTokens,
      temperature: config.temperature
    }
  };
}
