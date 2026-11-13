-- CreateTable
CREATE TABLE "sesion_whatsapp" (
    "clave" VARCHAR(200) NOT NULL,
    "valor" TEXT NOT NULL,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sesion_whatsapp_pkey" PRIMARY KEY ("clave")
);
