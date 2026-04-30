-- ============================================================
--  Ticketera — Equilybrio Group
--  PostgreSQL Schema + Seed
--
--  Ejecutar con:
--    psql -U <user> -d <database> -f schema.sql
--  o pegarlo directamente en pgAdmin / DBeaver
--
--  Nota: este archivo reemplaza las migraciones de Prisma para
--  setups manuales. Si usás `docker compose up`, las migraciones
--  se aplican automáticamente y no necesitás este archivo.
-- ============================================================

-- ── Extensiones ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- para crypt() en el seed de passwords
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- para búsqueda full-text en tickets/kb

-- ── Limpiar (útil para re-deploy en dev) ─────────────────────
-- DROP SCHEMA public CASCADE; CREATE SCHEMA public;

-- ============================================================
--  ENUMS
-- ============================================================

CREATE TYPE ticket_status   AS ENUM ('new', 'open', 'pending', 'resolved', 'closed');
CREATE TYPE ticket_priority  AS ENUM ('urgent', 'high', 'medium', 'low');
CREATE TYPE history_type     AS ENUM ('created', 'status_change', 'queue_move', 'assign', 'comment');
CREATE TYPE article_status   AS ENUM ('published', 'draft');

-- ============================================================
--  SECUENCIAS  (para referencia / uso directo en SQL)
--  El backend Node.js usa la tabla `counters` en su lugar.
-- ============================================================

-- Arranca en 1042 → el próximo ticket manual sería TK-1042
CREATE SEQUENCE ticket_seq START 1042 INCREMENT 1;

-- Arranca en 9 → el próximo artículo KB manual sería KB-009
CREATE SEQUENCE kb_seq START 9 INCREMENT 1;

-- ============================================================
--  TABLAS
-- ============================================================

