export class LLMUnavailableError extends Error {
  constructor(message = "LLM service is not configured or unavailable.") {
    super(message);
    this.name = "LLMUnavailableError";
  }
}

export class LLMTimeoutError extends Error {
  constructor(message = "LLM request timed out after 20 seconds.") {
    super(message);
    this.name = "LLMTimeoutError";
  }
}

export interface LLMClient {
  completeJson(systemPrompt: string, userPrompt: string): Promise<Record<string, unknown>>;
  isAvailable(): boolean;
  getModelName(): string;
}

/**
 * Strips code fences and attempts to clean standard JSON output.
 */
export function cleanJsonOutput(raw: string): string {
  let cleaned = raw.trim();

  // Strip Markdown JSON code blocks
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
    cleaned = cleaned.replace(/\s*```$/i, "");
  }

  cleaned = cleaned.trim();

  // Keep the first complete JSON value when a provider appends prose after it.
  const objectStart = cleaned.indexOf("{");
  const arrayStart = cleaned.indexOf("[");
  const start = objectStart === -1 ? arrayStart : arrayStart === -1 ? objectStart : Math.min(objectStart, arrayStart);
  if (start === -1) return cleaned;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  return cleaned;
}

/**
 * Provider-agnostic LLM Client using standard fetch with 20s timeout.
 */
export class ProviderNeutralLLMClient implements LLMClient {
  private provider: string;
  private model: string;
  private apiKey: string;
  private timeoutMs: number;

  constructor(options?: {
    provider?: string;
    model?: string;
    apiKey?: string;
    timeoutMs?: number;
  }) {
    this.provider = (options?.provider || process.env.LLM_PROVIDER || "none").toLowerCase();
    this.model = options?.model || process.env.LLM_MODEL || "";
    this.apiKey = options?.apiKey || process.env.LLM_API_KEY || "";
    this.timeoutMs = options?.timeoutMs ?? 20000; // 20s timeout
  }

  isAvailable(): boolean {
    const validProviders = ["gemini", "openai", "anthropic", "groq"];
    if (!validProviders.includes(this.provider)) return false;
    if (!this.apiKey || !this.apiKey.trim()) return false;
    if (!this.model || !this.model.trim()) return false;
    return true;
  }

  getModelName(): string {
    return this.model || "";
  }

  async completeJson(systemPrompt: string, userPrompt: string): Promise<Record<string, unknown>> {
    if (!this.isAvailable()) {
      throw new LLMUnavailableError(`LLM provider is set to '${this.provider}' or API key is not configured.`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      let rawJsonString = "";

      switch (this.provider) {
        case "gemini":
          rawJsonString = await this.callGemini(systemPrompt, userPrompt, controller.signal);
          break;
        case "openai":
          rawJsonString = await this.callOpenAI(systemPrompt, userPrompt, controller.signal, "https://api.openai.com/v1/chat/completions");
          break;
        case "groq":
          rawJsonString = await this.callOpenAI(systemPrompt, userPrompt, controller.signal, "https://api.groq.com/openai/v1/chat/completions");
          break;
        case "anthropic":
          rawJsonString = await this.callAnthropic(systemPrompt, userPrompt, controller.signal);
          break;
        default:
          throw new LLMUnavailableError(`Unsupported provider '${this.provider}'`);
      }

      const cleaned = cleanJsonOutput(rawJsonString);
      return JSON.parse(cleaned);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new LLMTimeoutError();
      }
      if (error instanceof LLMUnavailableError || error instanceof LLMTimeoutError) {
        throw error;
      }
      throw new LLMUnavailableError(error instanceof Error ? error.message : "LLM API request failed");
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async callGemini(systemPrompt: string, userPrompt: string, signal: AbortSignal): Promise<string> {
    const model = this.model;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new LLMUnavailableError(`Gemini error ${res.status}: ${errText.slice(0, 150)}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidate) {
      throw new LLMUnavailableError("Gemini returned empty candidate response.");
    }
    return candidate;
  }

  private async callOpenAI(
    systemPrompt: string,
    userPrompt: string,
    signal: AbortSignal,
    endpoint: string
  ): Promise<string> {
    const model = this.model;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new LLMUnavailableError(`${this.provider} error ${res.status}: ${errText.slice(0, 150)}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new LLMUnavailableError(`${this.provider} returned empty choice content.`);
    }
    return content;
  }

  private async callAnthropic(systemPrompt: string, userPrompt: string, signal: AbortSignal): Promise<string> {
    const model = this.model;
    const url = "https://api.anthropic.com/v1/messages";

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal,
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new LLMUnavailableError(`Anthropic error ${res.status}: ${errText.slice(0, 150)}`);
    }

    const data = await res.json();
    const textPart = data.content?.find((c: { type: string; text?: string }) => c.type === "text");
    if (!textPart?.text) {
      throw new LLMUnavailableError("Anthropic returned empty response.");
    }
    return textPart.text;
  }
}

export const defaultLLMClient = new ProviderNeutralLLMClient();
