#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { onboard } from './src/commands/onboard.mjs';
import { startTUI } from './src/commands/tui.mjs';
import { Runtime } from './src/runtime/index.mjs';

process.on('SIGINT', () => {
  console.log(chalk.dim('\nExiting...'));
  process.exit(0);
});

const program = new Command();

program
  .name('openpaw')
  .description('OpenPaw — your AI companion')
  .version('0.1.0');

program.command('onboard')
  .description('Setup model, channels, and workspace')
  .action(async () => {
    try {
      await onboard();
    } catch (error) {
      if (error.name === 'ExitPromptError') {
        console.log(chalk.dim('\nCancelled.'));
        process.exit(0);
      }
      throw error;
    }
  });

program.command('tui')
  .description('Start the TUI chat interface')
  .action(async () => {
    try {
      await startTUI();
    } catch (error) {
      console.error(chalk.red('TUI error:'), error.message);
      process.exit(1);
    }
  });

program.command('start')
  .description('Start the runtime headless (Telegram, etc.)')
  .action(async () => {
    try {
      const runtime = new Runtime();
      await runtime.start();

      console.log(chalk.green('\n🐾 Runtime started. Press Ctrl+C to stop.\n'));

      // Keep process alive
      process.on('SIGINT', async () => {
        console.log(chalk.dim('\nShutting down...'));
        await runtime.stop();
        process.exit(0);
      });
    } catch (error) {
      console.error(chalk.red('Runtime error:'), error.message);
      process.exit(1);
    }
  });

program.parse();

if (process.argv.length === 2) {
  program.outputHelp();
}
