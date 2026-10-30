-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('Male', 'Female');

-- CreateEnum
CREATE TYPE "AgeGroup" AS ENUM ('Child', 'Youth', 'Adult', 'Elderly');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('Visitor', 'New Convert', 'M1 Class', 'Member', 'Returning', 'Counseling');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('Not Started', 'Contacted', 'Met', 'Ongoing', 'Completed');

-- CreateEnum
CREATE TYPE "M1Status" AS ENUM ('Not Started', 'In Progress', 'Completed');

-- CreateEnum
CREATE TYPE "BaptismStatus" AS ENUM ('Not yet', 'Scheduled', 'Baptized');

-- CreateEnum
CREATE TYPE "ContactPreference" AS ENUM ('WhatsApp', 'Email', 'SMS', 'Call', 'Both');

-- CreateEnum
CREATE TYPE "ContactMethod" AS ENUM ('Call', 'WhatsApp', 'SMS', 'Visit', 'Other');

-- CreateEnum
CREATE TYPE "ContactOutcome" AS ENUM ('Reached', 'No answer', 'Scheduled visit', 'Needs pastor', 'Wrong number');

-- CreateEnum
CREATE TYPE "TemplatePurpose" AS ENUM ('follow_up', 'm1_reminder', 'm1_catch_up', 'm1_materials', 'm1_certificate', 'baptism_reminder');

-- CreateEnum
CREATE TYPE "ClassStatus" AS ENUM ('Open', 'Closed');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('Enrolled', 'Completed', 'Dropped');

-- CreateEnum
CREATE TYPE "AttendanceMark" AS ENUM ('Present', 'Absent', 'Excused');

-- CreateEnum
CREATE TYPE "MessagePurpose" AS ENUM ('reminder', 'catch_up', 'materials', 'certificate', 'baptism', 'other');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('WhatsApp', 'Email', 'SMS', 'Call');

-- CreateEnum
CREATE TYPE "AbsenceReason" AS ENUM ('Work', 'Sick', 'Transport', 'Family', 'Forgot', 'Evening', 'Other');

-- CreateEnum
CREATE TYPE "ReplySource" AS ENUM ('Link', 'Volunteer');

-- CreateEnum
CREATE TYPE "BaptismEventStatus" AS ENUM ('Scheduled', 'Done', 'Cancelled');

-- CreateEnum
CREATE TYPE "BaptismRegistrationStatus" AS ENUM ('Registered', 'Baptized', 'Postponed');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('Admin', 'Info Desk', 'Follow-up Coordinator', 'Pastor');

-- CreateTable
CREATE TABLE "people" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "age_group" "AgeGroup",
    "phone" TEXT NOT NULL,
    "location" TEXT,
    "category" "Category" NOT NULL DEFAULT 'Visitor',
    "m1_status" "M1Status",
    "hbf_group" TEXT,
    "how_found_church" TEXT,
    "date_registered" DATE NOT NULL DEFAULT current_date,
    "assigned_to" UUID,
    "follow_up_status" "FollowUpStatus" NOT NULL DEFAULT 'Not Started',
    "last_contact_date" DATE,
    "baptism_status" "BaptismStatus",
    "notes" TEXT,
    "registered_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contact_preference" "ContactPreference",
    "needs_pastor" BOOLEAN NOT NULL DEFAULT false,
    "assigned_at" TIMESTAMPTZ(6),
    "assigned_by" UUID,
    "email" TEXT,
    "address_details" TEXT,
    "needs_m1" BOOLEAN NOT NULL DEFAULT false,
    "needs_baptism" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "full_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "user_id" UUID,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "ip_hash" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" UUID,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "person_id" UUID NOT NULL,
    "service_date" DATE NOT NULL DEFAULT current_date,
    "service_name" TEXT NOT NULL DEFAULT 'Sunday Service',
    "checked_in_by" UUID,
    "checked_in_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "person_id" UUID NOT NULL,
    "contacted_by" UUID NOT NULL,
    "contacted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" "ContactMethod" NOT NULL,
    "outcome" "ContactOutcome" NOT NULL,
    "note" TEXT,
    "finished" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "contact_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "suggested_category" "Category",
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purpose" "TemplatePurpose" NOT NULL DEFAULT 'follow_up',

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "m1_classes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "venue" TEXT,
    "required_days" INTEGER NOT NULL DEFAULT 3,
    "status" "ClassStatus" NOT NULL DEFAULT 'Open',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "m1_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "m1_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "day_number" INTEGER NOT NULL,
    "session_date" DATE NOT NULL,
    "start_time" TIME(6),
    "topic" TEXT,
    "summary" TEXT,
    "closed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "m1_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "m1_enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enrolled_by" UUID,
    "walk_in" BOOLEAN NOT NULL DEFAULT false,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'Enrolled',
    "certificate_no" TEXT,
    "certificate_issued_at" TIMESTAMPTZ(6),
    "certificate_override_note" TEXT,

    CONSTRAINT "m1_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "m1_attendance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "status" "AttendanceMark" NOT NULL,
    "marked_by" UUID,
    "marked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "m1_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "m1_message_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID,
    "session_id" UUID,
    "person_id" UUID NOT NULL,
    "purpose" "MessagePurpose" NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "sent_by" UUID,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "m1_message_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "m1_reply_links" (
    "token" TEXT NOT NULL,
    "session_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),

    CONSTRAINT "m1_reply_links_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "m1_absence_replies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "reason" "AbsenceReason" NOT NULL,
    "note" TEXT,
    "source" "ReplySource" NOT NULL DEFAULT 'Link',
    "recorded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "m1_absence_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "m1_materials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "session_id" UUID,
    "title" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT,
    "size_bytes" BIGINT,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "m1_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "baptism_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_date" DATE NOT NULL,
    "event_time" TIME(6),
    "venue" TEXT,
    "officiant" TEXT,
    "status" "BaptismEventStatus" NOT NULL DEFAULT 'Scheduled',
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "baptism_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "baptism_registrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "status" "BaptismRegistrationStatus" NOT NULL DEFAULT 'Registered',
    "baptized_at" TIMESTAMPTZ(6),
    "certificate_no" TEXT,
    "certificate_issued_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "baptism_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "people_phone_idx" ON "people"("phone");

