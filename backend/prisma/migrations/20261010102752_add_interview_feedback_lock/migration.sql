-- AlterTable
ALTER TABLE "Interview" ADD COLUMN     "feedbackLockedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Interview_feedbackLockedAt_idx" ON "Interview"("feedbackLockedAt");
