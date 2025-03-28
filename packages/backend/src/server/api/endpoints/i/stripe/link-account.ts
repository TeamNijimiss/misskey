/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Stripe } from 'stripe';
import { Inject, Injectable } from '@nestjs/common';
import type { UsersRepository, UserProfilesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { MetaService } from '@/core/MetaService.js';
import type { Config } from '@/config.js';
import { LoggerService } from '@/core/LoggerService.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['stripe'],

	requireCredential: true,
	kind: 'write:account',

	limit: {
		duration: ms('1hour'),
		max: 10,
		minInterval: ms('1sec'),
	},

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '6a27f458-92aa-4807-bbc3-3b8223a84a7e',
		},

		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: 'fe8d7103-0ea8-4ec3-814d-f8b401dc69e9',
		},

		requiredEmail: {
			message: 'Email is required.',
			code: 'REQUIRED_EMAIL',
			id: 'f1b0a9f3-9f8a-4e8c-9b4d-0d2c1b7a9c0b',
		},

		statusInconsistency: {
			message: 'The information registered in the payment service and the information stored on the server do not match.',
			code: 'STATUS_INCONSENT',
			id: 'f1d204e7-276a-4277-9e7b-14f5e038c2d8',
		},

		unavailable: {
			message: 'Subscription unavailable.',
			code: 'UNAVAILABLE',
			id: 'ca50e7c1-2589-4360-a338-e729100af0c4',
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
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,
		private metaService: MetaService,
		private loggerService: LoggerService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const logger = this.loggerService.getLogger('stripe:link-account');
			const instance = await this.metaService.fetch(true);
			if (!(instance.enableSubscriptions)) {
				throw new ApiError(meta.errors.unavailable);
			}
			if (!(this.config.stripe && this.config.stripe.secretKey)) {
				throw new ApiError(meta.errors.unavailable);
			}

			const user = await this.usersRepository.findOneByOrFail({ id: me.id });
			const userProfile = await this.userProfilesRepository.findOneBy({ userId: me.id });
			if (!user || !userProfile) {
				throw new ApiError(meta.errors.noSuchUser);
			}
			if (!userProfile.email) {
				throw new ApiError(meta.errors.requiredEmail);
			}

			const stripe = new Stripe(this.config.stripe.secretKey);
			if (!userProfile.stripeCustomerId) {
				const searchCustomer = await stripe.customers.search({ query: `email:"${userProfile.email}"` });
				if (searchCustomer.data.length !== 0) {
					logger.info(`User with email ${userProfile.email} is already registered in Stripe but not recorded in UserProfile.`);
					throw new ApiError(meta.errors.statusInconsistency);
				}

				const makeCustomer = await stripe.customers.create({
					email: userProfile.email,
					metadata: {
						MISSKEY_USER: user.id,
					},
				}, {
					idempotencyKey: user.id + '_link-account',
				});
				await this.userProfilesRepository.update({ userId: user.id }, {
					stripeCustomerId: makeCustomer.id,
				});
				await this.userProfilesRepository.findOneByOrFail({ userId: user.id });
				logger.info(`New Stripe customer created with ID ${makeCustomer.id} and associated with user ${user.id}`);
			}
		});
	}
}
