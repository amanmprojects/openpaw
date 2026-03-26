import { TextAttributes, type SelectOption } from "@opentui/core";
import { useKeyboard, useRenderer } from "@opentui/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { OpenPawConfig } from "../../config";
import { ONBOARD } from "./theme";

export { ONBOARD };

export function OnboardScreenLayout({ children }: { children: ReactNode }) {
  return (
    <box flexGrow={1} alignItems="center" justifyContent="center">
      <box flexDirection="column" gap={1} width={ONBOARD.colWidth}>
        {children}
      </box>
    </box>
  );
}

export function FooterHints({
  variant,
  hasBack,
}: {
  variant: "input" | "menu";
  hasBack: boolean;
}) {
  const lines =
    variant === "input"
      ? hasBack
        ? [
            "Press Enter to continue",
            "Ctrl+Backspace to go back",
            "Esc to exit",
          ]
        : ["Press Enter to continue", "Esc to exit"]
      : hasBack
        ? [
            "Up/Down to move",
            "Enter to select",
            "Ctrl+Backspace to go back",
            "Esc to exit",
          ]
        : ["Up/Down to move", "Enter to select", "Esc to exit"];

  return (
    <box flexDirection="column">
      {lines.map((line) => (
        <text key={line} fg={ONBOARD.hint}>
          {line}
        </text>
      ))}
    </box>
  );
}

/** Vertical list using built-in `select` (navigation + selection handled by OpenTUI). */
export function OnboardSelect({
  items,
  onSelect,
  onBack,
}: {
  items: string[];
  onSelect: (index: number) => void;
  onBack?: () => void;
}) {
  const renderer = useRenderer();
  const options: SelectOption[] = useMemo(
    () =>
      items.map((name) => ({
        name,
        description: "",
      })),
    [items],
  );

  useKeyboard((key) => {
    if (key.name === "escape") {
      renderer.destroy();
      return;
    }
    if (key.ctrl && key.name === "backspace" && onBack) {
      onBack();
    }
  });

  const rowCount = items.length;
  const height = Math.min(Math.max(rowCount, 2), 14);

  return (
    <select
      focused
      width={ONBOARD.colWidth}
      height={height}
      options={options}
      showDescription={false}
      wrapSelection={false}
      showScrollIndicator={rowCount > height}
      selectedBackgroundColor="#414868"
      selectedTextColor={ONBOARD.accent}
      textColor={ONBOARD.text}
      backgroundColor="transparent"
      onSelect={(index) => {
        if (index >= 0 && index < items.length) {
          onSelect(index);
        }
      }}
    />
  );
}

export function WelcomeScreen({ onComplete }: { onComplete: () => void }) {
  const [countdown, setCountdown] = useState(1);
  const renderer = useRenderer();

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
      renderer.destroy();
    }
  });

  return (
    <box alignItems="center" justifyContent="center" flexGrow={1}>
      <box flexDirection="column" alignItems="center" gap={1}>
        <ascii-font font="tiny" text="OpenPaw" color={ONBOARD.accent} />
        <text attributes={TextAttributes.DIM}>Welcome to OpenPaw</text>
        <text fg={ONBOARD.hint}>Starting in {countdown}...</text>
      </box>
    </box>
  );
}

export function InputScreen({
  title,
  label,
  value,
  onChange,
  onSubmit,
  onBack,
  placeholder,
  password,
}: {
  title: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onBack?: () => void;
  placeholder?: string;
  password?: boolean;
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
    if (submitted !== value) {
      onChange(submitted);
    }
    onSubmit();
  };

  return (
    <OnboardScreenLayout>
      <text fg={ONBOARD.accent}>
        <strong>{title}</strong>
      </text>
      <text fg={ONBOARD.text}>{label}</text>
      <input
        value={value}
        onChange={(v) => {
          setError(false);
          onChange(v);
        }}
        onSubmit={(payload) =>
          handleSubmit(typeof payload === "string" ? payload : value)
        }
        placeholder={placeholder || ""}
        focused
        width={ONBOARD.inputWidth}
        textColor={ONBOARD.text}
        cursorColor={ONBOARD.accent}
        {...(password ? { password: true } : {})}
      />
      {error && <text fg={ONBOARD.error}>This field is required</text>}
      <box flexDirection="column" marginTop={1}>
        <FooterHints variant="input" hasBack={!!onBack} />
      </box>
    </OnboardScreenLayout>
  );
}

export function PersonalityScreen({
  options,
  onSelect,
  onBack,
}: {
  options: string[];
  onSelect: (index: number) => void;
  onBack?: () => void;
}) {
  return (
    <OnboardScreenLayout>
      <text fg={ONBOARD.accent}>
        <strong>Personality</strong>
      </text>
      <text fg={ONBOARD.text}>Choose a personality:</text>
      <OnboardSelect items={options} onSelect={onSelect} onBack={onBack} />
      <box flexDirection="column" marginTop={1}>
        <FooterHints variant="menu" hasBack={!!onBack} />
      </box>
    </OnboardScreenLayout>
  );
}

function maskSecret(s: string, maxStars = 20) {
  return "*".repeat(Math.min(s.length, maxStars));
}

export function ConfirmScreen({
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
  const menuItems = ["Save and continue", "Start over"];

  return (
    <OnboardScreenLayout>
      <text fg={ONBOARD.accent}>
        <strong>Confirm configuration</strong>
      </text>
      <box flexDirection="column" gap={0}>
        <text fg={ONBOARD.text}>
          <strong>Provider</strong>
        </text>
        <text fg={ONBOARD.muted}>  Base URL: {config.provider.baseUrl}</text>
        <text fg={ONBOARD.muted}>  Model: {config.provider.model}</text>
        <text fg={ONBOARD.muted}>
          {"  "}API Key: {maskSecret(config.provider.apiKey)}
        </text>
      </box>
      {config.channels?.telegram && (
        <box flexDirection="column" gap={0}>
          <text fg={ONBOARD.text}>
            <strong>Telegram</strong>
          </text>
          <text fg={ONBOARD.muted}>
            {"  "}Bot token: {maskSecret(config.channels.telegram.botToken)}
          </text>
        </box>
      )}
      <box flexDirection="column" gap={0}>
        <text fg={ONBOARD.text}>
          <strong>Personality</strong>
        </text>
        <text fg={ONBOARD.muted}>  {config.personality}</text>
      </box>
      <OnboardSelect
        items={menuItems}
        onSelect={(i) => (i === 0 ? onConfirm() : onRestart())}
        onBack={onBack}
      />
      <box flexDirection="column" marginTop={1}>
        <FooterHints variant="menu" hasBack={!!onBack} />
      </box>
    </OnboardScreenLayout>
  );
}

export function StartChatScreen({
  onYes,
  onNo,
}: {
  onYes: () => void;
  onNo: () => void;
}) {
  const items = ["Yes, start chatting", "No, exit for now"];

  return (
    <OnboardScreenLayout>
      <text fg={ONBOARD.success}>
        <strong>Configuration saved!</strong>
      </text>
      <text fg={ONBOARD.text}>Start chatting now?</text>
      <OnboardSelect
        items={items}
        onSelect={(i) => (i === 0 ? onYes() : onNo())}
      />
      <box flexDirection="column" marginTop={1}>
        <FooterHints variant="menu" hasBack={false} />
      </box>
    </OnboardScreenLayout>
  );
}
