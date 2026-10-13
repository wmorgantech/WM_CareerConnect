import { Router } from "express";
import { z } from "zod";

import { getAuditActor, writeAudit, type AuditActor } from "../../lib/audit.js";
import { HttpError } from "../../lib/http-error.js";
import { asAuditDb, rdb } from "../../lib/recruitment-db.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";

type Row = Record<string, any>;

const router = Router();
const guard = [authenticate, requirePermission("users.manage")];
const idSchema = z.object({ id: z.string().uuid("Invalid user ID") });
const bodySchema = z.object({ collegeIds: z.array(z.string().uuid()).max(100) });

async function scopedUser(id: string): Promise<Row> {
  const user: Row | null = await rdb().user.findFirst({ where: { id } });

  if (!user) throw new HttpError(404, "USER_NOT_FOUND", "User not found");

  return user;
}

async function listFor(userId: string) {
  const links: Row[] = await rdb().userCollege.findMany({ where: { userId } });
  const colleges: Row[] = links.length
    ? await rdb().college.findMany({ where: { id: { in: links.map((l) => l.collegeId) } } })
    : [];

  return links.map((l) => ({
    collegeId: l.collegeId,
    name: colleges.find((c) => c.id === l.collegeId)?.name ?? null,
  }));
}

router.get("/:id/colleges", ...guard, async (req, res) => {
  const { id } = idSchema.parse(req.params);

  await scopedUser(id);

  return res.status(200).json({ success: true, data: await listFor(id) });
});

router.put("/:id/colleges", ...guard, async (req, res) => {
  const { id } = idSchema.parse(req.params);
  const { collegeIds } = bodySchema.parse(req.body);
  const unique = [...new Set(collegeIds)];
  const db = rdb();
  const actor: AuditActor = getAuditActor(req);
  const withRole: Row | null = await db.user.findFirst({
    where: { id, userRoles: { some: { role: { name: "HOD" } } } },
  });
  const withStaff: Row | null = withRole
    ? null
    : await db.user.findFirst({ where: { id, userRoles: { some: { role: { name: "STAFF" } } } } });

  await scopedUser(id);

  if (!withRole && !withStaff) {
    throw new HttpError(400, "NOT_COLLEGE_SCOPED", "Only HOD and STAFF accounts have a college scope");
  }

  // Colleges the account already has stay valid even if they have since been deactivated, so an admin can
  // keep or remove them. Every college being added must still exist and be active.
  const current: Row[] = await db.userCollege.findMany({ where: { userId: id } });
  const kept = new Set(current.map((link) => link.collegeId as string));
  const added = unique.filter((collegeId) => !kept.has(collegeId));
  const found: Row[] = added.length
    ? await db.college.findMany({ where: { id: { in: added }, deletedAt: null, isActive: true } })
    : [];

  if (found.length !== added.length) {
    throw new HttpError(400, "COLLEGE_NOT_FOUND", "One or more colleges do not exist or are inactive");
  }

  await db.$transaction(async (tx) => {
    await tx.userCollege.deleteMany({ where: { userId: id } });

    if (unique.length) {
      await tx.userCollege.createMany({ data: unique.map((collegeId) => ({ userId: id, collegeId })) });
    }

    await writeAudit(asAuditDb(tx), actor, {
      action: "USER_COLLEGES_UPDATED",
      entity: "User",
      entityId: id,
      details: { colleges: unique.length },
    });
  });

  return res.status(200).json({ success: true, data: await listFor(id) });
});

export default router;
