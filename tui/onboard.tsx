#!/usr/bin/env bun
import { createCliRenderer, TextAttributes } from "@opentui/core";
import { createRoot, useKeyboard, useRenderer } from "@opentui/react";
import { useState, useEffect } from "react";
import {
  configExists,
  deleteConfig,
  saveConfig,
  PERSONALITIES,
  type OpenPawConfig,
  type ProviderConfig,
  type ChannelsConfig,
} from "../services/config";

type Step =
  | "welcome"
  | "provider-baseUrl"
  | "provider-apiKey"
  | "provider-model"
  | "telegram"
  | "personality"
  | "confirm"
  | "start-chat";

const STEP_ORDER: Step[] = [
  "provider-baseUrl",
  "provider-apiKey",
  "provider-model",
  "telegram",
  "personality",
  "confirm",
  "start-chat",
];

function getPreviousStep(currentStep: Step): Step | null {
  const index = STEP_ORDER.indexOf(currentStep);
  if (index <= 0) return null;
  return STEP_ORDER[index - 1] ?? null;
}

function WelcomeScreen({ onComplete }: { onComplete: () => void }) {
  const [countdown, setCountdown] = useState(1);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          onComplete();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onComplete]);

  useKeyboard((key) => {
    if (key.name === "escape") {
      const renderer = useRenderer();
      renderer.destroy();
    }
  });

  return (
    <box alignItems="center" justifyContent="center" flexGrow={1}>
      <box flexDirection="column" alignItems="center" gap={1}>
        <ascii-font font="tiny" text="OpenPaw" color="#7aa2f7" />
        <text attributes={TextAttributes.DIM}>Welcome to OpenPaw</text>
        <text fg="#565f89">Starting in {countdown}...</text>
      </box>
    </box>
  );
}

function InputScreen({
  title,
  label,
  value,
  onChange,
  onSubmit,
  onBack,
  placeholder,
}: {
  title: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onBack?: () => void;
  placeholder?: string;
}) {
  const renderer = useRenderer();
  const [error, setError] = useState(false);

  useKeyboard((key) => {
    if (key.name === "escape") {
      renderer.destroy();
    }
    if (key.ctrl && key.name === "backspace" && onBack) {
      onBack();
    }
  });

  const handleSubmit = (submitted: string) => {
    if (submitted.trim() === "") {
      setError(true);
      return;
    }
    setError(false);
    // Keep parent state in sync: prop `value` can lag the native field by a frame.
    if (submitted !== value) {
      onChange(submitted);
    }
    onSubmit();
  };

  return (
    <box flexGrow={1} alignItems="center" justifyContent="center">
      <box flexDirection="column" gap={1} width={60}>
        <text fg="#7aa2f7">
          <strong>{title}</strong>
        </text>
        <text fg="#c0caf5">{label}</text>
        <input
          value={value}
          onChange={(v) => {
            setError(false);
            onChange(v);
          }}
          onSubmit={handleSubmit}
          placeholder={placeholder || ""}
          focused
          width={58}
          textColor="#c0caf5"
          cursorColor="#7aa2f7"
        />
        {error && <text fg="#f7768e">This field is required</text>}
        <box flexDirection="column" marginTop={1}>
          {onBack ? (
            <>
              <text fg="#565f89">Press Enter to continue</text>
              <text fg="#565f89">Ctrl+Backspace to go back</text>
              <text fg="#565f89">Esc to exit</text>
            </>
          ) : (
            <>
              <text fg="#565f89">Press Enter to continue</text>
              <text fg="#565f89">Esc to exit</text>
            </>
          )}
        </box>
      </box>
    </box>
  );
}

function SelectScreen({
  title,
  label,
  options,
  onSelect,
  onBack,
}: {
  title: string;
  label: string;
  options: { name: string; description?: string }[];
  onSelect: (index: number) => void;
  onBack?: () => void;
}) {
  const renderer = useRenderer();

  useKeyboard((key) => {
    if (key.name === "escape") {
      renderer.destroy();
    }
    if (key.ctrl && key.name === "backspace" && onBack) {
      onBack();
    }
  });

  return (
    <box flexGrow={1} alignItems="center" justifyContent="center">
      <box flexDirection="column" gap={1} width={60}>
        <text fg="#7aa2f7">
          <strong>{title}</strong>
        </text>
        <text fg="#c0caf5">{label}</text>
        <select
          options={options.map((o) => ({
            name: o.name,
            description: o.description || "",
          }))}
          onSelect={(index) => onSelect(index)}
          focused
          height={Math.min(options.length + 2, 10)}
          width={58}
        />
        <box flexDirection="column" marginTop={1}>
          {onBack ? (
            <>
              <text fg="#565f89">Use arrows to navigate</text>
              <text fg="#565f89">Press Enter to select</text>
              <text fg="#565f89">Ctrl+Backspace to go back</text>
              <text fg="#565f89">Esc to exit</text>
            </>
          ) : (
            <>
              <text fg="#565f89">Use arrows to navigate</text>
              <text fg="#565f89">Press Enter to select</text>
              <text fg="#565f89">Esc to exit</text>
            </>
          )}
        </box>
      </box>
    </box>
  );
}

