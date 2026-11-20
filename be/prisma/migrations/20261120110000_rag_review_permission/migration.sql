-- rag-train-6: review saved chat bot turns and export approved examples (/api/rag/review, /api/rag/examples/export)
INSERT INTO "permissions" ("code", "description") VALUES ('rag.review', 'Review saved chat bot answers and export training examples');

INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'admin', p.id FROM "permissions" p WHERE p.code = 'rag.review';
