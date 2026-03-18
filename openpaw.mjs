#!/usr/bin/env node
import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';

const program = new Command();

program
  .name('openpaw')
  .description('OpenPaw CLI tool')
  .version('0.0.1');

program.command('onboard').description('Onboard the user').action(onboard);

program.parse();

if (process.argv.length === 2) {
  program.outputHelp();
}

async function onboard() {
  console.log(chalk.bold(chalk.yellow('Warning: OpenPaw is experimental software. Use at your own risk.')));
  
  const proceed = await confirm({
    message: 'Proceed?',
    default: true,
  });

  if (!proceed) {
    console.log(chalk.red('Onboarding cancelled.'));
    process.exit(0);
  }

  console.log(chalk.green('Welcome to OpenPaw!'));
}