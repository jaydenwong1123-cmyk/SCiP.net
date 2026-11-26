-- The Engine can mirror every command and its reply to a public webhook.
ALTER TABLE "EngineGuildConfig" ADD COLUMN "commandLogWebhookUrl" TEXT NOT NULL DEFAULT '';
