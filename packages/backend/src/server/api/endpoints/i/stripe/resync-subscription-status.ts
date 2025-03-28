/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Stripe } from 'stripe';
import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { RolesRepository, UsersRepository } from '@/models/_.js';
import { MetaService } from '@/core/MetaService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { RoleService } from '@/core/RoleService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { ApiError } from '../../../error.js';

export const meta =	{
	tags: ['stripe'],

	requireCredential: true,
	kind: 'read:account',

	limit: {
		duration: ms('1hour'),
		max: 10,
		minInterval: ms('1sec'),
	},

	errors: {
		unavailable: {
			message: 'Subscription unavailable.',
			code: 'UNAVAILABLE',
			id: 'ca50e7c1-2589-4360-a338-e729100af0c4',
		},

		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '6a27f458-92aa-4807-bbc3-3b8223a84a7e',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.config)
		private config: Config,
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,
		@Inject(DI.rolesRepository)
		private rolesRepository: RolesRepository,
		private roleService: RoleService,
		private metaService: MetaService,
		private userEntityService: UserEntityService,
		private globalEventService: GlobalEventService,
		private loggerService: LoggerService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const logger = this.loggerService.getLogger('stripe:resync-subscription-status');
			const instance = await this.metaService.fetch(true);
			if (!(instance.enableSubscriptions)) {
				throw new ApiError(meta.errors.unavailable);
			}
			if (!(this.config.stripe && this.config.stripe.secretKey)) {
				throw new ApiError(meta.errors.unavailable);
			}

			const user = await this.usersRepository.findOneBy({ id: me.id });
			if (!user || !user.stripeSubscriptionId) {
				throw new ApiError(meta.errors.noSuchUser);
			}

			const stripe = new Stripe(this.config.stripe.secretKey);
			const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
			const subscriptionPlanRoleId = subscription.items.data[0].plan.metadata?.MISSKEY_ROLE;

			if (!subscriptionPlanRoleId) {
				throw new ApiError(meta.errors.unavailable);
			}

			if (subscription.status === 'active') { // todo ここ整理する
				if (!user.subscriptionPlanId) { // サブスクリプションプランが新規に設定された場合
					const subscriptionRoles = await this.rolesRepository.findBy({ isForSubscriptions: true });
					await this.roleService.getUserRoles(user.id).then(async (roles) => {
						for (const role of roles) {
							if (subscriptionRoles.includes(role) && role.id !== subscriptionPlanRoleId) {
								await this.roleService.unassign(user.id, role.id); // 他のサブスクリプションプランのロールが割り当てられている場合、ロールを解除する
								logger.info(`${user.id} has been unassigned the role "${role.id}" by the subscription update event.`);
							}
						}

						// ユーザーにロールが割り当てられていない場合、ロールを割り当てる
						if (!roles.some((role) => role.id === subscriptionPlanRoleId)) {
							await this.roleService.assign(user.id, subscriptionPlanRoleId);
							logger.info(`${user.id} has been assigned the role "${subscriptionPlanRoleId}" by the subscription update event.`);
						}
					});
				} else if (subscription.items.data[0].plan.id !== user.subscriptionPlanId) { // サブスクリプションプランが変更された場合
					const oldSubscriptionPlan = await stripe.prices.retrieve(user.subscriptionPlanId);
					const oldSubscriptionPlanRoleId = oldSubscriptionPlan.metadata.MISSKEY_ROLE;
					await this.roleService.getUserRoles(user.id).then(async (roles) => {
						// 旧サブスクリプションプランのロールが割り当てられている場合、ロールを解除する
						if (roles.some((role) => role.id === oldSubscriptionPlanRoleId)) {
							await this.roleService.unassign(user.id, oldSubscriptionPlanRoleId);
							logger.info(`${user.id} has been unassigned the role "${oldSubscriptionPlanRoleId}" by the subscription update event.`);
						}

						// 新しいサブスクリプションプランのロールが割り当てられていない場合、ロールを割り当てる
						if (!roles.some((role) => role.id === subscriptionPlanRoleId)) {
							await this.roleService.assign(user.id, subscriptionPlanRoleId);
							logger.info(`${user.id} has been assigned the role "${subscriptionPlanRoleId}" by the subscription update event.`);
						}
					});
				} else if (user.subscriptionStatus !== subscription.status) { // サブスクリプションステータスが変更された場合
					await this.roleService.getUserRoles(user.id).then(async (roles) => {
						// ユーザーにロールが割り当てられていない場合、ロールを割り当てる
						if (!roles.some((role) => role.id === subscriptionPlanRoleId)) {
							await this.roleService.assign(user.id, subscriptionPlanRoleId);
							logger.info(`${user.id} has been assigned the role "${subscriptionPlanRoleId}" by the subscription update event.`);
						}
					});
				}
			}

			await this.usersRepository.update({ id: me.id }, {
				subscriptionStatus: subscription.status,
				subscriptionPlanId: subscription.items.data[0].plan.id,
			});

			// Publish meUpdated event
			this.globalEventService.publishMainStream(me.id, 'meUpdated', await this.userEntityService.pack(me.id, { id: me.id }, {
				schema: 'MeDetailed',
				includeSecrets: true,
			}));
		});
	}
}
