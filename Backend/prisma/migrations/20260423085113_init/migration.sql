-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'message_received';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "message_notifications" BOOLEAN NOT NULL DEFAULT true;
