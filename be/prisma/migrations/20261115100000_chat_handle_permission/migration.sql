-- sch-1.5: staff and admin answer chats handed off by the bot
INSERT INTO "permissions" ("code", "description") VALUES ('chat.handle', 'Answer customer chats handed off by the bot');

INSERT INTO "role_permissions" ("role", "permission_id")
SELECT r.role, p.id FROM "permissions" p
JOIN (VALUES ('staff', 'chat.handle'), ('admin', 'chat.handle')) AS r(role, code) ON r.code = p.code;
