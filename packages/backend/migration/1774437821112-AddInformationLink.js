/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 * @typedef {import('typeorm').QueryRunner} QueryRunner
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
export class AddInformationLink1774437821112 {
    name = 'AddInformationLink1774437821112'

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "postingGuidelinesUrl" character varying(1024)`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "statusPageUrl" character varying(1024)`);
     }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "statusPageUrl"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "postingGuidelinesUrl"`);
    }
}
