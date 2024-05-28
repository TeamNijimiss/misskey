/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Inject } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import type Logger from '@/logger.js';
import { RoleService } from '@/core/RoleService.js';
import type { AnnouncementsRepository, UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { QueueService } from '@/core/QueueService.js';
import { WebhookService } from '@/core/WebhookService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type { DbAnnouncementJobData } from '../types.js';
import type * as Bull from 'bullmq';

@Injectable()
export class AnnounceProcessorService {
	private logger: Logger;
	constructor(
		@Inject(DI.announcementsRepository)
		private announcementsRepository: AnnouncementsRepository,

		private queueLoggerService: QueueLoggerService,
		private roleService: RoleService,
		private queueService: QueueService,
		private webhookService: WebhookService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('announce');
	}
	@bindThis
	public async process(job: Bull.Job<DbAnnouncementJobData>): Promise<void> {
		this.logger.info('Running...');

		const announce = await this.announcementsRepository.findOneByOrFail({
			id: job.data.id,
		});
		const webhooks = (await this.webhookService.getActiveWebhooks()).filter(x => x.on.includes('announceCreated'));
		for (const webhook of webhooks) {
			if (await this.roleService.isAdministrator({ id: webhook.userId, isRoot: false })) {
				this.queueService.webhookDeliver(webhook, 'announceCreated', {
					resolver: announce,
					announce: job.data,
				});
			}
		}
	}
}
