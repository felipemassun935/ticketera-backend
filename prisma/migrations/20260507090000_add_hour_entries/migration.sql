-- CreateTable
CREATE TABLE "hour_entries" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "project_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "rejection_comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hour_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hour_entries_hours_range_check" CHECK ("hours" >= 0.25 AND "hours" <= 24),
    CONSTRAINT "hour_entries_hours_step_check" CHECK (("hours" * 4) = FLOOR("hours" * 4)),
    CONSTRAINT "hour_entries_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected'))
);

-- CreateIndex
CREATE INDEX "hour_entries_user_id_date_idx" ON "hour_entries"("user_id", "date");

-- CreateIndex
CREATE INDEX "hour_entries_project_id_idx" ON "hour_entries"("project_id");

-- CreateIndex
CREATE INDEX "hour_entries_status_idx" ON "hour_entries"("status");

-- AddForeignKey
ALTER TABLE "hour_entries" ADD CONSTRAINT "hour_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hour_entries" ADD CONSTRAINT "hour_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "queues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hour_entries" ADD CONSTRAINT "hour_entries_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
