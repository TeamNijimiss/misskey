/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { UsersRepository } from '@/models/_.js';
import { RoleService } from '@/core/RoleService.js';
import { DeleteAccountService } from '@/core/DeleteAccountService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:account',

	errors: {
		userNotFound: {
			message: 'User not found.',
			code: 'USER_NOT_FOUND',
			id: '6c45276a-525e-46b0-892f-17a5036258bf',
		},

		cannotDeleteModerator: {
			message: 'Cannot delete a moderator.',
			code: 'CANNOT_DELETE_MODERATOR',
			id: 'd195c621-f21a-4c2f-a634-484c2a616311',
		},

		subscriptionIsActive: {
			message: 'If Subscription is active, cannot move account.',
			code: 'SUBSCRIPTION_IS_ACTIVE',
			id: 'f5c8b3b4-9e4d-4b7f-9f4d-9f1f0a7a3d0a',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		soft: { type: 'boolean', default: true, description: 'Since deletion by an administrator is a moderation action, the default is to soft delete.' },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private roleService: RoleService,
		private deleteAccountService: DeleteAccountService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const user = await this.usersRepository.findOneBy({ id: ps.userId });

			if (user == null) throw new ApiError(meta.errors.userNotFound);
			if (await this.roleService.isModerator(user)) throw new ApiError(meta.errors.cannotDeleteModerator);

			if (!(user.subscriptionStatus === 'unpaid' || user.subscriptionStatus === 'canceled' || user.subscriptionStatus === 'none')) {
				throw new ApiError(meta.errors.subscriptionIsActive);
			}

			await this.deleteAccountService.deleteAccount(user, ps.soft, me);
		});
	}
}
