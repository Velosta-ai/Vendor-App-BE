-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "bikePhotosEnd" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "bikePhotosStart" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "customerIdBack" TEXT,
ADD COLUMN     "customerIdFront" TEXT,
ADD COLUMN     "customerPhoto" TEXT;