-- CreateIndex
CREATE INDEX "people_date_registered_idx" ON "people"("date_registered");

-- CreateIndex
CREATE INDEX "people_assigned_to_follow_up_status_idx" ON "people"("assigned_to", "follow_up_status");

-- CreateIndex
CREATE INDEX "people_category_idx" ON "people"("category");

-- CreateIndex
CREATE INDEX "people_hbf_group_idx" ON "people"("hbf_group");

-- CreateIndex
CREATE INDEX "people_location_idx" ON "people"("location");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_user_id_key" ON "team_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "audit_log_user_id_idx" ON "audit_log"("user_id");

-- CreateIndex
CREATE INDEX "attendance_date_person_idx" ON "attendance"("service_date", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_person_id_service_date_service_name_key" ON "attendance"("person_id", "service_date", "service_name");

-- CreateIndex
CREATE INDEX "contact_log_person_idx" ON "contact_log"("person_id", "contacted_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_name_key" ON "message_templates"("name");

-- CreateIndex
CREATE UNIQUE INDEX "m1_sessions_class_id_day_number_key" ON "m1_sessions"("class_id", "day_number");

-- CreateIndex
CREATE UNIQUE INDEX "m1_enrollments_certificate_no_key" ON "m1_enrollments"("certificate_no");

-- CreateIndex
CREATE UNIQUE INDEX "m1_enrollments_class_id_person_id_key" ON "m1_enrollments"("class_id", "person_id");

-- CreateIndex
CREATE INDEX "m1_attendance_person_idx" ON "m1_attendance"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "m1_attendance_session_id_person_id_key" ON "m1_attendance"("session_id", "person_id");

-- CreateIndex
CREATE INDEX "m1_message_log_person_idx" ON "m1_message_log"("person_id", "sent_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "m1_reply_links_session_id_person_id_key" ON "m1_reply_links"("session_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "baptism_registrations_certificate_no_key" ON "baptism_registrations"("certificate_no");

-- CreateIndex
CREATE UNIQUE INDEX "baptism_registrations_event_id_person_id_key" ON "baptism_registrations"("event_id", "person_id");

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "team_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_registered_by_fkey" FOREIGN KEY ("registered_by") REFERENCES "team_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "team_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_checked_in_by_fkey" FOREIGN KEY ("checked_in_by") REFERENCES "team_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contact_log" ADD CONSTRAINT "contact_log_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contact_log" ADD CONSTRAINT "contact_log_contacted_by_fkey" FOREIGN KEY ("contacted_by") REFERENCES "team_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "team_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "m1_classes" ADD CONSTRAINT "m1_classes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "team_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "m1_sessions" ADD CONSTRAINT "m1_sessions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "m1_classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "m1_enrollments" ADD CONSTRAINT "m1_enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "m1_classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "m1_enrollments" ADD CONSTRAINT "m1_enrollments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "m1_enrollments" ADD CONSTRAINT "m1_enrollments_enrolled_by_fkey" FOREIGN KEY ("enrolled_by") REFERENCES "team_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "m1_attendance" ADD CONSTRAINT "m1_attendance_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "m1_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "m1_attendance" ADD CONSTRAINT "m1_attendance_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "m1_attendance" ADD CONSTRAINT "m1_attendance_marked_by_fkey" FOREIGN KEY ("marked_by") REFERENCES "team_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "m1_message_log" ADD CONSTRAINT "m1_message_log_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "m1_classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "m1_message_log" ADD CONSTRAINT "m1_message_log_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "m1_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "m1_message_log" ADD CONSTRAINT "m1_message_log_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "m1_message_log" ADD CONSTRAINT "m1_message_log_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "team_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "m1_reply_links" ADD CONSTRAINT "m1_reply_links_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "m1_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "m1_reply_links" ADD CONSTRAINT "m1_reply_links_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "m1_reply_links" ADD CONSTRAINT "m1_reply_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "team_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "m1_absence_replies" ADD CONSTRAINT "m1_absence_replies_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "m1_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "m1_absence_replies" ADD CONSTRAINT "m1_absence_replies_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "m1_absence_replies" ADD CONSTRAINT "m1_absence_replies_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "team_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "m1_materials" ADD CONSTRAINT "m1_materials_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "m1_classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "m1_materials" ADD CONSTRAINT "m1_materials_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "m1_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "m1_materials" ADD CONSTRAINT "m1_materials_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "team_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "baptism_events" ADD CONSTRAINT "baptism_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "team_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "baptism_registrations" ADD CONSTRAINT "baptism_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "baptism_events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "baptism_registrations" ADD CONSTRAINT "baptism_registrations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "baptism_registrations" ADD CONSTRAINT "baptism_registrations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "team_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