function ConfirmScreen({
  config,
  onConfirm,
  onRestart,
  onBack,
}: {
  config: OpenPawConfig;
  onConfirm: () => void;
  onRestart: () => void;
  onBack?: () => void;
}) {
  const renderer = useRenderer();

  useKeyboard((key) => {
    if (key.name === "escape") {
      renderer.destroy();
    }
    if (key.ctrl && key.name === "backspace" && onBack) {
      onBack();
    }
  });

  return (
    <box flexGrow={1} alignItems="center" justifyContent="center">
      <box flexDirection="column" gap={1} width={60}>
        <text fg="#7aa2f7">
          <strong>Confirm Configuration</strong>
        </text>
        <text> </text>
        <text fg="#c0caf5">
          <strong>Provider:</strong>
        </text>
        <text fg="#a9b1d6"> Base URL: {config.provider.baseUrl}</text>
        <text fg="#a9b1d6"> Model: {config.provider.model}</text>
        <text fg="#a9b1d6">
          {" "}
          API Key: {"*".repeat(Math.min(config.provider.apiKey.length, 20))}
        </text>
        <text> </text>
        {config.channels?.telegram && (
          <>
            <text fg="#c0caf5">
              <strong>Telegram:</strong>
            </text>
            <text fg="#a9b1d6">
              {" "}
              Bot Token:{" "}
              {"*".repeat(
                Math.min(config.channels.telegram.botToken.length, 20),
              )}
            </text>
            <text> </text>
          </>
        )}
        <text fg="#c0caf5">
          <strong>Personality:</strong>
        </text>
        <text fg="#a9b1d6"> {config.personality}</text>
        <text> </text>
        <select
          options={[
            {
              name: "Save and continue",
              description: "Store configuration and proceed",
            },
            { name: "Start over", description: "Restart the setup process" },
          ]}
          onSelect={(index) => (index === 0 ? onConfirm() : onRestart())}
          focused
          width={58}
        />
        <box flexDirection="column" marginTop={1}>
          {onBack ? (
            <>
              <text fg="#565f89">Use arrows to navigate</text>
              <text fg="#565f89">Press Enter to select</text>
              <text fg="#565f89">Ctrl+Backspace to go back</text>
              <text fg="#565f89">Esc to exit</text>
            </>
          ) : (
            <>
              <text fg="#565f89">Use arrows to navigate</text>
              <text fg="#565f89">Press Enter to select</text>
              <text fg="#565f89">Esc to exit</text>
            </>
          )}
        </box>
      </box>
    </box>
  );
}

function StartChatScreen({
  onYes,
  onNo,
}: {
  onYes: () => void;
  onNo: () => void;
}) {
  const renderer = useRenderer();

  useKeyboard((key) => {
    if (key.name === "escape") {
      renderer.destroy();
    }
  });

  return (
    <box flexGrow={1} alignItems="center" justifyContent="center">
      <box flexDirection="column" gap={1} alignItems="center">
        <text fg="#73daca">
          <strong>Configuration saved!</strong>
        </text>
        <text> </text>
        <text fg="#c0caf5">Would you like to start chatting now?</text>
        <text> </text>
        <select
          options={[
            {
              name: "Yes, start chatting",
              description: "Launch the chat interface",
            },
            { name: "No, exit for now", description: "Exit and chat later" },
          ]}
          onSelect={(index) => (index === 0 ? onYes() : onNo())}
          focused
          width={40}
        />
      </box>
    </box>
  );
}

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
        <SelectScreen
          title="Personality Configuration"
          label="Select a personality for your assistant:"
          options={PERSONALITIES.map((p) => ({ name: p }))}
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
