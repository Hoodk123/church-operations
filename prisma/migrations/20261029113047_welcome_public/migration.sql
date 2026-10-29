-- AlterTable
ALTER TABLE "people" ADD COLUMN     "church_group" TEXT,
ADD COLUMN     "first_visit_date" DATE,
ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "welcome_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "person_id" UUID,
    "qr_source" TEXT,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "preferred_contact" TEXT NOT NULL,
    "first_time" BOOLEAN NOT NULL,
    "fellowship_duration" TEXT,
    "found_via" TEXT,
    "invited_by_text" TEXT,
    "family_status" TEXT,
    "adults_count" INTEGER,
    "children_count" INTEGER,
    "wants_family_registration" BOOLEAN NOT NULL DEFAULT false,
    "class_readiness" TEXT,
    "feedback" TEXT,
    "consent" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_in_at" TIMESTAMPTZ(6),
    "reviewed_by" UUID,

    CONSTRAINT "welcome_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "welcome_class_interest" (
    "submission_id" UUID NOT NULL,
    "class_type_id" TEXT NOT NULL,

    CONSTRAINT "welcome_class_interest_pkey" PRIMARY KEY ("submission_id","class_type_id")
);

-- CreateIndex
CREATE INDEX "welcome_submissions_status_idx" ON "welcome_submissions"("status", "submitted_at" DESC);

-- CreateIndex
CREATE INDEX "welcome_submissions_phone_idx" ON "welcome_submissions"("phone");

-- AddForeignKey
ALTER TABLE "welcome_submissions" ADD CONSTRAINT "welcome_submissions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "welcome_class_interest" ADD CONSTRAINT "welcome_class_interest_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "welcome_submissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
