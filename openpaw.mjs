#!/usr/bin/env node
import { Command } from 'commander';
import { onboard } from './src/commands/onboard.mjs';

const program = new Command();

program
  .name('openpaw')
  .description('OpenPaw CLI tool')
  .version('0.0.1');

program.command('onboard')
  .description('Onboard the user with model and channel configuration')
  .action(onboard);

program.parse();

if (process.argv.length === 2) {
  program.outputHelp();
}
