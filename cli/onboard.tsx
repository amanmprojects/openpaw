#!/usr/bin/env bun
import { createRoot, useKeyboard, useRenderer } from "@opentui/react";
import { useCallback, useEffect, useReducer, useState } from "react";
import {
  configExists,
  deleteConfig,
  saveConfig,
  PERSONALITIES,
  type OpenPawConfig,
  type Personality,
  type ProviderConfig,
} from "../config";
import { ensureWorkspaceLayout } from "../agent/workspace-bootstrap";
import { createSafeCliRenderer } from "./lib/create-safe-cli-renderer";
import {
  WelcomeScreen,
  InputScreen,
  PersonalityScreen,
  ConfirmScreen,
  StartChatScreen,
} from "./components/onboard-ui";

type Step =
  | "provider-baseUrl"
  | "provider-apiKey"
  | "provider-model"
  | "telegram"
  | "personality"
  | "confirm"
  | "start-chat";

type WizardState = {
  step: Step;
  provider: ProviderConfig;
  botToken: string;
  personality: Personality;
};

type WizardAction =
  | { type: "SET_STEP"; step: Step }
  | { type: "PATCH_PROVIDER"; patch: Partial<ProviderConfig> }
  | { type: "SET_BOT_TOKEN"; value: string }
  | { type: "SET_PERSONALITY"; value: Personality };

const initialWizardState: WizardState = {
  step: "provider-baseUrl",
  provider: { baseUrl: "", apiKey: "", model: "" },
  botToken: "",
  personality: "Assistant",
};

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step };
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
  onComplete,
}: {
  onComplete: (startChat: boolean) => void;
}) {
  const [state, dispatch] = useReducer(wizardReducer, initialWizardState);
  const { step, provider, botToken, personality } = state;

  const handleConfirm = async () => {
    const config: OpenPawConfig = {
      provider,
      channels: botToken ? { telegram: { botToken } } : undefined,
      personality,
    };
    await saveConfig(config);
    ensureWorkspaceLayout();
    dispatch({ type: "SET_STEP", step: "start-chat" });
  };

  switch (step) {
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
          placeholder="https://api.openai.com/v1"
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
          onSubmit={() => dispatch({ type: "SET_STEP", step: "telegram" })}
          onBack={() =>
            dispatch({ type: "SET_STEP", step: "provider-apiKey" })
          }
          placeholder="gpt-4o"
        />
      );
    case "telegram":
      return (
        <InputScreen
          key={step}
          title="Channel Configuration"
          label="Enter your Telegram bot token:"
          value={botToken}
          onChange={(v) => dispatch({ type: "SET_BOT_TOKEN", value: v })}
          onSubmit={() =>
            dispatch({ type: "SET_STEP", step: "personality" })
          }
          onBack={() =>
            dispatch({ type: "SET_STEP", step: "provider-model" })
          }
          placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
          password
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
          onBack={() => dispatch({ type: "SET_STEP", step: "telegram" })}
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
            dispatch({ type: "SET_STEP", step: "provider-baseUrl" })
          }
          onBack={() =>
            dispatch({ type: "SET_STEP", step: "personality" })
          }
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

function App() {
  const [showWelcome, setShowWelcome] = useState(true);
  const renderer = useRenderer();

  useEffect(() => {
    if (configExists()) {
      deleteConfig();
    }
  }, []);

  useKeyboard((key) => {
    if (key.name === "escape") {
      renderer.destroy();
    }
  });

  const handleOnboardingComplete = (startChat: boolean) => {
    renderer.destroy();
    if (startChat) {
      console.log("Starting chat...");
    }
  };

  const dismissWelcome = useCallback(() => {
    setShowWelcome(false);
  }, []);

  if (showWelcome) {
    return <WelcomeScreen onComplete={dismissWelcome} />;
  }

  return <OnboardingWizard onComplete={handleOnboardingComplete} />;
}

/**
 * Starts the interactive first-run onboarding flow.
 */
export async function handleOnboard(_options: {}): Promise<void> {
  const renderer = await createSafeCliRenderer({
    exitOnCtrlC: true,
  });
  const root = createRoot(renderer);
  root.render(<App />);
}
