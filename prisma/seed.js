import { prisma } from '../src/config/db.js';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';

export async function runSeed() {
  const ROLES = [
    { id: 'admin',    label: 'Admin',   description: 'Acceso total al sistema',      color: '#CF7452', editable: false },
    { id: 'agent',    label: 'Agente',  description: 'Gestión de tickets asignados', color: '#5ca89a', editable: true  },
    { id: 'customer', label: 'Cliente', description: 'Vista de tickets propios',     color: '#6892b4', editable: true  },
  ];
  const PERMS = ['viewAllQueues','manageTickets','manageQueues','manageUsers','manageRoles','viewReports','manageSLA','viewKB','manageKB','accessAdmin'];
  const ROLE_PERMS = {
    admin:    { viewAllQueues:true,  manageTickets:true,  manageQueues:true,  manageUsers:true,  manageRoles:true,  viewReports:true,  manageSLA:true,  viewKB:true, manageKB:true,  accessAdmin:true  },
    agent:    { viewAllQueues:true,  manageTickets:true,  manageQueues:false, manageUsers:false, manageRoles:false, viewReports:true,  manageSLA:true,  viewKB:true, manageKB:false, accessAdmin:false },
    customer: { viewAllQueues:false, manageTickets:false, manageQueues:false, manageUsers:false, manageRoles:false, viewReports:false, manageSLA:false, viewKB:true, manageKB:false, accessAdmin:false },
  };

  for (const r of ROLES) {
    await prisma.role.upsert({ where: { id: r.id }, update: {}, create: r });
    for (const p of PERMS) {
      await prisma.rolePermission.upsert({
        where:  { role_id_permission_id: { role_id: r.id, permission_id: p } },
        update: {},
        create: { role_id: r.id, permission_id: p, enabled: ROLE_PERMS[r.id][p] },
      });
    }
  }

  const USERS = [
    { name: 'Patricia Lara',  email: 'admin@equilybrio.com',      password: 'equilybrio2026', role_id: 'admin'    },
    { name: 'Camilo Reyes',   email: 'agente@equilybrio.com',     password: 'equilybrio2026', role_id: 'agent'    },
    { name: 'Ana Ríos',       email: 'a.rios@equilybrio.com',     password: 'equilybrio2026', role_id: 'agent'    },
    { name: 'Luis Herrera',   email: 'l.herrera@equilybrio.com',  password: 'equilybrio2026', role_id: 'agent'    },
    { name: 'María García',   email: 'm.garcia@equilybrio.com',   password: 'equilybrio2026', role_id: 'customer' },
    { name: 'Sofía Martínez', email: 's.martinez@equilybrio.com', password: 'equilybrio2026', role_id: 'customer' },
    { name: 'Carlos Peña',    email: 'c.pena@equilybrio.com',     password: 'equilybrio2026', role_id: 'customer' },
  ];
  for (const u of USERS) {
    await prisma.user.upsert({
      where:  { email: u.email },
      update: {},
      create: { name: u.name, email: u.email, password_hash: bcrypt.hashSync(u.password, 10), role_id: u.role_id, active: true },
    });
  }

  const QUEUES = [
    { id: 'it',        name: 'IT Soporte', owner_name: 'Camilo Reyes', color: '#CF7452' },
    { id: 'dev',       name: 'Desarrollo', owner_name: 'Ana Ríos',     color: '#5ca89a' },
    { id: 'devops',    name: 'DevOps',     owner_name: 'Camilo Reyes', color: '#6892b4' },
    { id: 'analytics', name: 'Analytics',  owner_name: 'Luis Herrera', color: '#c98c4a' },
    { id: 'finance',   name: 'Finanzas',   owner_name: 'Luis Herrera', color: '#78b07a' },
    { id: 'hr',        name: 'RRHH',       owner_name: 'Ana Ríos',     color: '#9b78b0' },
    { id: 'security',  name: 'Seguridad',  owner_name: 'Camilo Reyes', color: '#c46262' },
  ];
  for (const q of QUEUES) {
    await prisma.queue.upsert({ where: { id: q.id }, update: {}, create: { ...q, active: true } });
  }

  const TICKETS = [
    { id:'TK-1041', title:'VPN client crashing on Windows 11 update',     requester_name:'María García',   requester_email:'m.garcia@equilybrio.com',   assignee_name:'Camilo Reyes', queue_id:'it',        dept:'IT',       category:'Infraestructura', status:'open',     priority:'urgent', sla_deadline:'2026-04-29T12:14', created_at:new Date('2026-04-29T08:14:00Z'), updated_at:new Date('2026-04-29T09:45:00Z'),
      tags:['vpn','windows','crash'],
      history:[
        { type:'created',       from_val:'',    to_val:'open', comment:'Ticket abierto por solicitud de usuario.',                                         category:'Diagnóstico',           agent_name:'Sistema',      created_at:new Date('2026-04-29T08:14:00Z') },
        { type:'status_change', from_val:'new', to_val:'open', comment:'Ticket tomado — revisando conflicto con KB5034763.',                               category:'Diagnóstico',           agent_name:'Camilo Reyes', created_at:new Date('2026-04-29T08:32:00Z') },
        { type:'comment',       from_val:'',    to_val:'',     comment:'Cliente confirma GlobalProtect 6.2.1. Error: authentication gateway unreachable.', category:'Información adicional', agent_name:'Camilo Reyes', created_at:new Date('2026-04-29T08:41:00Z') },
        { type:'comment',       from_val:'',    to_val:'',     comment:'Conflicto confirmado. Solución: revertir KB5034763. Instrucciones enviadas.',      category:'Diagnóstico',           agent_name:'Camilo Reyes', created_at:new Date('2026-04-29T09:45:00Z') },
      ]},
    { id:'TK-1040', title:'Solicitar acceso a Power BI Premium',           requester_name:'Sofía Martínez', requester_email:'s.martinez@equilybrio.com', assignee_name:'Luis Herrera', queue_id:'analytics', dept:'Analytics', category:'Acceso Software', status:'pending',  priority:'medium', sla_deadline:'2026-04-30T15:30', created_at:new Date('2026-04-28T15:30:00Z'), updated_at:new Date('2026-04-29T07:20:00Z'),
      tags:['power-bi','licencia'],
      history:[
        { type:'created',       from_val:'',    to_val:'new',     comment:'Solicitud licencia Power BI Premium para proyecto Q2.',   category:'Diagnóstico', agent_name:'Sistema',      created_at:new Date('2026-04-28T15:30:00Z') },
        { type:'status_change', from_val:'new', to_val:'pending', comment:'Esperando formulario de aprobación del manager.',         category:'Seguimiento', agent_name:'Luis Herrera', created_at:new Date('2026-04-28T16:10:00Z') },
      ]},
    { id:'TK-1039', title:'Error 500 en módulo de facturación',            requester_name:'Carlos Peña',    requester_email:'c.pena@equilybrio.com',    assignee_name:'Ana Ríos',     queue_id:'dev',       dept:'Dev',      category:'Bug',             status:'open',     priority:'high',   sla_deadline:'2026-04-29T11:00', created_at:new Date('2026-04-28T11:00:00Z'), updated_at:new Date('2026-04-28T14:30:00Z'),
      tags:['bug','billing','producción'],
      history:[
        { type:'created', from_val:'', to_val:'open', comment:'Error 500 al generar facturas >50 líneas.',         category:'Diagnóstico', agent_name:'Sistema',  created_at:new Date('2026-04-28T11:00:00Z') },
        { type:'comment', from_val:'', to_val:'',     comment:'Timeout en query de consolidación. Branch hotfix.', category:'Diagnóstico', agent_name:'Ana Ríos', created_at:new Date('2026-04-28T11:45:00Z') },
        { type:'comment', from_val:'', to_val:'',     comment:'Fix en staging. Deploy a producción en ~1h.',        category:'Seguimiento', agent_name:'Ana Ríos', created_at:new Date('2026-04-28T14:30:00Z') },
      ]},
    { id:'TK-1038', title:'Laptop pantalla negra — ThinkPad X1 Carbon',   requester_name:'Diego Vargas',   requester_email:'d.vargas@equilybrio.com',  assignee_name:null,           queue_id:'it',        dept:'IT',       category:'Hardware',        status:'new',      priority:'high',   sla_deadline:'2026-04-29T14:02', created_at:new Date('2026-04-29T10:02:00Z'), updated_at:new Date('2026-04-29T10:02:00Z'),
      tags:['hardware','laptop'],
      history:[
        { type:'created', from_val:'', to_val:'new', comment:'#EQ-1137 no enciende. Pantalla negra con batería cargada.', category:'Diagnóstico', agent_name:'Sistema', created_at:new Date('2026-04-29T10:02:00Z') },
      ]},
    { id:'TK-1037', title:'Configurar SSO Okta — tenant Acme Corp',       requester_name:'Patricia Lara',  requester_email:'p.lara@equilybrio.com',    assignee_name:'Camilo Reyes', queue_id:'security',  dept:'Security', category:'Identidad',       status:'resolved', priority:'medium', sla_deadline:'2026-04-28T09:00', created_at:new Date('2026-04-25T09:00:00Z'), updated_at:new Date('2026-04-28T16:00:00Z'),
      tags:['sso','okta'],
      history:[
        { type:'created',       from_val:'',     to_val:'open',     comment:'SSO Okta para Acme Corp. Contrato firmado, deadline 3 días.', category:'Diagnóstico',  agent_name:'Sistema',      created_at:new Date('2026-04-25T09:00:00Z') },
        { type:'queue_move',    from_val:'it',   to_val:'security', comment:'Movido a Seguridad — tarea de identidad empresarial.',        category:'Reasignación', agent_name:'Camilo Reyes', created_at:new Date('2026-04-25T09:30:00Z') },
        { type:'status_change', from_val:'open', to_val:'resolved', comment:'SSO activo y verificado. Documentación enviada.',             category:'Resolución',   agent_name:'Camilo Reyes', created_at:new Date('2026-04-28T16:00:00Z') },
      ]},
    { id:'TK-1036', title:'Reporte de gastos Q1 no genera PDF',           requester_name:'Elena Torres',   requester_email:'e.torres@equilybrio.com',  assignee_name:'Luis Herrera', queue_id:'finance',   dept:'Finance',  category:'Bug',             status:'closed',   priority:'low',    sla_deadline:'2026-04-25T14:00', created_at:new Date('2026-04-22T14:00:00Z'), updated_at:new Date('2026-04-24T11:00:00Z'),
      tags:['finanzas','pdf'],
      history:[
        { type:'created',       from_val:'',     to_val:'new',    comment:'Botón Exportar PDF no responde.',              category:'Diagnóstico', agent_name:'Sistema',      created_at:new Date('2026-04-22T14:00:00Z') },
        { type:'comment',       from_val:'',     to_val:'',       comment:'Bloqueo de popups en Chrome. Instrucciones.',  category:'Resolución',  agent_name:'Luis Herrera', created_at:new Date('2026-04-22T15:30:00Z') },
        { type:'status_change', from_val:'open', to_val:'closed', comment:'Usuario confirma que funciona.',               category:'Cierre',      agent_name:'Luis Herrera', created_at:new Date('2026-04-24T11:00:00Z') },
      ]},
    { id:'TK-1035', title:'Onboarding 3 ingenieros — inicio 5 mayo',      requester_name:'HR Equilybrio',  requester_email:'hr@equilybrio.com',         assignee_name:'Ana Ríos',     queue_id:'hr',        dept:'HR',       category:'Onboarding',      status:'open',     priority:'medium', sla_deadline:'2026-04-30T08:00', created_at:new Date('2026-04-27T08:00:00Z'), updated_at:new Date('2026-04-29T09:00:00Z'),
      tags:['hr','onboarding'],
      history:[
        { type:'created',    from_val:'',   to_val:'open', comment:'Javier Mora (BE), Laura Suárez (FE), Roberto Gil (DevOps).', category:'Diagnóstico',  agent_name:'Sistema',  created_at:new Date('2026-04-27T08:00:00Z') },
        { type:'queue_move', from_val:'it', to_val:'hr',   comment:'Centralizado en RRHH para coordinación completa.',           category:'Reasignación', agent_name:'Ana Ríos', created_at:new Date('2026-04-29T09:00:00Z') },
      ]},
    { id:'TK-1034', title:'Certificado SSL expirado — api.equilybrio.io', requester_name:'Monitor Alerta', requester_email:'alerts@equilybrio.com',     assignee_name:'Camilo Reyes', queue_id:'devops',    dept:'DevOps',   category:'Seguridad',       status:'open',     priority:'urgent', sla_deadline:'2026-04-29T09:00', created_at:new Date('2026-04-29T03:00:00Z'), updated_at:new Date('2026-04-29T03:15:00Z'),
      tags:['ssl','api'],
      history:[
        { type:'created',       from_val:'',    to_val:'open', comment:'ALERTA: Cert SSL api.equilybrio.io expira en <6h.', category:'Escalado',    agent_name:'Sistema',      created_at:new Date('2026-04-29T03:00:00Z') },
        { type:'status_change', from_val:'new', to_val:'open', comment:"Iniciando renovación Let's Encrypt.",               category:'Diagnóstico', agent_name:'Camilo Reyes', created_at:new Date('2026-04-29T03:15:00Z') },
      ]},
  ];

  for (const t of TICKETS) {
    const { tags, history, ...ticket } = t;
    await prisma.ticket.upsert({
      where:  { id: ticket.id },
      update: {},
      create: {
        ...ticket,
        tags:    { createMany: { data: tags.map(tag => ({ tag })), skipDuplicates: true } },
        history: { createMany: { data: history } },
      },
    });
  }

  await prisma.kbArticle.createMany({
    skipDuplicates: true,
    data: [
      { id:'KB-001', title:'Restablecer contraseña de red',         cat:'Acceso',          views:1240, status:'published', content:'', created_at:new Date('2026-04-20T00:00:00Z') },
      { id:'KB-002', title:'Configuración de VPN GlobalProtect',    cat:'Infraestructura', views:980,  status:'published', content:'', created_at:new Date('2026-04-15T00:00:00Z') },
      { id:'KB-003', title:'Solicitar licencia de software',        cat:'Software',        views:750,  status:'published', content:'', created_at:new Date('2026-04-10T00:00:00Z') },
      { id:'KB-004', title:'Política de equipos y activos TI',      cat:'Hardware',        views:620,  status:'published', content:'', created_at:new Date('2026-03-28T00:00:00Z') },
      { id:'KB-005', title:'Guía de onboarding — nuevos empleados', cat:'RRHH',            views:1890, status:'published', content:'', created_at:new Date('2026-04-22T00:00:00Z') },
      { id:'KB-006', title:'Cómo escalar un ticket urgente',        cat:'Soporte',         views:430,  status:'published', content:'', created_at:new Date('2026-04-18T00:00:00Z') },
      { id:'KB-007', title:'Okta SSO — guía para administradores',  cat:'Seguridad',       views:312,  status:'published', content:'', created_at:new Date('2026-04-25T00:00:00Z') },
      { id:'KB-008', title:'Error 500 en módulos internos',         cat:'Dev',             views:210,  status:'draft',     content:'', created_at:new Date('2026-04-29T00:00:00Z') },
    ],
  });

  await prisma.slaRule.createMany({
    skipDuplicates: true,
    data: [
      { name:'Urgente — crítico',   priority:'urgent', dept:'all', r1:'1h',  res:'4h',  esc:'2h',  active:true },
      { name:'Alta prioridad',      priority:'high',   dept:'all', r1:'4h',  res:'8h',  esc:'6h',  active:true },
      { name:'Media prioridad',     priority:'medium', dept:'all', r1:'8h',  res:'24h', esc:'16h', active:true },
      { name:'Baja prioridad',      priority:'low',    dept:'all', r1:'24h', res:'72h', esc:'48h', active:true },
      { name:'Bug producción — Dev',priority:'urgent', dept:'Dev', r1:'30m', res:'2h',  esc:'1h',  active:true },
      { name:'Onboarding — RRHH',   priority:'medium', dept:'HR',  r1:'4h',  res:'48h', esc:'24h', active:true },
    ],
  });

  await prisma.counter.createMany({
    skipDuplicates: true,
    data: [
      { key: 'ticket', value: 1041 },
      { key: 'kb',     value: 8    },
    ],
  });

  console.log('  ✓ Database seeded');
}

// Run as standalone script via `prisma db seed` or `npm run seed`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSeed()
    .catch(err => { console.error(err); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
