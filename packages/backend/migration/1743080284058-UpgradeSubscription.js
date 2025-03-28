export class UpgradeSubscription1743080284058 {
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "subscriptionPricingTable" character varying(128)`);
        await queryRunner.query(`ALTER TABLE "role" ADD "isForSubscriptions" boolean NOT NULL DEFAULT false`);
				await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "subscriptionPlanId" character varying(128)`);
				await queryRunner.query(`UPDATE user SET subscriptionPlanId = sp.stripePriceId FROM subscription_plan sp WHERE user.subscriptionPlanId = sp.id`)
			  await queryRunner.query(`DROP TABLE "subscription_plan"`);
    }

    async down(queryRunner) {
				await queryRunner.query(`CREATE TABLE "subscription_plan" ("id" character varying(32) NOT NULL, "name" character varying(128) NOT NULL, "stripePriceId" character varying(128) NOT NULL, "roleId" character varying(32) NOT NULL, "isArchived" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_01hk5ppx4h56qe96t9dehjzhye" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "subscriptionPlanId" character varying(32)`);
        await queryRunner.query(`ALTER TABLE "role" DROP COLUMN "isForSubscriptions"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "subscriptionPricingTable"`);
    }
}
