import type { ProviderConfig } from "./types";

export type ProviderProbeResult =
  | { ok: true; message: string }
  | {
      ok: false;
      reason: "invalid_url" | "network" | "auth" | "http_error";
      message: string;
    };

/**
 * Best-effort provider reachability and credential probe for onboarding.
 *
 * It targets the OpenAI-style `/models` endpoint because that is the narrowest
 * generic check available across most OpenAI-compatible providers.
 */
export async function probeProviderConnection(
  provider: ProviderConfig,
): Promise<ProviderProbeResult> {
  let baseUrl: URL;
  try {
    baseUrl = new URL(provider.baseUrl);
  } catch {
    return {
      ok: false,
      reason: "invalid_url",
      message: "Base URL is invalid.",
    };
  }

  const modelsUrl = new URL("models", baseUrl.toString().endsWith("/") ? baseUrl : `${baseUrl}/`);

  try {
    const response = await fetch(modelsUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
      },
    });

    if (response.ok) {
      return { ok: true, message: "Provider connection test succeeded." };
    }
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        reason: "auth",
        message: "Provider rejected the API key.",
      };
    }
    if (response.status === 404 || response.status === 405) {
      return {
        ok: true,
        message:
          "Provider endpoint is reachable. `/models` is unavailable here, so the check fell back to reachability only.",
      };
    }
    return {
      ok: false,
      reason: "http_error",
      message: `Provider responded with HTTP ${response.status}.`,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "network",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
