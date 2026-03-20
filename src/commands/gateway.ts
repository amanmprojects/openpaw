import chalk from 'chalk';
import {
  isGatewayRunning,
  startGatewayDaemon,
  stopGateway,
  restartGateway,
  getGatewayUptime,
  formatUptime,
  getLogFilePath,
} from '../services/gateway-process.js';

export async function handleGatewayStart(): Promise<void> {
  const { running, pid: existingPid } = await isGatewayRunning();
  
  if (running) {
    console.log(chalk.yellow(`Gateway is already running with PID ${existingPid}`));
    console.log(chalk.dim(`Use 'openpaw gateway status' for more info`));
    return;
  }

  console.log(chalk.dim('Starting gateway daemon...'));
  
  const result = await startGatewayDaemon();
  
  if (result.success) {
    console.log(chalk.green(`✓ Gateway started with PID ${result.pid}`));
    console.log(chalk.dim(`Logs: ${getLogFilePath()}`));
  } else {
    console.log(chalk.red(`✗ Failed to start gateway: ${result.error}`));
    process.exit(1);
  }
}

export async function handleGatewayStop(): Promise<void> {
  const { running, pid } = await isGatewayRunning();
  
  if (!running) {
    console.log(chalk.dim('Gateway is not running'));
    return;
  }

  console.log(chalk.dim(`Stopping gateway (PID ${pid})...`));
  
  const result = await stopGateway();
  
  if (result.success) {
    console.log(chalk.green('✓ Gateway stopped'));
  } else {
    console.log(chalk.red(`✗ Failed to stop gateway: ${result.error}`));
    process.exit(1);
  }
}

export async function handleGatewayRestart(): Promise<void> {
  const { running } = await isGatewayRunning();
  
  if (running) {
    console.log(chalk.dim('Restarting gateway...'));
  } else {
    console.log(chalk.dim('Gateway is not running, starting...'));
  }
  
  const result = await restartGateway();
  
  if (result.success) {
    console.log(chalk.green(`✓ Gateway restarted with PID ${result.pid}`));
    console.log(chalk.dim(`Logs: ${getLogFilePath()}`));
  } else {
    console.log(chalk.red(`✗ Failed to restart gateway: ${result.error}`));
    process.exit(1);
  }
}

export async function handleGatewayStatus(): Promise<void> {
  const { running, pid } = await isGatewayRunning();
  
  if (running && pid) {
    const uptime = await getGatewayUptime();
    const uptimeStr = uptime ? formatUptime(uptime) : 'unknown';
    
    console.log(chalk.green('Gateway Status: ') + chalk.bold('running'));
    console.log(chalk.dim('PID: ') + pid);
    console.log(chalk.dim('Uptime: ') + uptimeStr);
    console.log(chalk.dim('Log: ') + getLogFilePath());
  } else {
    console.log(chalk.yellow('Gateway Status: ') + chalk.bold('stopped'));
    console.log(chalk.dim("Use 'openpaw gateway start' to start the gateway"));
  }
}