-- ── roles ─────────────────────────────────────────────────────
CREATE TABLE roles (
    id          TEXT        PRIMARY KEY,
    label       TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    color       TEXT        NOT NULL DEFAULT '#888888',
    editable    BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  roles          IS 'Roles del sistema (admin, agent, customer, custom)';
COMMENT ON COLUMN roles.editable IS 'FALSE en roles del sistema que no se pueden eliminar';

-- ── role_permissions ──────────────────────────────────────────
CREATE TABLE role_permissions (
    role_id       TEXT    NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id TEXT    NOT NULL,
    enabled       BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (role_id, permission_id)
);

COMMENT ON TABLE role_permissions IS 'Matriz de permisos por rol. permission_id es un slug de texto libre.';

-- ── users ─────────────────────────────────────────────────────
CREATE TABLE users (
    id            SERIAL      PRIMARY KEY,
    name          TEXT        NOT NULL,
    email         TEXT        NOT NULL,
    password_hash TEXT        NOT NULL,
    role_id       TEXT        NOT NULL REFERENCES roles(id),
    active        BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT users_email_unique UNIQUE (email)
);

COMMENT ON COLUMN users.password_hash IS 'Hash bcrypt generado con pgcrypto crypt() o bcryptjs';

-- ── queues ────────────────────────────────────────────────────
CREATE TABLE queues (
    id         TEXT        PRIMARY KEY,
    name       TEXT        NOT NULL,
    owner_name TEXT,
    color      TEXT        NOT NULL DEFAULT '#888888',
    active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN queues.id         IS 'Slug corto, ej: it, dev, devops, hr';
COMMENT ON COLUMN queues.owner_name IS 'Nombre desnormalizado del responsable para queries simples';

-- ── tickets ───────────────────────────────────────────────────
CREATE TABLE tickets (
    id              TEXT             PRIMARY KEY,
    title           TEXT             NOT NULL,
    requester_name  TEXT             NOT NULL,
    requester_email TEXT             NOT NULL,
    assignee_name   TEXT,
    assignee_id     INTEGER          REFERENCES users(id) ON DELETE SET NULL,
    queue_id        TEXT             REFERENCES queues(id) ON DELETE SET NULL,
    dept            TEXT,
    category        TEXT,
    status          ticket_status    NOT NULL DEFAULT 'new',
    priority        ticket_priority  NOT NULL DEFAULT 'medium',
    sla_deadline    TEXT,
    created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN tickets.id            IS 'Formato TK-NNNN generado por el backend';
COMMENT ON COLUMN tickets.assignee_name IS 'NULL indica ticket sin asignar';
COMMENT ON COLUMN tickets.assignee_id   IS 'FK a users — sincronizado con assignee_name';
COMMENT ON COLUMN tickets.sla_deadline  IS 'ISO datetime calculado al crear según SLA rule activa';

-- ── ticket_tags ───────────────────────────────────────────────
CREATE TABLE ticket_tags (
    ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    tag       TEXT NOT NULL,
    PRIMARY KEY (ticket_id, tag)
);

-- ── ticket_history ────────────────────────────────────────────
CREATE TABLE ticket_history (
    id         SERIAL       PRIMARY KEY,
    ticket_id  TEXT         NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    type       history_type NOT NULL,
    from_val   TEXT         NOT NULL DEFAULT '',
    to_val     TEXT         NOT NULL DEFAULT '',
    comment    TEXT         NOT NULL DEFAULT '',
    category   TEXT         NOT NULL DEFAULT '',
    agent_name TEXT         NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN ticket_history.from_val IS 'Status o queue_id de origen (según type)';
COMMENT ON COLUMN ticket_history.to_val   IS 'Status o queue_id de destino (según type)';

-- ── kb_articles ───────────────────────────────────────────────
CREATE TABLE kb_articles (
    id         TEXT           PRIMARY KEY,
    title      TEXT           NOT NULL,
    cat        TEXT,
    content    TEXT           NOT NULL DEFAULT '',
    views      INTEGER        NOT NULL DEFAULT 0,
    status     article_status NOT NULL DEFAULT 'published',
    created_at TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN kb_articles.id IS 'Formato KB-NNN generado por el backend';

-- ── sla_rules ─────────────────────────────────────────────────
CREATE TABLE sla_rules (
    id       SERIAL          PRIMARY KEY,
    name     TEXT            NOT NULL,
    priority ticket_priority NOT NULL,
    dept     TEXT            NOT NULL DEFAULT 'all',
    r1       TEXT,
    res      TEXT,
    esc      TEXT,
    active   BOOLEAN         NOT NULL DEFAULT TRUE
);

COMMENT ON COLUMN sla_rules.dept IS '''all'' aplica a todas las áreas; valor específico ej: ''Dev'', ''HR''';
COMMENT ON COLUMN sla_rules.r1   IS 'Tiempo de primera respuesta. Formato libre: 30m, 1h, 4h, 24h';

-- ── counters ─────────────────────────────────────────────────
-- Usada por el backend Node.js para generar IDs con formato propio.
CREATE TABLE counters (
    key   TEXT    PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 0
);

COMMENT ON TABLE counters IS 'Contadores para IDs custom (TK-NNNN, KB-NNN). Gestionados por el backend.';

-- ============================================================
--  FUNCIÓN updated_at (trigger automático)
-- ============================================================

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_queues_updated_at
    BEFORE UPDATE ON queues
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_kb_updated_at
    BEFORE UPDATE ON kb_articles
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
--  FUNCIONES  — generación de IDs (uso directo en SQL)
-- ============================================================

CREATE OR REPLACE FUNCTION next_ticket_id()
RETURNS TEXT AS $$
    SELECT 'TK-' || nextval('ticket_seq')::TEXT;
$$ LANGUAGE SQL VOLATILE;

CREATE OR REPLACE FUNCTION next_kb_id()
RETURNS TEXT AS $$
    SELECT 'KB-' || LPAD(nextval('kb_seq')::TEXT, 3, '0');
$$ LANGUAGE SQL VOLATILE;

COMMENT ON FUNCTION next_ticket_id IS 'Genera TK-1042, TK-1043... Uso directo en SQL. El backend usa la tabla counters.';
COMMENT ON FUNCTION next_kb_id     IS 'Genera KB-009, KB-010... Uso directo en SQL. El backend usa la tabla counters.';

-- ============================================================
--  ÍNDICES
-- ============================================================

CREATE INDEX idx_tickets_status       ON tickets (status);
CREATE INDEX idx_tickets_priority     ON tickets (priority);
CREATE INDEX idx_tickets_queue_id     ON tickets (queue_id);
CREATE INDEX idx_tickets_assignee     ON tickets (assignee_name);
CREATE INDEX idx_tickets_requester    ON tickets (requester_email);
CREATE INDEX idx_tickets_updated_at   ON tickets (updated_at DESC);
CREATE INDEX idx_tickets_sla_deadline ON tickets (sla_deadline) WHERE status NOT IN ('resolved','closed');

CREATE INDEX idx_tickets_title_trgm   ON tickets USING GIN (title gin_trgm_ops);

CREATE INDEX idx_history_ticket_id    ON ticket_history (ticket_id);
CREATE INDEX idx_history_created_at   ON ticket_history (created_at);

CREATE INDEX idx_tags_ticket_id       ON ticket_tags (ticket_id);
CREATE INDEX idx_tags_tag             ON ticket_tags (tag);

CREATE INDEX idx_users_email          ON users (LOWER(email));
CREATE INDEX idx_users_role_id        ON users (role_id);
CREATE INDEX idx_users_active         ON users (active);

CREATE INDEX idx_kb_status            ON kb_articles (status);
CREATE INDEX idx_kb_cat               ON kb_articles (cat);
CREATE INDEX idx_kb_title_trgm        ON kb_articles USING GIN (title gin_trgm_ops);

CREATE INDEX idx_sla_priority         ON sla_rules (priority);
CREATE INDEX idx_sla_active           ON sla_rules (active);

-- ============================================================
--  SEED — datos iniciales
-- ============================================================

-- ── Roles ─────────────────────────────────────────────────────
INSERT INTO roles (id, label, description, color, editable) VALUES
    ('admin',    'Admin',   'Acceso total al sistema',       '#CF7452', FALSE),
    ('agent',    'Agente',  'Gestión de tickets asignados',  '#5ca89a', TRUE ),
    ('customer', 'Cliente', 'Vista de tickets propios',      '#6892b4', TRUE );

-- ── Permisos por rol ──────────────────────────────────────────
INSERT INTO role_permissions (role_id, permission_id, enabled) VALUES
    ('admin', 'viewAllQueues',  TRUE),
    ('admin', 'manageTickets',  TRUE),
    ('admin', 'manageQueues',   TRUE),
    ('admin', 'manageUsers',    TRUE),
    ('admin', 'manageRoles',    TRUE),
    ('admin', 'viewReports',    TRUE),
    ('admin', 'manageSLA',      TRUE),
    ('admin', 'viewKB',         TRUE),
    ('admin', 'manageKB',       TRUE),
    ('admin', 'accessAdmin',    TRUE),
    ('agent', 'viewAllQueues',  TRUE),
    ('agent', 'manageTickets',  TRUE),
    ('agent', 'manageQueues',   FALSE),
    ('agent', 'manageUsers',    FALSE),
    ('agent', 'manageRoles',    FALSE),
    ('agent', 'viewReports',    TRUE),
    ('agent', 'manageSLA',      TRUE),
    ('agent', 'viewKB',         TRUE),
    ('agent', 'manageKB',       FALSE),
    ('agent', 'accessAdmin',    FALSE),
    ('customer', 'viewAllQueues',  FALSE),
    ('customer', 'manageTickets',  FALSE),
    ('customer', 'manageQueues',   FALSE),
    ('customer', 'manageUsers',    FALSE),
    ('customer', 'manageRoles',    FALSE),
    ('customer', 'viewReports',    FALSE),
    ('customer', 'manageSLA',      FALSE),
    ('customer', 'viewKB',         TRUE),
    ('customer', 'manageKB',       FALSE),
    ('customer', 'accessAdmin',    FALSE);

-- ── Usuarios (password: equilybrio2026) ───────────────────────
INSERT INTO users (name, email, password_hash, role_id, active) VALUES
    ('Patricia Lara',  'admin@equilybrio.com',      crypt('equilybrio2026', gen_salt('bf', 10)), 'admin',    TRUE),
    ('Camilo Reyes',   'agente@equilybrio.com',     crypt('equilybrio2026', gen_salt('bf', 10)), 'agent',    TRUE),
    ('Ana Ríos',       'a.rios@equilybrio.com',     crypt('equilybrio2026', gen_salt('bf', 10)), 'agent',    TRUE),
    ('Luis Herrera',   'l.herrera@equilybrio.com',  crypt('equilybrio2026', gen_salt('bf', 10)), 'agent',    TRUE),
    ('María García',   'm.garcia@equilybrio.com',   crypt('equilybrio2026', gen_salt('bf', 10)), 'customer', TRUE),
    ('Sofía Martínez', 's.martinez@equilybrio.com', crypt('equilybrio2026', gen_salt('bf', 10)), 'customer', TRUE),
    ('Carlos Peña',    'c.pena@equilybrio.com',     crypt('equilybrio2026', gen_salt('bf', 10)), 'customer', TRUE);

-- ── Bandejas ──────────────────────────────────────────────────
INSERT INTO queues (id, name, owner_name, color) VALUES
    ('it',        'IT Soporte', 'Camilo Reyes', '#CF7452'),
    ('dev',       'Desarrollo', 'Ana Ríos',     '#5ca89a'),
    ('devops',    'DevOps',     'Camilo Reyes', '#6892b4'),
    ('analytics', 'Analytics',  'Luis Herrera', '#c98c4a'),
    ('finance',   'Finanzas',   'Luis Herrera', '#78b07a'),
    ('hr',        'RRHH',       'Ana Ríos',     '#9b78b0'),
    ('security',  'Seguridad',  'Camilo Reyes', '#c46262');

-- ── Tickets ───────────────────────────────────────────────────
INSERT INTO tickets (id, title, requester_name, requester_email, assignee_name, queue_id, dept, category, status, priority, sla_deadline, created_at, updated_at) VALUES
    ('TK-1041', 'VPN client crashing on Windows 11 update',    'María García',   'm.garcia@equilybrio.com',   'Camilo Reyes', 'it',        'IT',       'Infraestructura', 'open',     'urgent', '2026-04-29T12:14', '2026-04-29T08:14:00Z', '2026-04-29T09:45:00Z'),
    ('TK-1040', 'Solicitar acceso a Power BI Premium',          'Sofía Martínez', 's.martinez@equilybrio.com', 'Luis Herrera', 'analytics', 'Analytics','Acceso Software', 'pending',  'medium', '2026-04-30T15:30', '2026-04-28T15:30:00Z', '2026-04-29T07:20:00Z'),
    ('TK-1039', 'Error 500 en módulo de facturación',           'Carlos Peña',    'c.pena@equilybrio.com',     'Ana Ríos',     'dev',       'Dev',      'Bug',             'open',     'high',   '2026-04-29T11:00', '2026-04-28T11:00:00Z', '2026-04-28T14:30:00Z'),
    ('TK-1038', 'Laptop pantalla negra — ThinkPad X1 Carbon',  'Diego Vargas',   'd.vargas@equilybrio.com',   NULL,           'it',        'IT',       'Hardware',        'new',      'high',   '2026-04-29T14:02', '2026-04-29T10:02:00Z', '2026-04-29T10:02:00Z'),
    ('TK-1037', 'Configurar SSO Okta — tenant Acme Corp',      'Patricia Lara',  'p.lara@equilybrio.com',     'Camilo Reyes', 'security',  'Security', 'Identidad',       'resolved', 'medium', '2026-04-28T09:00', '2026-04-25T09:00:00Z', '2026-04-28T16:00:00Z'),
    ('TK-1036', 'Reporte de gastos Q1 no genera PDF',           'Elena Torres',   'e.torres@equilybrio.com',   'Luis Herrera', 'finance',   'Finance',  'Bug',             'closed',   'low',    '2026-04-25T14:00', '2026-04-22T14:00:00Z', '2026-04-24T11:00:00Z'),
    ('TK-1035', 'Onboarding 3 ingenieros — inicio 5 mayo',     'HR Equilybrio',  'hr@equilybrio.com',         'Ana Ríos',     'hr',        'HR',       'Onboarding',      'open',     'medium', '2026-04-30T08:00', '2026-04-27T08:00:00Z', '2026-04-29T09:00:00Z'),
    ('TK-1034', 'Certificado SSL expirado — api.equilybrio.io','Monitor Alerta', 'alerts@equilybrio.com',     'Camilo Reyes', 'devops',    'DevOps',   'Seguridad',       'open',     'urgent', '2026-04-29T09:00', '2026-04-29T03:00:00Z', '2026-04-29T03:15:00Z');

-- ── Tags ──────────────────────────────────────────────────────
INSERT INTO ticket_tags (ticket_id, tag) VALUES
    ('TK-1041', 'vpn'),
    ('TK-1041', 'windows'),
    ('TK-1041', 'crash'),
    ('TK-1040', 'power-bi'),
    ('TK-1040', 'licencia'),
    ('TK-1039', 'bug'),
    ('TK-1039', 'billing'),
    ('TK-1039', 'producción'),
    ('TK-1038', 'hardware'),
    ('TK-1038', 'laptop'),
    ('TK-1037', 'sso'),
    ('TK-1037', 'okta'),
    ('TK-1036', 'finanzas'),
    ('TK-1036', 'pdf'),
    ('TK-1035', 'hr'),
    ('TK-1035', 'onboarding'),
    ('TK-1034', 'ssl'),
    ('TK-1034', 'api');

-- ── Historial de tickets ──────────────────────────────────────
INSERT INTO ticket_history (ticket_id, type, from_val, to_val, comment, category, agent_name, created_at) VALUES
    ('TK-1041', 'created',       '',     'open',     'Ticket abierto por solicitud de usuario.',                                          'Diagnóstico',           'Sistema',      '2026-04-29T08:14:00Z'),
    ('TK-1041', 'status_change', 'new',  'open',     'Ticket tomado — revisando conflicto con KB5034763.',                                'Diagnóstico',           'Camilo Reyes', '2026-04-29T08:32:00Z'),
    ('TK-1041', 'comment',       '',     '',          'Cliente confirma GlobalProtect 6.2.1. Error: authentication gateway unreachable.', 'Información adicional', 'Camilo Reyes', '2026-04-29T08:41:00Z'),
    ('TK-1041', 'comment',       '',     '',          'Conflicto confirmado. Solución: revertir KB5034763. Instrucciones enviadas.',       'Diagnóstico',           'Camilo Reyes', '2026-04-29T09:45:00Z'),
    ('TK-1040', 'created',       '',     'new',       'Solicitud licencia Power BI Premium para proyecto Q2.',                            'Diagnóstico',           'Sistema',      '2026-04-28T15:30:00Z'),
    ('TK-1040', 'status_change', 'new',  'pending',   'Esperando formulario de aprobación del manager.',                                  'Seguimiento',           'Luis Herrera', '2026-04-28T16:10:00Z'),
    ('TK-1039', 'created',       '',     'open',      'Error 500 al generar facturas >50 líneas.',                                        'Diagnóstico',           'Sistema',      '2026-04-28T11:00:00Z'),
    ('TK-1039', 'comment',       '',     '',          'Timeout en query de consolidación. Branch hotfix abierto.',                         'Diagnóstico',           'Ana Ríos',     '2026-04-28T11:45:00Z'),
    ('TK-1039', 'comment',       '',     '',          'Fix en staging. Deploy a producción en ~1h.',                                       'Seguimiento',           'Ana Ríos',     '2026-04-28T14:30:00Z'),
    ('TK-1038', 'created',       '',     'new',       '#EQ-1137 no enciende. Pantalla negra con batería cargada.',                         'Diagnóstico',           'Sistema',      '2026-04-29T10:02:00Z'),
    ('TK-1037', 'created',       '',     'open',      'SSO Okta para Acme Corp. Contrato firmado, deadline 3 días.',                       'Diagnóstico',           'Sistema',      '2026-04-25T09:00:00Z'),
    ('TK-1037', 'queue_move',    'it',   'security',  'Movido a Seguridad — tarea de identidad empresarial.',                              'Reasignación',          'Camilo Reyes', '2026-04-25T09:30:00Z'),
    ('TK-1037', 'status_change', 'open', 'resolved',  'SSO activo y verificado. Documentación enviada.',                                   'Resolución',            'Camilo Reyes', '2026-04-28T16:00:00Z'),
    ('TK-1036', 'created',       '',     'new',       'Botón Exportar PDF no responde.',                                                   'Diagnóstico',           'Sistema',      '2026-04-22T14:00:00Z'),
    ('TK-1036', 'comment',       '',     '',          'Bloqueo de popups en Chrome. Instrucciones enviadas.',                              'Resolución',            'Luis Herrera', '2026-04-22T15:30:00Z'),
    ('TK-1036', 'status_change', 'open', 'closed',    'Usuario confirma que funciona.',                                                    'Cierre',                'Luis Herrera', '2026-04-24T11:00:00Z'),
    ('TK-1035', 'created',       '',     'open',      'Javier Mora (BE), Laura Suárez (FE), Roberto Gil (DevOps).',                        'Diagnóstico',           'Sistema',      '2026-04-27T08:00:00Z'),
    ('TK-1035', 'queue_move',    'it',   'hr',        'Centralizado en RRHH para coordinación completa.',                                  'Reasignación',          'Ana Ríos',     '2026-04-29T09:00:00Z'),
    ('TK-1034', 'created',       '',     'open',      'ALERTA: Cert SSL api.equilybrio.io expira en <6h.',                                 'Escalado',              'Sistema',      '2026-04-29T03:00:00Z'),
    ('TK-1034', 'status_change', 'new',  'open',      'Iniciando renovación Let''s Encrypt.',                                              'Diagnóstico',           'Camilo Reyes', '2026-04-29T03:15:00Z');

-- ── Base de Conocimiento ──────────────────────────────────────
INSERT INTO kb_articles (id, title, cat, views, status, created_at, updated_at) VALUES
    ('KB-001', 'Restablecer contraseña de red',         'Acceso',          1240, 'published', '2026-04-20T00:00:00Z', '2026-04-20T00:00:00Z'),
    ('KB-002', 'Configuración de VPN GlobalProtect',    'Infraestructura',  980, 'published', '2026-04-15T00:00:00Z', '2026-04-15T00:00:00Z'),
    ('KB-003', 'Solicitar licencia de software',        'Software',         750, 'published', '2026-04-10T00:00:00Z', '2026-04-10T00:00:00Z'),
    ('KB-004', 'Política de equipos y activos TI',      'Hardware',         620, 'published', '2026-03-28T00:00:00Z', '2026-03-28T00:00:00Z'),
    ('KB-005', 'Guía de onboarding — nuevos empleados', 'RRHH',            1890, 'published', '2026-04-22T00:00:00Z', '2026-04-22T00:00:00Z'),
    ('KB-006', 'Cómo escalar un ticket urgente',        'Soporte',          430, 'published', '2026-04-18T00:00:00Z', '2026-04-18T00:00:00Z'),
    ('KB-007', 'Okta SSO — guía para administradores',  'Seguridad',        312, 'published', '2026-04-25T00:00:00Z', '2026-04-25T00:00:00Z'),
    ('KB-008', 'Error 500 en módulos internos',          'Dev',             210, 'draft',     '2026-04-29T00:00:00Z', '2026-04-29T00:00:00Z');

-- ── Reglas SLA ────────────────────────────────────────────────
INSERT INTO sla_rules (name, priority, dept, r1, res, esc, active) VALUES
    ('Urgente — crítico',    'urgent', 'all', '1h',  '4h',  '2h',  TRUE),
    ('Alta prioridad',        'high',   'all', '4h',  '8h',  '6h',  TRUE),
    ('Media prioridad',       'medium', 'all', '8h',  '24h', '16h', TRUE),
    ('Baja prioridad',        'low',    'all', '24h', '72h', '48h', TRUE),
    ('Bug producción — Dev',  'urgent', 'Dev', '30m', '2h',  '1h',  TRUE),
    ('Onboarding — RRHH',     'medium', 'HR',  '4h',  '48h', '24h', TRUE);

-- ── Contadores para el backend ────────────────────────────────
-- El backend usa esta tabla para generar TK-1042, KB-009, etc.
INSERT INTO counters (key, value) VALUES
    ('ticket', 1041),
    ('kb',     8);

-- ============================================================
--  VERIFICACIÓN  (descomentar para validar)
-- ============================================================

-- SELECT tabla, filas FROM (
--     SELECT 'roles'          AS tabla, COUNT(*)::int AS filas FROM roles          UNION ALL
--     SELECT 'users',                   COUNT(*)              FROM users           UNION ALL
--     SELECT 'queues',                  COUNT(*)              FROM queues          UNION ALL
--     SELECT 'tickets',                 COUNT(*)              FROM tickets         UNION ALL
--     SELECT 'ticket_history',          COUNT(*)              FROM ticket_history  UNION ALL
--     SELECT 'kb_articles',             COUNT(*)              FROM kb_articles     UNION ALL
--     SELECT 'sla_rules',               COUNT(*)              FROM sla_rules       UNION ALL
--     SELECT 'counters',                COUNT(*)              FROM counters
-- ) t ORDER BY tabla;
