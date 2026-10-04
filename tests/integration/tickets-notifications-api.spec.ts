import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import * as schema from '../../apps/api/src/infrastructure/database/schema';
import { accounts, roles, accountRoles } from '../../apps/api/src/infrastructure/database/schema/auth.schema';
import { teachers } from '../../apps/api/src/infrastructure/database/schema/teachers.schema';
import { tickets, ticketMessages, attachments } from '../../apps/api/src/infrastructure/database/schema/support.schema';
import { notifications, auditLogs } from '../../apps/api/src/infrastructure/database/schema/system.schema';
import { DRIZZLE_DB } from '../../apps/api/src/infrastructure/database/drizzle.provider';
import { AuthService } from '../../apps/api/src/auth/application/auth.service';
import { AuthGuard } from '../../apps/api/src/auth/presentation/guards/auth.guard';
import { RolesGuard } from '../../apps/api/src/auth/presentation/guards/roles.guard';
import { ScryptPasswordHasher } from '../../apps/api/src/auth/infrastructure/scrypt-password-hasher';
import { CryptoSessionTokenService } from '../../apps/api/src/auth/infrastructure/crypto-session-token.service';
import { MemoryLoginRateLimiter } from '../../apps/api/src/auth/infrastructure/memory-login-rate-limiter';
import { DrizzleSecurityAuditService } from '../../apps/api/src/auth/infrastructure/drizzle-security-audit.service';
import { applyMigrations } from '../helpers/migration-helper';
import {
  PASSWORD_HASHER,
  SESSION_TOKEN_SERVICE,
  LOGIN_RATE_LIMITER,
  SECURITY_AUDIT_SERVICE,
} from '../../apps/api/src/auth/domain/auth-tokens';
import { TicketService } from '../../apps/api/src/support/application/services/ticket.service';
import { TicketsController } from '../../apps/api/src/support/presentation/tickets.controller';
import { NotificationService } from '../../apps/api/src/notifications/application/services/notification.service';
import { NotificationsController } from '../../apps/api/src/notifications/presentation/notifications.controller';
import { HttpExceptionFilter } from '../../apps/api/src/shared/filters/http-exception.filter';
import { eq } from 'drizzle-orm';

let sharedDb: any;

@Module({
  controllers: [TicketsController, NotificationsController],
  providers: [
    TicketService,
    NotificationService,
    AuthService,
    AuthGuard,
    RolesGuard,
    {
      provide: PASSWORD_HASHER,
      useClass: ScryptPasswordHasher,
    },
    {
      provide: SESSION_TOKEN_SERVICE,
      useClass: CryptoSessionTokenService,
    },
    {
      provide: LOGIN_RATE_LIMITER,
      useClass: MemoryLoginRateLimiter,
    },
    {
      provide: SECURITY_AUDIT_SERVICE,
      useClass: DrizzleSecurityAuditService,
    },
    {
      provide: DRIZZLE_DB,
      useFactory: () => sharedDb,
    },
  ],
})
class TestTicketsNotificationsModule {}

