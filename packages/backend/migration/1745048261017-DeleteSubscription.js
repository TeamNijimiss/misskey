export class DeleteSubscription1745048261017 {
    name = 'DeleteSubscription1745048261017'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "subscriptionPlanId"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "stripeSubscriptionId"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "subscriptionStatus"`);
        await queryRunner.query(`DROP TYPE "public"."user_subscriptionstatus_enum"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "enableSubscriptions"`);
        await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "stripeCustomerId"`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" ADD "stripeCustomerId" character varying(128)`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "enableSubscriptions" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`CREATE TYPE "public"."user_subscriptionstatus_enum" AS ENUM('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'paused', 'canceled', 'unpaid', 'none')`);
        await queryRunner.query(`ALTER TABLE "user" ADD "subscriptionStatus" "public"."user_subscriptionstatus_enum" NOT NULL DEFAULT 'none'`);
        await queryRunner.query(`ALTER TABLE "user" ADD "stripeSubscriptionId" character varying(128)`);
        await queryRunner.query(`ALTER TABLE "user" ADD "subscriptionPlanId" character varying(32)`);
    }
}
