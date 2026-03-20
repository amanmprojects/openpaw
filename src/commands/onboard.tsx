import { useState, useCallback } from 'react';
import { render, Box, Text, useApp } from 'ink';
import { TextInput, PasswordInput, Select, ConfirmInput, Spinner } from '@inkjs/ui';
import chalk from 'chalk';
import { generateProviderName } from '../utils/provider-name.js';
import { mergeConfig, configExists, getConfigPath, readConfig } from '../services/config.js';
import { testApiConnection } from '../providers/openai-compatible/index.js';
import { testTelegramToken } from '../channels/telegram/test.js';
import { createWorkspace, getDefaultWorkspacePath } from '../memory/workspace.js';
import { getAvailableChannels } from '../channels/registry.js';
import type { ProviderConfig, ModelConfig, OpenPawConfig } from '../types/index.js';

const DEFAULT_MODEL_CONFIG: Partial<ModelConfig> = {
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 16000,
  maxTokens: 4096
};

interface NewProvider {
  id: string;
  config: ProviderConfig;
}

interface NewChannel {
  name: string;
  config: Record<string, unknown>;
}

type WizardStep = 'warning' | 'mode' | 'providers' | 'channels' | 'review';

interface WizardState {
  step: WizardStep;
  shouldMerge: boolean;
  newProviders: NewProvider[];
  newChannels: NewChannel[];
  ownerTelegramId: string | null;
  existingProviders: string[];
  existingChannels: string[];
  initialStep: WizardStep;
}

async function getExistingProviders(): Promise<string[]> {
  try {
    if (!(await configExists())) return [];
    const config = await readConfig();
    return Object.keys(config.models?.providers || {});
  } catch {
    return [];
  }
}

async function getExistingChannels(): Promise<string[]> {
  try {
    if (!(await configExists())) return [];
    const config = await readConfig();
    return Object.entries(config.channels || {})
      .filter(([, c]) => (c as { enabled?: boolean }).enabled)
      .map(([name]) => name);
  } catch {
    return [];
  }
}

function WarningStep({ onConfirm }: { onConfirm: () => void }) {
  const { exit } = useApp();
  
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow">Warning: OpenPaw is experimental software. Use at your own risk.</Text>
      </Box>
      <ConfirmInput
        onConfirm={onConfirm}
        onCancel={() => {
          console.log(chalk.red('\nOnboarding cancelled.'));
          exit();
        }}
      />
    </Box>
  );
}

function ModeStep({ onMerge, onReplace }: { onMerge: () => void; onReplace: () => void }) {
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Existing config found. How would you like to proceed?</Text>
      </Box>
      <Select
        options={[
          { label: 'Merge (Recommended)', value: 'merge' },
          { label: 'Replace', value: 'replace' },
        ]}
        onChange={(value) => {
          if (value === 'merge') onMerge();
          else onReplace();
        }}
      />
    </Box>
  );
}

interface ProviderFormProps {
  onAdd: (provider: NewProvider) => void;
  onSkip: () => void;
}

