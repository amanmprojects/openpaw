#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard, useRenderer } from "@opentui/react";
import { useState, useEffect } from "react";
import {
  configExists,
  deleteConfig,
  saveConfig,
  PERSONALITIES,
  type OpenPawConfig,
  type ProviderConfig,
} from "../config/config";
import {
  WelcomeScreen,
  InputScreen,
  PersonalityScreen,
  ConfirmScreen,
  StartChatScreen,
} from "./components/onboard-ui";

type Step =
  | "welcome"
  | "provider-baseUrl"
  | "provider-apiKey"
  | "provider-model"
  | "telegram"
  | "personality"
  | "confirm"
  | "start-chat";

function OnboardingWizard({
  onComplete,
}: {
  onComplete: (startChat: boolean) => void;
}) {
  const [step, setStep] = useState<Step>("provider-baseUrl");
  const [provider, setProvider] = useState<ProviderConfig>({
    baseUrl: "",
    apiKey: "",
    model: "",
  });
  const [botToken, setBotToken] = useState("");
  const [personality, setPersonality] =
    useState<(typeof PERSONALITIES)[number]>("Assistant");

  const handleConfirm = async () => {
    const config: OpenPawConfig = {
      provider,
      channels: botToken ? { telegram: { botToken } } : undefined,
      personality,
    };
    await saveConfig(config);
    setStep("start-chat");
  };

  switch (step) {
    case "provider-baseUrl":
      return (
        <InputScreen
          key={step}
          title="Provider Configuration"
          label="Enter the base URL for your LLM provider:"
          value={provider.baseUrl}
          onChange={(v) => setProvider((p) => ({ ...p, baseUrl: v }))}
          onSubmit={() => setStep("provider-apiKey")}
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
          onChange={(v) => setProvider((p) => ({ ...p, apiKey: v }))}
          onSubmit={() => setStep("provider-model")}
          onBack={() => setStep("provider-baseUrl")}
          placeholder="sk-..."
        />
      );
    case "provider-model":
      return (
        <InputScreen
          key={step}
          title="Provider Configuration"
          label="Enter the model name:"
          value={provider.model}
          onChange={(v) => setProvider((p) => ({ ...p, model: v }))}
          onSubmit={() => setStep("telegram")}
          onBack={() => setStep("provider-apiKey")}
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
          onChange={setBotToken}
          onSubmit={() => setStep("personality")}
          onBack={() => setStep("provider-model")}
          placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
        />
      );
    case "personality":
      return (
        <PersonalityScreen
          key={step}
          options={[...PERSONALITIES]}
          onSelect={(index) => {
            setPersonality(PERSONALITIES[index] ?? "Assistant");
            setStep("confirm");
          }}
          onBack={() => setStep("telegram")}
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
          onRestart={() => setStep("provider-baseUrl")}
          onBack={() => setStep("personality")}
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
    default:
      return null;
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

  if (showWelcome) {
    return <WelcomeScreen onComplete={() => setShowWelcome(false)} />;
  }

  return <OnboardingWizard onComplete={handleOnboardingComplete} />;
}

export async function handleOnboard(options: {}) {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  });
  const root = createRoot(renderer);
  root.render(<App />);
}
