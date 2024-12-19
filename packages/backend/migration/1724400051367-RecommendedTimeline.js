/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RecommendedTimeline1724400051367 {
    name = 'RecommendedTimeline1724400051367'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "recommendedChannels" character varying(1024) array NOT NULL DEFAULT '{}'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "recommendedChannels"`);
    }
}
