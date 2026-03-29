#!/usr/bin/env bun
/**
 * Interactive onboarding flow for configuring OpenPaw.
 */
import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard, useRenderer } from "@opentui/react";
import { useCallback, useReducer, useState } from "react";
import {
  configExists,
  loadConfig,
  probeProviderConnection,
  saveConfig,
  PERSONALITIES,
  type OpenPawConfig,
  type Personality,
  type ProviderConfig,
} from "../config";
import { ensureWorkspaceLayout } from "../agent/workspace-bootstrap";
import {
  WelcomeScreen,
  InputScreen,
  MenuScreen,
  PersonalityScreen,
  ConfirmScreen,
  StartChatScreen,
} from "./components/onboard-ui";
import { runOpenPawTui } from "./tui";

type Step =
  | "provider-preset"
  | "provider-baseUrl"
  | "provider-apiKey"
  | "provider-model"
  | "telegram-choice"
  | "telegram-token"
  | "personality"
  | "confirm"
  | "start-chat";

type ProviderPreset = "openai" | "openrouter" | "ollama" | "custom";

type WizardState = {
  step: Step;
  providerPreset: ProviderPreset;
  provider: ProviderConfig;
  botToken: string;
  personality: Personality;
};

type WizardAction =
  | { type: "SET_STEP"; step: Step }
  | { type: "SET_PROVIDER_PRESET"; value: ProviderPreset }
  | { type: "PATCH_PROVIDER"; patch: Partial<ProviderConfig> }
  | { type: "SET_BOT_TOKEN"; value: string }
  | { type: "SET_PERSONALITY"; value: Personality };

const PROVIDER_PRESETS: Record<
  ProviderPreset,
  { label: string; provider: Partial<ProviderConfig> }
> = {
  openai: {
    label: "OpenAI",
    provider: { baseUrl: "https://openai-litellm.duckdns.org/v1", model: "gpt-4o" },
  },
  openrouter: {
    label: "OpenRouter",
    provider: { baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  },
  ollama: {
    label: "Local / Ollama",
    provider: { baseUrl: "http://localhost:11434/v1", model: "llama3.1" },
  },
  custom: {
    label: "Custom",
    provider: {},
  },
};

function initialWizardState(existingConfig: OpenPawConfig | null): WizardState {
  return {
    step: "provider-preset",
    providerPreset: "openai",
    provider: existingConfig?.provider ?? { baseUrl: "", apiKey: "", model: "" },
    botToken: existingConfig?.channels?.telegram?.botToken ?? "",
    personality: existingConfig?.personality ?? "Assistant",
  };
}

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step };
    case "SET_PROVIDER_PRESET":
      return {
        ...state,
        providerPreset: action.value,
        provider: {
          ...state.provider,
          ...PROVIDER_PRESETS[action.value].provider,
        },
      };
    case "PATCH_PROVIDER":
      return { ...state, provider: { ...state.provider, ...action.patch } };
    case "SET_BOT_TOKEN":
      return { ...state, botToken: action.value };
    case "SET_PERSONALITY":
      return { ...state, personality: action.value };
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

