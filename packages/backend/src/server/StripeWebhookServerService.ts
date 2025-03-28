import { Inject, Injectable } from '@nestjs/common';
import { Stripe } from 'stripe';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { RolesRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { RoleService } from '@/core/RoleService.js';
import { MetaService } from '@/core/MetaService.js';
import { bindThis } from '@/decorators.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

@Injectable()
export class StripeWebhookServerService {
	private logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,
		@Inject(DI.rolesRepository)
		private rolesRepository: RolesRepository,
		private roleService: RoleService,
		private metaService: MetaService,
		private userEntityService: UserEntityService,
		private globalEventService: GlobalEventService,
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('subscription:webhook');
	}

	@bindThis
	public createServer(fastify: FastifyInstance, options: FastifyPluginOptions, done: (err?: Error) => void) {
		fastify.addContentTypeParser(
			'application/json',
			{ parseAs: 'buffer' },
			(_req, body, done) => {
				try {
					done(null, body);
				} catch (err: any) {
					err.statusCode = 400;
					return done(err);
				}
			},
		);

		fastify.post('/webhook', { config: { rawBody: true }, bodyLimit: 1024 * 64 }, async (request, reply) => {
			/* サブスクリプションの機能が無効にされていてもWebhookは処理するようにする。
			const instance = await this.metaService.fetch(true);
			if (!(instance.enableSubscriptions)) {
				return reply.code(503);
			}
			*/
			if (!(this.config.stripe && this.config.stripe.secretKey && this.config.stripe.webhookSecret)) {
				this.logger.error('The Stripe webhook configuration is not set correctly.');
				return reply.code(503);
			}

			const body = request.rawBody;
			if (!body) {
				this.logger.error('Request body from Stripe webhook is empty.');
				return reply.code(400);
			}

			// Retrieve the event by verifying the signature using the raw body and secret.
			const signature = request.headers['stripe-signature'];
			if (!signature) { // Check if signature exists.
				this.logger.error('Webhook does not contain a signature.');
				return reply.code(400);
			}

			const stripe = new Stripe(this.config.stripe.secretKey);
			let event;
			try {
				event = stripe.webhooks.constructEvent(body, signature, this.config.stripe.webhookSecret);
			} catch (err) {
				this.logger.error('Webhook signature verification or event parsing failed.', { error: err });
				return reply.code(400);
			}

			// イベント処理前の共通処理（例：ユーザープロファイルの取得と初期応答の設定）
			const preprocessEvent = async (eventData: any) => {
				const customer = eventData.customer as string;
				const userProfile = await this.userProfilesRepository.findOneBy({ stripeCustomerId: customer });

				if (!userProfile) {
					throw new Error(`CustomerId: "${customer}" has no user profile found.`);
				}

				return { userProfile, subscription: eventData };
			};

			const { userProfile, subscription } = await preprocessEvent(event.data.object);
			reply.code(204); // Stripeへの応答を設定

			// Handle the event.
			switch (event.type) {
				/*
				case 'customer.created': {
					const customerId = event.data.object.id;
					const customerEmail = event.data.object.email;
					const userId = event.data.object.metadata.MISSKEY_USER;

					if (!customerEmail && !userId) {
						throw new Error(`CustomerId: "${customerId}" has no email or user ID found.`);
					}

					let userProfile;
					if (!userId) {
						userProfile = await this.userProfilesRepository.findOneBy({ email: customerEmail });
					} else {
						userProfile = await this.userProfilesRepository.findOneBy({ userId });
					}

					if (!userProfile) {
						throw new Error(`CustomerId: "${customerId}" has no user profile found.`);
					}

					await this.userProfilesRepository.update({ userId: userProfile.userId }, {
						stripeCustomerId: customerId,
					});
					this.logger.info(`CustomerId: "${customerId}" has been linked to user ID ${userProfile.userId}.`);

					return;
				}
				*/

				case 'customer.subscription.created': { // サブスクリプションが新規に作成された場合
					const subscriptionPlanRoleId = subscription.items.data[0].plan.metadata.MISSKEY_ROLE;
					const user = await this.usersRepository.findOneByOrFail({ id: userProfile.userId });

					if (user.stripeSubscriptionId != null) {
						this.logger.info(`Subscription already exists for user ID ${user.id}. No processing is needed.`);
						return; // 既にサブスクリプションが存在する場合は何もしない
					}

					if (subscription.status === 'active') {
						await this.roleService.getUserRoles(userProfile.userId).then(async (roles) => {
							// ユーザーにロールが割り当てられていない場合、ロールを割り当てる
							if (!roles.some((role) => role.id === subscriptionPlanRoleId)) {
								await this.roleService.assign(userProfile.userId, subscriptionPlanRoleId);
								this.logger.info(`${userProfile.userId} has been assigned the role "${subscriptionPlanRoleId}" by the subscription creation event.`);
							}
						});
					}

					await this.usersRepository.update({ id: userProfile.userId }, {
						subscriptionStatus: subscription.status,
						subscriptionPlanId: subscription.items.data[0].plan.id,
						stripeSubscriptionId: subscription.id,
					});

					// Publish meUpdated event
					this.globalEventService.publishMainStream(userProfile.userId, 'meUpdated', await this.userEntityService.pack(userProfile.userId, { id: userProfile.userId }, {
						schema: 'MeDetailed',
						includeSecrets: true,
					}));

					return;
				}

				case 'customer.subscription.updated': { // Update the subscription.
					const previousData = event.data.previous_attributes;
					const user = await this.usersRepository.findOneByOrFail({ id: userProfile.userId });
					const subscriptionPlanRoleId = subscription.items.data[0].plan.metadata.MISSKEY_ROLE;

					if (user.stripeSubscriptionId && user.stripeSubscriptionId !== subscription.id) { // 既存のサブスクリプションIDとイベントのサブスクリプションIDが一致しない場合は何もしない
						return;
					}

					if (subscription.status === 'active') { // todo ここ整理する
						if (!user.subscriptionPlanId) { // サブスクリプションプランが新規に設定された場合
							const subscriptionRoles = await this.rolesRepository.findBy({ isForSubscriptions: true });
							await this.roleService.getUserRoles(user.id).then(async (roles) => {
								for (const role of roles) {
									if (subscriptionRoles.includes(role) && role.id !== subscriptionPlanRoleId) {
										await this.roleService.unassign(user.id, role.id); // 他のサブスクリプションプランのロールが割り当てられている場合、ロールを解除する
										this.logger.info(`${user.id} has been unassigned the role "${role.id}" by the subscription update event.`);
									}
								}

								// ユーザーにロールが割り当てられていない場合、ロールを割り当てる
								if (!roles.some((role) => role.id === subscriptionPlanRoleId)) {
									await this.roleService.assign(user.id, subscriptionPlanRoleId);
									this.logger.info(`${user.id} has been assigned the role "${subscriptionPlanRoleId}" by the subscription update event.`);
								}
							});
						} else if (subscription.items.data[0].plan.id !== user.subscriptionPlanId) { // サブスクリプションプランが変更された場合
							const oldSubscriptionPlan = await stripe.prices.retrieve(user.subscriptionPlanId);
							const oldSubscriptionPlanRoleId = oldSubscriptionPlan.metadata.MISSKEY_ROLE;
							await this.roleService.getUserRoles(user.id).then(async (roles) => {
								// 旧サブスクリプションプランのロールが割り当てられている場合、ロールを解除する
								if (roles.some((role) => role.id === oldSubscriptionPlanRoleId)) {
									await this.roleService.unassign(user.id, oldSubscriptionPlanRoleId);
									this.logger.info(`${user.id} has been unassigned the role "${oldSubscriptionPlanRoleId}" by the subscription update event.`);
								}

								// 新しいサブスクリプションプランのロールが割り当てられていない場合、ロールを割り当てる
								if (!roles.some((role) => role.id === subscriptionPlanRoleId)) {
									await this.roleService.assign(user.id, subscriptionPlanRoleId);
									this.logger.info(`${user.id} has been assigned the role "${subscriptionPlanRoleId}" by the subscription update event.`);
								}
							});
						} else if (previousData && previousData.status) { // サブスクリプションステータスが変更された場合
							await this.roleService.getUserRoles(user.id).then(async (roles) => {
								// ユーザーにロールが割り当てられていない場合、ロールを割り当てる
								if (!roles.some((role) => role.id === subscriptionPlanRoleId)) {
									await this.roleService.assign(user.id, subscriptionPlanRoleId);
									this.logger.info(`${user.id} has been assigned the role "${subscriptionPlanRoleId}" by the subscription update event.`);
								}
							});
						}
					} else if (subscription.cancel_at_period_end) {
						return; // キャンセルされた場合は期限切れのタイミングでcustomer.subscription.deletedイベントが発生するので、ここでは何もしない
					}

					// ユーザーのサブスクリプションステータスとサブスクリプションプランを更新する
					await this.usersRepository.update({ id: user.id }, {
						subscriptionStatus: subscription.status,
						subscriptionPlanId: subscription.status !== 'incomplete_expired' ? subscription.items.data[0].plan.id : null,
						stripeSubscriptionId: subscription.status !== 'incomplete_expired' ? user.stripeSubscriptionId ? undefined : subscription.id : null,
					});

					// Publish meUpdated event
					this.globalEventService.publishMainStream(user.id, 'meUpdated', await this.userEntityService.pack(user.id, user, {
						schema: 'MeDetailed',
						includeSecrets: true,
					}));

					return;
				}

				case 'customer.subscription.deleted': { // Delete the subscription.
					const subscriptionPlanRoleId = subscription.items.data[0].plan.metadata.MISSKEY_ROLE;
					const user = await this.usersRepository.findOneByOrFail({ id: userProfile.userId });

					if (user.stripeSubscriptionId && user.stripeSubscriptionId !== subscription.id) { // 既存のサブスクリプションIDとイベントのサブスクリプションIDが一致しない場合は何もしない
						return;
					}

					// サブスクリプションプランのロールが割り当てられている場合、ロールを解除する
					await this.roleService.getUserRoles(userProfile.userId).then(async (roles) => {
						if (roles.some((role) => role.id === subscriptionPlanRoleId)) {
							await this.roleService.unassign(userProfile.userId, subscriptionPlanRoleId);
							this.logger.info(`${userProfile.userId} has been unassigned the role "${subscriptionPlanRoleId}" by the subscription deletion event.`);
						}
					});

					await this.usersRepository.update({ id: userProfile.userId }, {
						subscriptionStatus: subscription.status,
						subscriptionPlanId: null,
						stripeSubscriptionId: null,
					});

					// Publish meUpdated event
					this.globalEventService.publishMainStream(userProfile.userId, 'meUpdated', await this.userEntityService.pack(userProfile.userId, { id: userProfile.userId }, {
						schema: 'MeDetailed',
						includeSecrets: true,
					}));

					return;
				}

				default:
					// Unhandled event type.
					this.logger.warn(`Unhandled event type: ${event.type}`);
					return reply.code(400);
			}
		});

		done();
	}
}
