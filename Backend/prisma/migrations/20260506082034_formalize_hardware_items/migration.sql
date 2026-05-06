/*
  Warnings:

  - You are about to drop the column `hardware_item` on the `Ticket` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "hardware_item",
ADD COLUMN     "hardware_item_id" INTEGER;

-- CreateTable
CREATE TABLE "HardwareItem" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HardwareItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HardwareItem_name_key" ON "HardwareItem"("name");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_hardware_item_id_fkey" FOREIGN KEY ("hardware_item_id") REFERENCES "HardwareItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
