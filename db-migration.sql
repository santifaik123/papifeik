-- ============================================================
-- Nuvik Digital — DB Migration
-- Ejecutar UNA VEZ en la consola de Neon (neon.tech > SQL Editor)
-- Agrega columnas para: UTM tracking, secuencia de email, atribución
-- ============================================================

-- Secuencia de email
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_step    SMALLINT    DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_next_at TIMESTAMPTZ DEFAULT NULL;

-- Atribución de canal (UTMs desde URL)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_source    VARCHAR(120) DEFAULT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_medium    VARCHAR(120) DEFAULT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_campaign  VARCHAR(120) DEFAULT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_content   VARCHAR(120) DEFAULT NULL;

-- Contexto de la visita
ALTER TABLE leads ADD COLUMN IF NOT EXISTS referrer_url  VARCHAR(240) DEFAULT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS device_type   VARCHAR(20)  DEFAULT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS landing_page  VARCHAR(240) DEFAULT NULL;

-- Índices para consultas de la secuencia de email
CREATE INDEX IF NOT EXISTS idx_leads_email_sequence
  ON leads (email_step, email_next_at)
  WHERE email_step BETWEEN 1 AND 4;

-- Índice para análisis por canal
CREATE INDEX IF NOT EXISTS idx_leads_utm_source
  ON leads (utm_source)
  WHERE utm_source IS NOT NULL;

-- ============================================================
-- Verificar que las columnas se crearon correctamente:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'leads' ORDER BY ordinal_position;
-- ============================================================
