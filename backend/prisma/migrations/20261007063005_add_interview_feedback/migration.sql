-- AlterTable
ALTER TABLE "Interview" ADD COLUMN     "feedback" TEXT,
ADD COLUMN     "feedbackSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "score" INTEGER;

-- CreateIndex
CREATE INDEX "Interview_feedbackSubmittedAt_idx" ON "Interview"("feedbackSubmittedAt");
