import { confirm, input, password, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { generateProviderName } from '../utils/provider-name.mjs';
import { mergeConfig, writeConfig, configExists, getConfigPath } from '../services/config.mjs';
import { testApiConnection } from '../providers/test.mjs';
import { testTelegramToken } from '../channels/telegram/test.mjs';
import { createWorkspace, getDefaultWorkspacePath } from '../memory/workspace.mjs';

const DEFAULT_MODEL_CONFIG = {
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 16000,
  maxTokens: 4096
};

async function promptModelSetup() {
  console.log(chalk.bold.cyan('\n📦 Model Setup\n'));

  while (true) {
    const baseUrl = await input({
      message: 'Enter base URL:',
      default: 'https://api.openai.com/v1',
      validate: (v) => {
        try {
          new URL(v);
          return true;
        } catch {
          return 'Please enter a valid URL';
        }
      }
    });

    const apiKey = await password({
      message: 'Enter API key:',
      mask: '*'
    });

    const modelId = await input({
      message: 'Enter model ID:',
      validate: (v) => v.trim().length > 0 || 'Model ID is required'
    });

    console.log(chalk.dim('\n  Testing connection...'));

    try {
      await testApiConnection(baseUrl, apiKey, modelId);
      console.log(chalk.green('  ✓ Connection successful!\n'));

      const providerId = generateProviderName(baseUrl);

      return {
        providerId,
        baseUrl,
        apiKey,
        modelId
      };
    } catch (error) {
      console.log(chalk.red(`  ✗ ${error.message}\n`));

      const retry = await confirm({
        message: 'Try again?',
        default: true
      });

      if (!retry) {
        console.log(chalk.red('Model setup cancelled.'));
        return null;
      }
    }
  }
}

async function promptChannelSetup() {
  console.log(chalk.bold.cyan('\n🔗 Channel Setup\n'));

  const channels = await select({
    message: 'Select channel to connect:',
    choices: [
      { name: 'Telegram', value: 'telegram', description: 'Connect a Telegram bot' },
      { name: 'Skip for now', value: 'skip', description: 'Configure channels later' }
    ]
  });

  if (channels === 'skip') {
    return null;
  }

  while (true) {
    const botToken = await password({
      message: 'Enter Telegram bot token:',
      mask: '*'
    });

    console.log(chalk.dim('\n  Validating bot token...'));

    try {
      const result = await testTelegramToken(botToken);
      console.log(chalk.green(`  ✓ Bot validated: @${result.botInfo.username}\n`));

      const ownerTelegramId = await input({
        message: 'Enter your Telegram user ID (get it from @userinfobot):',
        validate: (v) => /^\d+$/.test(v.trim()) || 'Must be a numeric ID'
      });

      return { botToken, botInfo: result.botInfo, ownerTelegramId: ownerTelegramId.trim() };
    } catch (error) {
      console.log(chalk.red(`  ✗ ${error.message}\n`));

      const retry = await confirm({
        message: 'Try again?',
        default: true
      });

      if (!retry) {
        return null;
      }
    }
  }
}

export async function onboard() {
  console.log(chalk.bold(chalk.yellow('Warning: OpenPaw is experimental software. Use at your own risk.')));

  const proceed = await confirm({
    message: 'Proceed?',
    default: true
  });

  if (!proceed) {
    console.log(chalk.red('Onboarding cancelled.'));
    process.exit(0);
  }

  const hasExistingConfig = await configExists();
  let shouldMerge = true;

  if (hasExistingConfig) {
    const configMode = await select({
      message: 'Existing config found. How would you like to proceed?',
      choices: [
        { name: 'Merge (Recommended)', value: 'merge', description: 'Add new providers/channels to existing config' },
        { name: 'Replace', value: 'replace', description: 'Overwrite existing config completely' }
      ]
    });
    shouldMerge = configMode === 'merge';
  }

  const modelConfig = await promptModelSetup();
  if (!modelConfig) {
    process.exit(1);
  }

  const channelConfig = await promptChannelSetup();

  const providerName = `${modelConfig.modelId} (Custom Provider)`;

  const config = {
    models: {
      mode: 'merge',
      providers: {
        [modelConfig.providerId]: {
          baseUrl: modelConfig.baseUrl,
          apiKey: modelConfig.apiKey,
          api: 'openai-completions',
          models: [{
            id: modelConfig.modelId,
            name: providerName,
            ...DEFAULT_MODEL_CONFIG
          }]
        }
      }
    }
  };

  if (channelConfig) {
    config.channels = {
      telegram: {
        enabled: true,
        botToken: channelConfig.botToken
      }
    };
    config.ownerTelegramId = channelConfig.ownerTelegramId;
  }

  // Create workspace
  console.log(chalk.bold.cyan('\n📁 Workspace Setup\n'));
  const workspacePath = getDefaultWorkspacePath();
  config.currentWorkspace = workspacePath;

  try {
    await createWorkspace(workspacePath);
    console.log(chalk.green(`  ✓ Workspace created at ${workspacePath}\n`));
  } catch (err) {
    console.log(chalk.yellow(`  ⚠ Workspace already exists or could not be created: ${err.message}\n`));
  }

  if (shouldMerge) {
    await mergeConfig(config);
  } else {
    await writeConfig(config);
  }

  console.log(chalk.bold.green('\n✓ Onboarding complete!'));
  console.log(chalk.dim(`  Config saved to: ${getConfigPath()}`));
  console.log(chalk.dim(`  Workspace at: ${workspacePath}\n`));
}