function ProviderForm({ onAdd, onSkip }: ProviderFormProps) {
  const [step, setStep] = useState<'type' | 'baseUrl' | 'apiKey' | 'modelId' | 'testing' | 'success' | 'error'>('type');
  const [providerType, setProviderType] = useState<string>('openai-compatible');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [modelId, setModelId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  
  const handleTest = useCallback(async () => {
    setStep('testing');
    try {
      await testApiConnection(baseUrl, apiKey, modelId);
      setStep('success');
    } catch (err) {
      const error = err as Error;
      setErrorMessage(error.message);
      setStep('error');
    }
  }, [baseUrl, apiKey, modelId]);
  
  const handleSuccess = useCallback(() => {
    const providerId = generateProviderName(baseUrl);
    const modelName = `${modelId} (Custom Provider)`;
    
    onAdd({
      id: providerId,
      config: {
        type: providerType as ProviderConfig['type'],
        baseUrl,
        apiKey,
        api: 'openai-completions',
        models: [{
          id: modelId,
          name: modelName,
          ...DEFAULT_MODEL_CONFIG
        } as ModelConfig]
      }
    });
  }, [providerType, baseUrl, apiKey, modelId, onAdd]);
  
  if (step === 'type') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Select Provider Type</Text>
        </Box>
        <Select
          options={[
            { label: 'OpenAI Compatible', value: 'openai-compatible' },
            { label: 'Skip this section', value: 'skip' },
          ]}
          onChange={(value) => {
            if (value === 'skip') onSkip();
            else {
              setProviderType(value);
              setStep('baseUrl');
            }
          }}
        />
      </Box>
    );
  }
  
  if (step === 'baseUrl') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold>Enter base URL:</Text>
        </Box>
        <TextInput
          placeholder="https://api.openai.com/v1"
          defaultValue={baseUrl}
          onSubmit={(value) => {
            try {
              new URL(value);
              setBaseUrl(value);
              setStep('apiKey');
            } catch {
              console.log(chalk.red('Please enter a valid URL'));
            }
          }}
        />
      </Box>
    );
  }
  
  if (step === 'apiKey') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold>Enter API key:</Text>
        </Box>
        <PasswordInput
          placeholder="Enter your API key..."
          onSubmit={(value) => {
            setApiKey(value);
            setStep('modelId');
          }}
        />
      </Box>
    );
  }
  
  if (step === 'modelId') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold>Enter model ID:</Text>
        </Box>
        <TextInput
          placeholder="e.g., gpt-4o, claude-3-opus"
          onSubmit={(value) => {
            if (value.trim()) {
              setModelId(value.trim());
              handleTest();
            }
          }}
        />
      </Box>
    );
  }
  
  if (step === 'testing') {
    return (
      <Box flexDirection="column" padding={1}>
        <Spinner label="Testing connection (may take up to 30s)..." />
      </Box>
    );
  }
  
  if (step === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="red">✗ {errorMessage}</Text>
        </Box>
        <ConfirmInput
          onConfirm={() => setStep('baseUrl')}
          onCancel={onSkip}
        />
        <Text dimColor>Retry? Y/n</Text>
      </Box>
    );
  }
  
  if (step === 'success') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="green">✓ Connection successful!</Text>
        </Box>
        <ConfirmInput
          onConfirm={handleSuccess}
          onCancel={onSkip}
        />
        <Text dimColor>Save this provider? Y/n</Text>
      </Box>
    );
  }
  
  return null;
}

function ProvidersSection({
  existingProviders,
  newProviders,
  onAddProvider,
  onSkip
}: {
  existingProviders: string[];
  newProviders: NewProvider[];
  onAddProvider: (provider: NewProvider) => void;
  onSkip: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  
  if (showForm) {
    return (
      <ProviderForm
        onAdd={(provider) => {
          onAddProvider(provider);
          setShowForm(false);
        }}
        onSkip={() => setShowForm(false)}
      />
    );
  }
  
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">[1/3] Configure Providers</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>─────────────────────────────</Text>
      </Box>
      
      {existingProviders.length > 0 && (
        <Box marginBottom={1} flexDirection="column">
          <Text>Found {existingProviders.length} existing provider(s):</Text>
          {existingProviders.map(p => (
            <Text key={p} dimColor>  • {p}</Text>
          ))}
        </Box>
      )}
      
      {newProviders.length > 0 && (
        <Box marginBottom={1} flexDirection="column">
          <Text color="green">New providers to add:</Text>
          {newProviders.map(p => (
            <Text key={p.id} color="green">  + {p.id}</Text>
          ))}
        </Box>
      )}
      
      <Box marginTop={1}>
        <Select
          options={[
            { label: 'Add new provider', value: 'add' },
            { label: 'Continue to channels', value: 'continue' },
          ]}
          onChange={(value) => {
            if (value === 'add') setShowForm(true);
            else onSkip();
          }}
        />
      </Box>
    </Box>
  );
}

interface ChannelFormProps {
  onAdd: (name: string, config: Record<string, unknown>, ownerTelegramId: string) => void;
  onSkip: () => void;
}

