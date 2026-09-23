-- Rank applications move from in-Discord questions to an external form link
-- (a Google Form). Any questions set under the old scheme are not links, so
-- they are cleared along with the flag rather than carried over as a broken URL.

-- RenameColumn
ALTER TABLE "EngineRank" RENAME COLUMN "applicationQuestions" TO "applicationUrl";

-- Clear the old question lists
UPDATE "EngineRank" SET "applicationUrl" = '', "requiresApplication" = false;
