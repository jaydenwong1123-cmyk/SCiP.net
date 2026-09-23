-- Public points log (a Discord webhook) and ranks that need a written
-- application on top of their points. See lib/engine/applications.ts.

-- AddColumn
ALTER TABLE "EngineGuildConfig" ADD COLUMN "pointsWebhookUrl" TEXT NOT NULL DEFAULT '';

-- AddColumn
ALTER TABLE "EngineRank" ADD COLUMN "requiresApplication" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EngineRank" ADD COLUMN "applicationQuestions" TEXT NOT NULL DEFAULT '';

-- AddColumn
ALTER TABLE "EnginePromotionRequest" ADD COLUMN "application" TEXT NOT NULL DEFAULT '';
