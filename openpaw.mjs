#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { onboard } from './src/commands/onboard.mjs';

process.on('SIGINT', () => {
  console.log(chalk.dim('\nExiting...'));
  process.exit(0);
});

const program = new Command();

program
  .name('openpaw')
  .description('OpenPaw CLI tool')
  .version('0.0.1');

program.command('onboard')
  .description('Onboard the user with model and channel configuration')
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

program.parse();

if (process.argv.length === 2) {
  program.outputHelp();
}
