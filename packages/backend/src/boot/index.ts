/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Misskey Entry Point!
 */

import cluster from 'node:cluster';
import { EventEmitter } from 'node:events';
import chalk from 'chalk';
import Xev from 'xev';
import Logger from '@/logger.js';
import { envOption } from '../env.js';
import { masterMain } from './master.js';
import { workerMain } from './worker.js';

import 'reflect-metadata';

process.title = `Misskey (${cluster.isPrimary ? 'master' : 'worker'})`;

Error.stackTraceLimit = Infinity;
EventEmitter.defaultMaxListeners = 128;

const logger = new Logger('core', 'cyan');
const clusterLogger = logger.createSubLogger('cluster', 'orange', false);
const ev = new Xev();

//#region Events

if (cluster.isPrimary && !envOption.disableClustering) {
	// Listen new workers
	cluster.on('fork', worker => {
		clusterLogger.debug(`Process forked: [${worker.id}]`);
	});

	// Listen online workers
	cluster.on('online', worker => {
		clusterLogger.debug(`Process is now online: [${worker.id}]`);
	});

	// Listen for dying workers
	cluster.on('exit', (worker, code, signal?) => {
		// Replace the dead worker,
		// we're not sentimental
		if (signal) {
			switch (signal) {
				case 'SIGINT':
				case 'SIGTERM':
					console.log(chalk.green(`[${worker.id}] exited by signal: ${signal}`));
					break;
				default:
					console.error(chalk.red(`[${worker.id}] killed by signal: ${signal}`));
					cluster.fork();
					break;
			}
		} else if (code !== 0) {
			console.error(chalk.red(`[${worker.id}] exited with error code: ${code}`));
		} else {
			console.log(chalk.green(`[${worker.id}] exited normally`));
		}
	});
}

// Display detail of unhandled promise rejection
if (!envOption.quiet) {
	process.on('unhandledRejection', console.dir);
}

// Display detail of uncaught exception
process.on('uncaughtException', err => {
	try {
		logger.error(err);
		console.trace(err);
	} catch { }
});

// Dying away...
process.on('exit', code => {
	logger.info(`The process is going to exit with code ${code}`);
});

//#endregion

if (cluster.isPrimary || envOption.disableClustering) {
	await masterMain();

	if (cluster.isPrimary) {
		ev.mount();
	}
}

if (cluster.isWorker || envOption.disableClustering) {
	await workerMain();
}

// ユニットテスト時にMisskeyが子プロセスで起動された時のため
// それ以外のときは process.send は使えないので弾く
if (process.send) {
	process.send('ok');
}
