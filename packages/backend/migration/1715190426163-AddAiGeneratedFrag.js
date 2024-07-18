export class AddAiGeneratedFrag1715190426163 {
    name = 'AddAiGeneratedFrag1715190426163'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "drive_file" ADD "isAiGenerated" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "drive_file"."isAiGenerated" IS 'Whether the DriveFile is AI generated.'`);
        await queryRunner.query(`CREATE INDEX "IDX_4a0dd497320e8970f05745cffc" ON "drive_file" ("isAiGenerated") `);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_4a0dd497320e8970f05745cffc"`);
        await queryRunner.query(`COMMENT ON COLUMN "drive_file"."isAiGenerated" IS 'Whether the DriveFile is AI generated.'`);
        await queryRunner.query(`ALTER TABLE "drive_file" DROP COLUMN "isAiGenerated"`);
    }
}
