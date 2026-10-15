#!/usr/bin/env node
const { program } = require('commander');
const { runLivePipeline } = require('./src/pipeline/live');
const { log } = require('./src/logging/logger');
const path = require('path');
const { spawn } = require('child_process');

program
  .version('1.0.0')
  .description('Job Application Automation Agent');

program
  .command('live')
  .description('Run the live job discovery and application pipeline')
  .option('-l, --limit <number>', 'Maximum jobs to process', 25)
  .option('--no-llm', 'Disable LLM analysis')
  .option('--prepare-apply', 'Prepare applications in browser')
  .action(async (options) => {
    try {
      await runLivePipeline({
        limit: Number(options.limit),
        useLlm: options.llm,
        prepareApply: options.prepareApply
      });
    } catch (error) {
      console.error('Pipeline failed:', error);
      process.exit(1);
    }
  });

program
  .command('scheduler')
  .description('Start the 6-hour interval scheduler')
  .action(() => {
    require('./src/scheduler');
  });

program
  .command('login <platform>')
  .description('Log in to a platform (linkedin, wellfound, instahyre)')
  .action((platform) => {
    const script = path.join(__dirname, 'scripts', `login_${platform.toLowerCase()}.js`);
    spawn('node', [script], { stdio: 'inherit' });
  });

program
  .command('dashboard')
  .description('Start the monitoring dashboard')
  .action(() => {
    spawn('npm', ['run', 'dashboard'], { stdio: 'inherit', shell: true });
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