describe('Tickets and Notifications Integration Tests (Phase 10)', () => {
  let pg: PGlite;
  let db: any;
  let app: INestApplication;
  let baseUrl: string;

  let supervisorToken: string;
  let teacherAToken: string;
  let teacherBToken: string;

  let supervisorAccountId: string;
  let teacherAAccountId: string;
  let teacherBAccountId: string;

  let teacherAId: string;
  let teacherBId: string;

  before(async () => {
    pg = new PGlite();
    await applyMigrations(pg);

    db = drizzle(pg, { schema });
    sharedDb = db;

    const hasher = new ScryptPasswordHasher();
    const hash = await hasher.hash('password123');

    // Create Roles
    const [supRole] = await db.insert(roles).values({ name: 'SUPERVISOR' }).returning();
    const [teachRole] = await db.insert(roles).values({ name: 'TEACHER' }).returning();

    // Create Supervisor
    const [supAcc] = await db
      .insert(accounts)
      .values({ personnelCode: 'SUP001', passwordHash: hash, isActive: true })
      .returning();
    supervisorAccountId = supAcc.id;
    await db.insert(accountRoles).values({ accountId: supervisorAccountId, roleId: supRole.id });

    // Create Teacher A
    const [tAAcc] = await db
      .insert(accounts)
      .values({ personnelCode: 'TCH001', passwordHash: hash, isActive: true })
      .returning();
    teacherAAccountId = tAAcc.id;
    await db.insert(accountRoles).values({ accountId: teacherAAccountId, roleId: teachRole.id });

    const [tARow] = await db
      .insert(teachers)
      .values({
        accountId: teacherAAccountId,
        firstName: 'Alice',
        lastName: 'Teacher',
        baseRate: '100.00',
        isActive: true,
      })
      .returning();
    teacherAId = tARow.id;

    // Create Teacher B
    const [tBAcc] = await db
      .insert(accounts)
      .values({ personnelCode: 'TCH002', passwordHash: hash, isActive: true })
      .returning();
    teacherBAccountId = tBAcc.id;
    await db.insert(accountRoles).values({ accountId: teacherBAccountId, roleId: teachRole.id });

    const [tBRow] = await db
      .insert(teachers)
      .values({
        accountId: teacherBAccountId,
        firstName: 'Bob',
        lastName: 'Teacher',
        baseRate: '110.00',
        isActive: true,
      })
      .returning();
    teacherBId = tBRow.id;

    // Initialize Nest App
    app = await NestFactory.create(TestTicketsNotificationsModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0);

    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;

    const tokenService = new CryptoSessionTokenService();
    supervisorToken = (await tokenService.generateToken()).rawToken;
    teacherAToken = (await tokenService.generateToken()).rawToken;
    teacherBToken = (await tokenService.generateToken()).rawToken;

    const tokenHashSup = tokenService.hashToken(supervisorToken);
    const tokenHashTA = tokenService.hashToken(teacherAToken);
    const tokenHashTB = tokenService.hashToken(teacherBToken);

    await db.insert(schema.sessions).values([
      {
        accountId: supervisorAccountId,
        tokenHash: tokenHashSup,
        expiresAt: new Date(Date.now() + 86400000),
      },
      {
        accountId: teacherAAccountId,
        tokenHash: tokenHashTA,
        expiresAt: new Date(Date.now() + 86400000),
      },
      {
        accountId: teacherBAccountId,
        tokenHash: tokenHashTB,
        expiresAt: new Date(Date.now() + 86400000),
      },
    ]);
  });

  after(async () => {
    if (app) await app.close();
    if (pg) await pg.close();
  });

  describe('1. Ticket Creation & Validation', () => {
    it('should allow teacher to create a valid ATTENDANCE_CORRECTION ticket with status OPEN', async () => {
      const res = await fetch(`${baseUrl}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
        body: JSON.stringify({
          type: 'ATTENDANCE_CORRECTION',
          title: 'Incorrect absence recorded for John',
          description: 'Student arrived 5 minutes late but was marked absent.',
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.type, 'ATTENDANCE_CORRECTION');
      assert.equal(body.status, 'OPEN');
      assert.equal(body.title, 'Incorrect absence recorded for John');
      assert.equal(body.createdBy, teacherAAccountId);
      assert.equal(body.assignedTo, null);

      // Verify audit log
      const [audit] = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, body.id));
      assert.ok(audit);
      assert.equal(audit.action, 'CREATE_TICKET');
      assert.equal(audit.actorAccountId, teacherAAccountId);

      // Verify notification sent to supervisor
      const [notif] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.recipientAccountId, supervisorAccountId));
      assert.ok(notif);
      assert.equal(notif.type, 'TICKET_CREATED');
      assert.equal(notif.referenceEntityId, body.id);
    });

    it('should reject invalid ticket type or missing fields', async () => {
      const res = await fetch(`${baseUrl}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
        body: JSON.stringify({
          type: 'INVALID_CATEGORY',
          title: 'Test',
          description: 'Test',
        }),
      });

      assert.equal(res.status, 400);
    });

    it('should support creating tickets for all documented categories', async () => {
      const categories = [
        'CLASS_CORRECTION',
        'LESSON_PLAN_ISSUE',
        'SUBSTITUTION_ISSUE',
        'PAYROLL_ISSUE',
        'STUDENT_DATA_CORRECTION',
        'TEACHER_DATA_CORRECTION',
        'SYSTEM_ISSUE',
        'OTHER',
      ];

      for (const cat of categories) {
        const res = await fetch(`${baseUrl}/tickets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${teacherAToken}`,
          },
          body: JSON.stringify({
            type: cat,
            title: `Issue regarding ${cat}`,
            description: `Description for ${cat}`,
          }),
        });

        assert.equal(res.status, 201);
        const data = await res.json();
        assert.equal(data.type, cat);
        assert.equal(data.status, 'OPEN');
      }
    });
  });

  describe('2. Ticket Listing & IDOR Isolation', () => {
    let teacherATicketId: string;
    let teacherBTicketId: string;

    before(async () => {
      // Create a ticket for Teacher A
      const resA = await fetch(`${baseUrl}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
        body: JSON.stringify({
          type: 'SYSTEM_ISSUE',
          title: 'Teacher A Secret Ticket',
          description: 'Confidential inquiry from Teacher A',
        }),
      });
      const dataA = await resA.json();
      teacherATicketId = dataA.id;

      // Create a ticket for Teacher B
      const resB = await fetch(`${baseUrl}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherBToken}`,
        },
        body: JSON.stringify({
          type: 'PAYROLL_ISSUE',
          title: 'Teacher B Secret Ticket',
          description: 'Confidential inquiry from Teacher B',
        }),
      });
      const dataB = await resB.json();
      teacherBTicketId = dataB.id;
    });

    it('should allow Teacher A to only see their own tickets in list', async () => {
      const res = await fetch(`${baseUrl}/tickets`, {
        headers: { Authorization: `Bearer ${teacherAToken}` },
      });

      assert.equal(res.status, 200);
      const list = await res.json();
      assert.ok(list.length > 0);
      for (const t of list) {
        assert.equal(t.createdBy, teacherAAccountId);
      }
      assert.ok(!list.some((t: any) => t.id === teacherBTicketId));
    });

    it('should allow Supervisor to view all tickets from all teachers', async () => {
      const res = await fetch(`${baseUrl}/tickets`, {
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });

      assert.equal(res.status, 200);
      const list = await res.json();
      assert.ok(list.some((t: any) => t.id === teacherATicketId));
      assert.ok(list.some((t: any) => t.id === teacherBTicketId));
    });

    it('should prevent Teacher B from accessing Teacher A’s ticket detail (IDOR protection)', async () => {
      const res = await fetch(`${baseUrl}/tickets/${teacherATicketId}`, {
        headers: { Authorization: `Bearer ${teacherBToken}` },
      });

      assert.equal(res.status, 403);
    });

    it('should allow Teacher A and Supervisor to access Teacher A’s ticket detail', async () => {
      const resA = await fetch(`${baseUrl}/tickets/${teacherATicketId}`, {
        headers: { Authorization: `Bearer ${teacherAToken}` },
      });
      assert.equal(resA.status, 200);

      const resSup = await fetch(`${baseUrl}/tickets/${teacherATicketId}`, {
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.equal(resSup.status, 200);
    });
  });

  describe('3. Ticket Update & Lifecycle State Transitions', () => {
    let ticketId: string;

    before(async () => {
      const res = await fetch(`${baseUrl}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
        body: JSON.stringify({
          type: 'CLASS_CORRECTION',
          title: 'Original Title',
          description: 'Original Description',
        }),
      });
      const data = await res.json();
      ticketId = data.id;
    });

    it('should allow creator to update editable fields while OPEN', async () => {
      const res = await fetch(`${baseUrl}/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
        body: JSON.stringify({
          title: 'Updated Title',
          description: 'Updated Description',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.title, 'Updated Title');
      assert.equal(data.description, 'Updated Description');
    });

    it('should forbid teacher from assigning tickets', async () => {
      const res = await fetch(`${baseUrl}/tickets/${ticketId}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
        body: JSON.stringify({ assignedTo: supervisorAccountId }),
      });

      assert.equal(res.status, 403);
    });

    it('should allow supervisor to assign ticket and transition to IN_PROGRESS', async () => {
      const res = await fetch(`${baseUrl}/tickets/${ticketId}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supervisorToken}`,
        },
        body: JSON.stringify({ assignedTo: supervisorAccountId }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'IN_PROGRESS');
      assert.equal(data.assignedTo, supervisorAccountId);

      // Verify audit log
      const [audit] = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, ticketId))
        .orderBy(schema.auditLogs.createdAt);
      assert.ok(audit);
    });

    it('should forbid teacher from resolving tickets', async () => {
      const res = await fetch(`${baseUrl}/tickets/${ticketId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
        body: JSON.stringify({ resolutionNotes: 'Resolved by teacher' }),
      });

      assert.equal(res.status, 403);
    });

    it('should allow supervisor to resolve ticket (transitions to RESOLVED, sets resolvedAt)', async () => {
      const res = await fetch(`${baseUrl}/tickets/${ticketId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supervisorToken}`,
        },
        body: JSON.stringify({ resolutionNotes: 'Corrected attendance in class record.' }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'RESOLVED');
      assert.ok(data.resolvedAt);
    });

    it('should enforce terminal immutability (cannot resolve, update, or assign an already RESOLVED ticket)', async () => {
      const updateRes = await fetch(`${baseUrl}/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
        body: JSON.stringify({ title: 'New Title' }),
      });
      assert.equal(updateRes.status, 400);

      const assignRes = await fetch(`${baseUrl}/tickets/${ticketId}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supervisorToken}`,
        },
        body: JSON.stringify({ assignedTo: supervisorAccountId }),
      });
      assert.equal(assignRes.status, 400);

      const resolveRes = await fetch(`${baseUrl}/tickets/${ticketId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supervisorToken}`,
        },
        body: JSON.stringify({}),
      });
      assert.equal(resolveRes.status, 400);
    });
  });

  describe('4. Ticket Rejection and Cancellation', () => {
    it('should allow supervisor to reject an open ticket', async () => {
      const createRes = await fetch(`${baseUrl}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
        body: JSON.stringify({
          type: 'PAYROLL_ISSUE',
          title: 'Incorrect rate',
          description: 'Rate inquiry',
        }),
      });
      const ticket = await createRes.json();

      const rejectRes = await fetch(`${baseUrl}/tickets/${ticket.id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supervisorToken}`,
        },
        body: JSON.stringify({ reason: 'Rate conforms to contract policy.' }),
      });

      assert.equal(rejectRes.status, 200);
      const rejected = await rejectRes.json();
      assert.equal(rejected.status, 'REJECTED');
    });

    it('should allow creator to cancel an open ticket', async () => {
      const createRes = await fetch(`${baseUrl}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
        body: JSON.stringify({
          type: 'SYSTEM_ISSUE',
          title: 'Transient error',
          description: 'Browser issue resolved',
        }),
      });
      const ticket = await createRes.json();

      const cancelRes = await fetch(`${baseUrl}/tickets/${ticket.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
        body: JSON.stringify({ reason: 'Self-resolved.' }),
      });

      assert.equal(cancelRes.status, 200);
      const cancelled = await cancelRes.json();
      assert.equal(cancelled.status, 'CANCELLED');
    });

    it('should prevent unrelated teacher from cancelling someone else’s ticket', async () => {
      const createRes = await fetch(`${baseUrl}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
        body: JSON.stringify({
          type: 'OTHER',
          title: 'Another ticket',
          description: 'Desc',
        }),
      });
      const ticket = await createRes.json();

      const cancelRes = await fetch(`${baseUrl}/tickets/${ticket.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherBToken}`,
        },
        body: JSON.stringify({}),
      });

      assert.equal(cancelRes.status, 403);
    });
  });

  describe('5. Ticket Messages', () => {
    let ticketId: string;

    before(async () => {
      const res = await fetch(`${baseUrl}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
        body: JSON.stringify({
          type: 'LESSON_PLAN_ISSUE',
          title: 'Discussion on syllabus item',
          description: 'Clarification needed',
        }),
      });
      const data = await res.json();
      ticketId = data.id;
    });

    it('should allow creator and supervisor to post messages and list them in chronological order', async () => {
      const msg1Res = await fetch(`${baseUrl}/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
        body: JSON.stringify({ body: 'First message from teacher' }),
      });
      assert.equal(msg1Res.status, 201);

      const msg2Res = await fetch(`${baseUrl}/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supervisorToken}`,
        },
        body: JSON.stringify({ body: 'Supervisor reply' }),
      });
      assert.equal(msg2Res.status, 201);

      const listRes = await fetch(`${baseUrl}/tickets/${ticketId}/messages`, {
        headers: { Authorization: `Bearer ${teacherAToken}` },
      });
      assert.equal(listRes.status, 200);
      const messages = await listRes.json();
      assert.equal(messages.length, 2);
      assert.equal(messages[0].body, 'First message from teacher');
      assert.equal(messages[1].body, 'Supervisor reply');
    });

    it('should forbid unrelated teacher from posting messages to another teacher’s ticket', async () => {
      const res = await fetch(`${baseUrl}/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherBToken}`,
        },
        body: JSON.stringify({ body: 'Intruder message' }),
      });

      assert.equal(res.status, 403);
    });
  });

  describe('6. Ticket Attachments', () => {
    let ticketId: string;

    before(async () => {
      const res = await fetch(`${baseUrl}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
        body: JSON.stringify({
          type: 'STUDENT_DATA_CORRECTION',
          title: 'Document verification',
          description: 'Attached proof',
        }),
      });
      const data = await res.json();
      ticketId = data.id;
    });

    it('should allow adding valid attachment metadata (PDF/Images <= 5MB)', async () => {
      const res = await fetch(`${baseUrl}/tickets/${ticketId}/attachments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
        body: JSON.stringify({
          fileName: 'student_document.pdf',
          mimeType: 'application/pdf',
          size: 1024 * 500, // 500 KB
          storageKey: `tickets/${ticketId}/uuid-doc.pdf`,
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.fileName, 'student_document.pdf');
      assert.equal(data.mimeType, 'application/pdf');

      const listRes = await fetch(`${baseUrl}/tickets/${ticketId}/attachments`, {
        headers: { Authorization: `Bearer ${teacherAToken}` },
      });
      assert.equal(listRes.status, 200);
      const list = await listRes.json();
      assert.equal(list.length, 1);
    });

    it('should reject unsupported MIME types and files larger than 5MB', async () => {
      const mimeRes = await fetch(`${baseUrl}/tickets/${ticketId}/attachments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
        body: JSON.stringify({
          fileName: 'malware.exe',
          mimeType: 'application/x-msdownload',
          size: 1024,
          storageKey: 'key',
        }),
      });
      assert.equal(mimeRes.status, 400);

      const sizeRes = await fetch(`${baseUrl}/tickets/${ticketId}/attachments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
        body: JSON.stringify({
          fileName: 'huge_file.pdf',
          mimeType: 'application/pdf',
          size: 6 * 1024 * 1024, // 6 MB > 5 MB limit
          storageKey: 'key',
        }),
      });
      assert.equal(sizeRes.status, 400);
    });
  });

  describe('7. Notifications & Notification Center', () => {
    let notifId: string;

    before(async () => {
      const [inserted] = await db
        .insert(notifications)
        .values([
          {
            recipientAccountId: teacherAAccountId,
            type: 'TICKET_UPDATED',
            title: 'Ticket #1 updated',
            message: 'Your ticket has been updated',
            isRead: false,
          },
          {
            recipientAccountId: teacherAAccountId,
            type: 'LESSON_PLAN_RESULT',
            title: 'Lesson plan approved',
            message: 'Your lesson plan was approved',
            isRead: false,
          },
          {
            recipientAccountId: teacherBAccountId,
            type: 'SUBSTITUTION_REQUEST',
            title: 'Substitution request',
            message: 'New session available',
            isRead: false,
          },
        ])
        .returning();
      notifId = inserted.id;
    });

    it('should list notifications for current user with accurate unread count', async () => {
      const res = await fetch(`${baseUrl}/notifications`, {
        headers: { Authorization: `Bearer ${teacherAToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.data.length >= 2);
      assert.ok(data.unreadCount >= 2);
      // Verify isolation: Teacher A should not receive Teacher B's notifications
      assert.ok(!data.data.some((n: any) => n.recipientAccountId === teacherBAccountId));
    });

    it('should mark a specific notification as read', async () => {
      const res = await fetch(`${baseUrl}/notifications/${notifId}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${teacherAToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.isRead, true);
      assert.ok(data.readAt);
    });

    it('should prevent Teacher B from marking Teacher A’s notification as read (IDOR protection)', async () => {
      const res = await fetch(`${baseUrl}/notifications/${notifId}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${teacherBToken}` },
      });

      assert.equal(res.status, 403);
    });

    it('should mark all unread notifications as read for current user', async () => {
      const res = await fetch(`${baseUrl}/notifications/read-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teacherAToken}` },
      });

      assert.equal(res.status, 200);

      const listRes = await fetch(`${baseUrl}/notifications`, {
        headers: { Authorization: `Bearer ${teacherAToken}` },
      });
      const data = await listRes.json();
      assert.equal(data.unreadCount, 0);

      // Verify Teacher B still has unread notifications
      const listBRes = await fetch(`${baseUrl}/notifications`, {
        headers: { Authorization: `Bearer ${teacherBToken}` },
      });
      const dataB = await listBRes.json();
      assert.ok(dataB.unreadCount > 0);
    });
  });
});