function ChannelForm({ onAdd, onSkip }: ChannelFormProps) {
  const availableChannels = getAvailableChannels();
  const [step, setStep] = useState<'select' | 'telegram_token' | 'testing' | 'success' | 'error'>('select');
  const [botToken, setBotToken] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [botInfo, setBotInfo] = useState<{ username?: string } | null>(null);
  
  const handleTokenTest = useCallback(async () => {
    setStep('testing');
    try {
      const result = await testTelegramToken(botToken);
      setBotInfo(result.botInfo);
      setStep('success');
    } catch (err) {
      const error = err as Error;
      setErrorMessage(error.message);
      setStep('error');
    }
  }, [botToken]);
  
  if (step === 'select') {
    const options = availableChannels.map(c => ({ label: c.charAt(0).toUpperCase() + c.slice(1), value: c }));
    options.push({ label: 'Skip for now', value: 'skip' });
    
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold>Select a channel to configure:</Text>
        </Box>
        <Select
          options={options}
          onChange={(value) => {
            if (value === 'skip') onSkip();
            else if (value === 'telegram') {
              setStep('telegram_token');
            } else {
              onSkip();
            }
          }}
        />
      </Box>
    );
  }
  
  if (step === 'telegram_token') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold>Enter Telegram bot token:</Text>
        </Box>
        <PasswordInput
          placeholder="Enter bot token..."
          onSubmit={(value) => {
            setBotToken(value);
            handleTokenTest();
          }}
        />
      </Box>
    );
  }
  
  if (step === 'testing') {
    return (
      <Box flexDirection="column" padding={1}>
        <Spinner label="Validating bot token..." />
      </Box>
    );
  }
  
  if (step === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="red">✗ {errorMessage}</Text>
        </Box>
        <ConfirmInput
          onConfirm={() => setStep('telegram_token')}
          onCancel={onSkip}
        />
        <Text dimColor>Retry? Y/n</Text>
      </Box>
    );
  }
  
  if (step === 'success') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="green">✓ Bot validated: @{botInfo?.username}</Text>
        </Box>
        <Box marginBottom={1}>
          <Text bold>Enter your Telegram user ID:</Text>
        </Box>
        <Text dimColor>(Get it from @userinfobot)</Text>
        <TextInput
          placeholder="Numeric ID"
          onSubmit={(value) => {
            if (/^\d+$/.test(value.trim())) {
              onAdd('telegram', { enabled: true, botToken }, value.trim());
            }
          }}
        />
      </Box>
    );
  }
  
  return null;
}

function ChannelsSection({
  existingChannels,
  newChannels,
  onAddChannel,
  onSkip
}: {
  existingChannels: string[];
  newChannels: NewChannel[];
  onAddChannel: (name: string, config: Record<string, unknown>, ownerTelegramId: string) => void;
  onSkip: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  
  if (showForm) {
    return (
      <ChannelForm
        onAdd={(name, config, ownerTelegramId) => {
          onAddChannel(name, config, ownerTelegramId);
          setShowForm(false);
        }}
        onSkip={() => setShowForm(false)}
      />
    );
  }
  
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">[2/3] Configure Channels</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>─────────────────────────────</Text>
      </Box>
      
      {existingChannels.length > 0 && (
        <Box marginBottom={1} flexDirection="column">
          <Text>Found {existingChannels.length} existing channel(s):</Text>
          {existingChannels.map(c => (
            <Text key={c} dimColor>  • {c}</Text>
          ))}
        </Box>
      )}
      
      {newChannels.length > 0 && (
        <Box marginBottom={1} flexDirection="column">
          <Text color="green">New channels to add:</Text>
          {newChannels.map(c => (
            <Text key={c.name} color="green">  + {c.name}</Text>
          ))}
        </Box>
      )}
      
      <Box marginTop={1}>
        <Select
          options={[
            { label: 'Add new channel', value: 'add' },
            { label: 'Continue to review', value: 'continue' },
          ]}
          onChange={(value) => {
            if (value === 'add') setShowForm(true);
            else onSkip();
          }}
        />
      </Box>
    </Box>
  );
}

