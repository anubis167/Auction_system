-- rag2-1.1: staff and admin manage the documents the chat bot answers from (/api/rag/documents)
INSERT INTO "permissions" ("code", "description") VALUES ('knowledge.manage', 'Upload and delete documents the chat bot answers from');

INSERT INTO "role_permissions" ("role", "permission_id")
SELECT r.role, p.id FROM "permissions" p
JOIN (VALUES ('staff', 'knowledge.manage'), ('admin', 'knowledge.manage')) AS r(role, code) ON r.code = p.code;
