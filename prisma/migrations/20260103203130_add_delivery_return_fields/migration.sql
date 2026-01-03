-- CreateEnum
CREATE TYPE "FuelLevel" AS ENUM ('FULL', 'THREE_QUARTER', 'HALF', 'QUARTER', 'LOW');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "damageCharge" DOUBLE PRECISION,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveredById" TEXT,
ADD COLUMN     "existingDamages" TEXT,
ADD COLUMN     "extraKmsCharge" DOUBLE PRECISION,
ADD COLUMN     "fuelCharge" DOUBLE PRECISION,
ADD COLUMN     "fuelLevelEnd" "FuelLevel",
ADD COLUMN     "fuelLevelStart" "FuelLevel",
ADD COLUMN     "helmetsGiven" INTEGER,
ADD COLUMN     "helmetsReturned" INTEGER,
ADD COLUMN     "idVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lateFee" DOUBLE PRECISION,
ADD COLUMN     "newDamages" TEXT,
ADD COLUMN     "odometerEnd" DOUBLE PRECISION,
ADD COLUMN     "odometerStart" DOUBLE PRECISION,
ADD COLUMN     "receivedById" TEXT,
ADD COLUMN     "returnedAt" TIMESTAMP(3),
ADD COLUMN     "securityDeposit" DOUBLE PRECISION;
