-- DropIndex
DROP INDEX "SendJob_campaignId_leadId_key";

-- AlterTable
ALTER TABLE "SendJob" ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "step" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "aiSetter" JSONB,
ADD COLUMN     "webhookToken" TEXT;

-- CreateTable
CREATE TABLE "CampaignStep" (
    "campaignId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "delayDays" INTEGER NOT NULL,
    "templateId" TEXT NOT NULL,

    CONSTRAINT "CampaignStep_pkey" PRIMARY KEY ("campaignId","position")
);

-- CreateTable
CREATE TABLE "LoginFailure" (
    "email" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "firstAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginFailure_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE UNIQUE INDEX "SendJob_campaignId_leadId_step_key" ON "SendJob"("campaignId", "leadId", "step");

-- CreateIndex
CREATE UNIQUE INDEX "User_webhookToken_key" ON "User"("webhookToken");

-- AddForeignKey
ALTER TABLE "CampaignStep" ADD CONSTRAINT "CampaignStep_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignStep" ADD CONSTRAINT "CampaignStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