function OnboardingWizard({
  existingConfig,
  onComplete,
}: {
  existingConfig: OpenPawConfig | null;
  onComplete: (startChat: boolean) => void;
}) {
  const [state, dispatch] = useReducer(wizardReducer, existingConfig, initialWizardState);
  const { step, provider, botToken, personality } = state;
  const [probeResult, setProbeResult] = useState<Awaited<ReturnType<typeof probeProviderConnection>> | null>(null);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    setSaving(true);
    const result = await probeProviderConnection(provider);
    setProbeResult(result);
    if (!result.ok) {
      setSaving(false);
      return;
    }
    const config: OpenPawConfig = {
      provider,
      channels: botToken ? { telegram: { botToken } } : undefined,
      personality,
    };
    await saveConfig(config);
    ensureWorkspaceLayout();
    setSaving(false);
    dispatch({ type: "SET_STEP", step: "start-chat" });
  };

  switch (step) {
    case "provider-preset":
      return (
        <MenuScreen
          title="Provider Preset"
          label="Choose a starting provider preset:"
          items={Object.values(PROVIDER_PRESETS).map((preset) => preset.label)}
          onSelect={(index) => {
            const value = (Object.keys(PROVIDER_PRESETS)[index] ?? "openai") as ProviderPreset;
            dispatch({ type: "SET_PROVIDER_PRESET", value });
            dispatch({ type: "SET_STEP", step: "provider-baseUrl" });
          }}
        />
      );
    case "provider-baseUrl":
      return (
        <InputScreen
          key={step}
          title="Provider Configuration"
          label="Enter the base URL for your LLM provider:"
          value={provider.baseUrl}
          onChange={(v) =>
            dispatch({ type: "PATCH_PROVIDER", patch: { baseUrl: v } })
          }
          onSubmit={() =>
            dispatch({ type: "SET_STEP", step: "provider-apiKey" })
          }
          onBack={() =>
            dispatch({ type: "SET_STEP", step: "provider-preset" })
          }
          placeholder="https://openai-litellm.duckdns.org/v1"
        />
      );
    case "provider-apiKey":
      return (
        <InputScreen
          key={step}
          title="Provider Configuration"
          label="Enter your API key:"
          value={provider.apiKey}
          onChange={(v) =>
            dispatch({ type: "PATCH_PROVIDER", patch: { apiKey: v } })
          }
          onSubmit={() =>
            dispatch({ type: "SET_STEP", step: "provider-model" })
          }
          onBack={() =>
            dispatch({ type: "SET_STEP", step: "provider-baseUrl" })
          }
          placeholder="sk-..."
          password
        />
      );
    case "provider-model":
      return (
        <InputScreen
          key={step}
          title="Provider Configuration"
          label="Enter the model name:"
          value={provider.model}
          onChange={(v) =>
            dispatch({ type: "PATCH_PROVIDER", patch: { model: v } })
          }
          onSubmit={() => dispatch({ type: "SET_STEP", step: "telegram-choice" })}
          onBack={() =>
            dispatch({ type: "SET_STEP", step: "provider-apiKey" })
          }
          placeholder="gpt-4o"
        />
      );
    case "telegram-choice":
      return (
        <MenuScreen
          title="Channel Configuration"
          label="How do you want to start?"
          items={[
            "TUI only for now",
            botToken ? "Keep or edit Telegram bot token" : "Add Telegram bot token",
          ]}
          onSelect={(index) => {
            if (index === 0) {
              dispatch({ type: "SET_BOT_TOKEN", value: "" });
              dispatch({ type: "SET_STEP", step: "personality" });
              return;
            }
            dispatch({ type: "SET_STEP", step: "telegram-token" });
          }}
          onBack={() => dispatch({ type: "SET_STEP", step: "provider-model" })}
        />
      );
    case "telegram-token":
      return (
        <InputScreen
          key={step}
          title="Channel Configuration"
          label="Enter your Telegram bot token (optional, press Enter on an empty field to skip):"
          value={botToken}
          onChange={(v) => dispatch({ type: "SET_BOT_TOKEN", value: v })}
          onSubmit={() =>
            dispatch({ type: "SET_STEP", step: "personality" })
          }
          onBack={() =>
            dispatch({ type: "SET_STEP", step: "telegram-choice" })
          }
          placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
          password
          allowEmpty
        />
      );
    case "personality":
      return (
        <PersonalityScreen
          key={step}
          options={[...PERSONALITIES]}
          onSelect={(index) => {
            dispatch({
              type: "SET_PERSONALITY",
              value: PERSONALITIES[index] ?? "Assistant",
            });
            dispatch({ type: "SET_STEP", step: "confirm" });
          }}
          onBack={() => dispatch({ type: "SET_STEP", step: "telegram-choice" })}
        />
      );
    case "confirm":
      return (
        <ConfirmScreen
          key={step}
          config={{
            provider,
            channels: botToken ? { telegram: { botToken } } : undefined,
            personality,
          }}
          onConfirm={handleConfirm}
          onRestart={() =>
            dispatch({ type: "SET_STEP", step: "provider-preset" })
          }
          onBack={() =>
            dispatch({ type: "SET_STEP", step: "personality" })
          }
          hasExistingConfig={existingConfig !== null || configExists()}
          probeResult={probeResult}
          saving={saving}
        />
      );
    case "start-chat":
      return (
        <StartChatScreen
          key={step}
          onYes={() => onComplete(true)}
          onNo={() => onComplete(false)}
        />
      );
    default: {
      const _exhaustive: never = step;
      return _exhaustive;
    }
  }
}

function App({ existingConfig }: { existingConfig: OpenPawConfig | null }) {
  const [showWelcome, setShowWelcome] = useState(true);
  const renderer = useRenderer();

  useKeyboard((key) => {
    if (key.name === "escape") {
      renderer.destroy();
    }
  });

  const handleOnboardingComplete = (startChat: boolean) => {
    renderer.destroy();
    if (startChat) {
      void runOpenPawTui();
    }
  };

  const dismissWelcome = useCallback(() => {
    setShowWelcome(false);
  }, []);

  if (showWelcome) {
    return <WelcomeScreen onComplete={dismissWelcome} />;
  }

  return <OnboardingWizard existingConfig={existingConfig} onComplete={handleOnboardingComplete} />;
}

export async function handleOnboard(options: {}) {
  const existingConfig = await loadConfig();
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  });
  const root = createRoot(renderer);
  root.render(
    <App
      key={existingConfig ? "existing" : "fresh"}
      existingConfig={existingConfig}
    />,
  );
}
