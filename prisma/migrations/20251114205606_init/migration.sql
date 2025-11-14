-- CreateEnum
CREATE TYPE "BikeStatus" AS ENUM ('AVAILABLE', 'RENTED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'RETURNED');

-- CreateTable
CREATE TABLE "Bike" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT,
    "registrationNumber" TEXT NOT NULL,
    "year" INTEGER,
    "dailyRate" DOUBLE PRECISION NOT NULL,
    "status" "BikeStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'UPCOMING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bikeId" TEXT NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" SERIAL NOT NULL,
    "phone" TEXT NOT NULL,
    "message" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'new',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bike_registrationNumber_key" ON "Bike"("registrationNumber");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_bikeId_fkey" FOREIGN KEY ("bikeId") REFERENCES "Bike"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