function ReviewSection({
  newProviders,
  newChannels,
  ownerTelegramId,
  existingProviders,
  existingChannels
}: {
  newProviders: NewProvider[];
  newChannels: NewChannel[];
  ownerTelegramId: string | null;
  existingProviders: string[];
  existingChannels: string[];
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { exit } = useApp();
  
  const handleSave = useCallback(async () => {
    setSaving(true);
    
    const workspacePath = getDefaultWorkspacePath();
    
    try {
      await createWorkspace(workspacePath);
    } catch {
      // Workspace might already exist
    }
    
    const config: Partial<OpenPawConfig> = {
      currentWorkspace: workspacePath,
      models: {
        mode: 'merge' as const,
        providers: {}
      },
      channels: {}
    };
    
    for (const p of newProviders) {
      config.models!.providers[p.id] = p.config;
    }
    
    for (const c of newChannels) {
      config.channels![c.name] = c.config as OpenPawConfig['channels'][string];
    }
    
    if (ownerTelegramId) {
      config.ownerTelegramId = ownerTelegramId;
    }
    
    await mergeConfig(config);
    
    setSaving(false);
    setSaved(true);
  }, [newProviders, newChannels, ownerTelegramId]);
  
  if (saving) {
    return (
      <Box flexDirection="column" padding={1}>
        <Spinner label="Saving configuration..." />
      </Box>
    );
  }
  
  if (saved) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="green">✓ Configuration saved!</Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>Config: {getConfigPath()}</Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>Workspace: {getDefaultWorkspacePath()}</Text>
        </Box>
        <Box marginTop={1}>
          <ConfirmInput
            onConfirm={async () => {
              const { startTUI } = await import('./tui.js');
              console.log(chalk.dim('\nStarting TUI...\n'));
              await startTUI();
            }}
            onCancel={() => exit()}
          />
          <Text dimColor>Launch TUI now? Y/n</Text>
        </Box>
      </Box>
    );
  }
  
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">[3/3] Review & Save</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>─────────────────────────────</Text>
      </Box>
      
      <Box marginBottom={1} flexDirection="column">
        <Text bold>Summary:</Text>
        
        {newProviders.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text color="green">Providers to add:</Text>
            {newProviders.map(p => (
              <Text key={p.id} color="green">  + {p.id}</Text>
            ))}
          </Box>
        )}
        
        {newChannels.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text color="green">Channels to add:</Text>
            {newChannels.map(c => (
              <Text key={c.name} color="green">  + {c.name}</Text>
            ))}
          </Box>
        )}
        
        {existingProviders.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>Existing providers (unchanged):</Text>
            {existingProviders.map(p => (
              <Text key={p} dimColor>  • {p}</Text>
            ))}
          </Box>
        )}
        
        {existingChannels.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>Existing channels (unchanged):</Text>
            {existingChannels.map(c => (
              <Text key={c} dimColor>  • {c}</Text>
            ))}
          </Box>
        )}
      </Box>
      
      <Box marginTop={1}>
        <ConfirmInput
          onConfirm={handleSave}
          onCancel={() => exit()}
        />
        <Text dimColor>Save configuration? Y/n</Text>
      </Box>
    </Box>
  );
}

function OnboardingWizard({ initialState }: { initialState: WizardState }) {
  const [state, setState] = useState<WizardState>(initialState);
  
  const handleAddProvider = useCallback((provider: NewProvider) => {
    setState(s => ({
      ...s,
      newProviders: [...s.newProviders, provider]
    }));
  }, []);
  
  const handleAddChannel = useCallback((name: string, config: Record<string, unknown>, ownerTelegramId: string) => {
    setState(s => ({
      ...s,
      newChannels: [...s.newChannels, { name, config }],
      ownerTelegramId
    }));
  }, []);
  
  if (state.step === 'warning') {
    return (
      <WarningStep
        onConfirm={() => {
          setState(s => ({ ...s, step: s.initialStep }));
        }}
      />
    );
  }
  
  if (state.step === 'mode') {
    return (
      <ModeStep
        onMerge={() => setState(s => ({ ...s, shouldMerge: true, step: 'providers' }))}
        onReplace={() => setState(s => ({ ...s, shouldMerge: false, step: 'providers' }))}
      />
    );
  }
  
  if (state.step === 'providers') {
    return (
      <ProvidersSection
        existingProviders={state.existingProviders}
        newProviders={state.newProviders}
        onAddProvider={handleAddProvider}
        onSkip={() => setState(s => ({ ...s, step: 'channels' }))}
      />
    );
  }
  
  if (state.step === 'channels') {
    return (
      <ChannelsSection
        existingChannels={state.existingChannels}
        newChannels={state.newChannels}
        onAddChannel={handleAddChannel}
        onSkip={() => setState(s => ({ ...s, step: 'review' }))}
      />
    );
  }
  
  if (state.step === 'review') {
    return (
      <ReviewSection
        newProviders={state.newProviders}
        newChannels={state.newChannels}
        ownerTelegramId={state.ownerTelegramId}
        existingProviders={state.existingProviders}
        existingChannels={state.existingChannels}
      />
    );
  }
  
  return null;
}

export async function onboard(): Promise<void> {
  const exists = await configExists();
  
  let initialStep: WizardStep;
  let existingProviders: string[] = [];
  let existingChannels: string[] = [];
  
  if (!exists) {
    initialStep = 'providers';
  } else {
    [existingProviders, existingChannels] = await Promise.all([
      getExistingProviders(),
      getExistingChannels()
    ]);
    initialStep = existingProviders.length > 0 || existingChannels.length > 0 ? 'mode' : 'providers';
  }
  
  const initialState: WizardState = {
    step: 'warning',
    shouldMerge: true,
    newProviders: [],
    newChannels: [],
    ownerTelegramId: null,
    existingProviders,
    existingChannels,
    initialStep
  };
  
  const { waitUntilExit } = render(<OnboardingWizard initialState={initialState} />);
  await waitUntilExit();
}
