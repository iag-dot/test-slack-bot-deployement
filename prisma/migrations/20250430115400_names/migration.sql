/*
  Warnings:

  - You are about to drop the column `reviewer` on the `Feedback` table. All the data in the column will be lost.
  - You are about to drop the column `creator` on the `Review` table. All the data in the column will be lost.
  - You are about to drop the column `reviewers` on the `Review` table. All the data in the column will be lost.
  - You are about to drop the column `assignee` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `creator` on the `Task` table. All the data in the column will be lost.
  - Added the required column `reviewerId` to the `Feedback` table without a default value. This is not possible if the table is not empty.
  - Added the required column `reviewerName` to the `Feedback` table without a default value. This is not possible if the table is not empty.
  - Added the required column `creatorId` to the `Review` table without a default value. This is not possible if the table is not empty.
  - Added the required column `creatorName` to the `Review` table without a default value. This is not possible if the table is not empty.
  - Added the required column `assigneeId` to the `Task` table without a default value. This is not possible if the table is not empty.
  - Added the required column `assigneeName` to the `Task` table without a default value. This is not possible if the table is not empty.
  - Added the required column `creatorId` to the `Task` table without a default value. This is not possible if the table is not empty.
  - Added the required column `creatorName` to the `Task` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Feedback" DROP COLUMN "reviewer",
ADD COLUMN     "reviewerId" TEXT NOT NULL,
ADD COLUMN     "reviewerName" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Review" DROP COLUMN "creator",
DROP COLUMN "reviewers",
ADD COLUMN     "channelName" TEXT,
ADD COLUMN     "creatorId" TEXT NOT NULL,
ADD COLUMN     "creatorName" TEXT NOT NULL,
ADD COLUMN     "reviewerIds" TEXT[],
ADD COLUMN     "reviewerNames" TEXT[];

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "assignee",
DROP COLUMN "creator",
ADD COLUMN     "assigneeId" TEXT NOT NULL,
ADD COLUMN     "assigneeName" TEXT NOT NULL,
ADD COLUMN     "channelName" TEXT,
ADD COLUMN     "completedById" TEXT,
ADD COLUMN     "completedByName" TEXT,
ADD COLUMN     "creatorId" TEXT NOT NULL,
ADD COLUMN     "creatorName" TEXT NOT NULL;
