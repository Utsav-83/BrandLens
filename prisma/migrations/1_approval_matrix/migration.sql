-- CreateEnum
CREATE TYPE "ApprovalStageStatus" AS ENUM ('pending', 'approved', 'changes_requested');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'legal_reviewer';

-- CreateTable
CREATE TABLE "approval_stages" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "requiredReviewerRole" "Role" NOT NULL,

    CONSTRAINT "approval_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_rules" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "minimumSeverity" "FindingSeverity" NOT NULL,
    "stageId" TEXT NOT NULL,

    CONSTRAINT "approval_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_stages" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "status" "ApprovalStageStatus" NOT NULL DEFAULT 'pending',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "comment" TEXT,

    CONSTRAINT "submission_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_stages_workspaceId_idx" ON "approval_stages"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "approval_stages_workspaceId_name_key" ON "approval_stages"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "approval_stages_workspaceId_order_key" ON "approval_stages"("workspaceId", "order");

-- CreateIndex
CREATE INDEX "approval_rules_workspaceId_idx" ON "approval_rules"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "approval_rules_workspaceId_category_minimumSeverity_stageId_key" ON "approval_rules"("workspaceId", "category", "minimumSeverity", "stageId");

-- CreateIndex
CREATE INDEX "submission_stages_submissionId_idx" ON "submission_stages"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "submission_stages_submissionId_stageId_key" ON "submission_stages"("submissionId", "stageId");

-- AddForeignKey
ALTER TABLE "approval_stages" ADD CONSTRAINT "approval_stages_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "approval_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_stages" ADD CONSTRAINT "submission_stages_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_stages" ADD CONSTRAINT "submission_stages_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "approval_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_stages" ADD CONSTRAINT "submission_stages_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
