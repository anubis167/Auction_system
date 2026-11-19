import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('rag-2.4: admin chatbox RAG document management', () => {
  test('admin navigates to chatbot knowledge page, sees upload form and handles >10MB notification', async ({ page }) => {
    // Intercept /api/docs calls so the e2e test runs deterministically
    let mockDocs = [
      {
        id: 1,
        title: 'Platform Business Rules',
        filename: 'business_rules.md',
        sizeBytes: 15420,
        createdAt: new Date().toISOString(),
        chunks: 4,
      },
    ];

    await page.route('**/api/docs', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ documents: mockDocs }),
        });
      } else if (method === 'POST') {
        const newDoc = {
          id: 2,
          title: 'Auction License & Policies',
          filename: 'auction_license.txt',
          sizeBytes: 4200,
          createdAt: new Date().toISOString(),
          chunks: 2,
        };
        mockDocs.push(newDoc);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 2, title: newDoc.title, chunks: 2 }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/docs/*', async (route) => {
      if (route.request().method() === 'DELETE') {
        const id = Number(route.request().url().split('/').pop());
        mockDocs = mockDocs.filter((d) => d.id !== id);
        await route.fulfill({ status: 204 });
      } else {
        await route.continue();
      }
    });

    // 1. Admin login
    await login(page, 'admin');

    // 2. Admin header navigation link (Req-4)
    const chatbotLink = page.locator('header nav').getByRole('link', { name: 'Chatbot' });
    await expect(chatbotLink).toBeVisible();
    await chatbotLink.click();
    await expect(page).toHaveURL(/\/admin\/rag$/);

    // 3. Verify page content and uploaded documents table
    await expect(page.getByTestId('admin-rag-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Chatbot Knowledge Documents' })).toBeVisible();

    const table = page.getByTestId('rag-documents-table');
    await expect(table).toBeVisible();
    await expect(page.getByTestId('rag-doc-row-1')).toContainText('Platform Business Rules');
    await expect(page.getByTestId('rag-doc-row-1')).toContainText('4 chunks');

    // 4. Test > 10 MB file rejection with notification (Req-1, Req-2)
    // Create a virtual file > 10 MB (10.5 MB)
    const oversizedBuffer = Buffer.alloc(10.5 * 1024 * 1024, 'a');
    await page.getByTestId('rag-file-input').setInputFiles({
      name: 'oversized_document.txt',
      mimeType: 'text/plain',
      buffer: oversizedBuffer,
    });

    // Small notification toast should appear and form error banner displayed
    await expect(page.locator('.toast-error')).toContainText('File exceeds the 10 MB limit');
    await expect(page.getByTestId('rag-upload-error')).toContainText('File exceeds the 10 MB limit');

    // 5. Test valid upload (< 10 MB)
    const validBuffer = Buffer.from('Auction license details, business rules, and tonal instructions.');
    await page.getByTestId('rag-file-input').setInputFiles({
      name: 'auction_license.txt',
      mimeType: 'text/plain',
      buffer: validBuffer,
    });
    await page.getByTestId('rag-title-input').fill('Auction License & Policies');
    await page.getByTestId('rag-upload-submit').click();

    // Verify success toast and new row in table
    await expect(page.locator('.toast-success')).toContainText('Document uploaded and chunked successfully');
    await expect(page.getByTestId('rag-doc-row-2')).toBeVisible();
    await expect(page.getByTestId('rag-doc-row-2')).toContainText('Auction License & Policies');
    await expect(page.getByTestId('rag-doc-row-2')).toContainText('2 chunks');

    // 6. Test soft delete
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByTestId('rag-delete-btn-1').click();
    await expect(page.locator('.toast-success')).toContainText('Document deleted');
    await expect(page.getByTestId('rag-doc-row-1')).toHaveCount(0);
  });

  test('customer does not see Chatbot link in header and cannot access /admin/rag', async ({ page }) => {
    await login(page, 'alice');
    await expect(page.locator('header nav').getByRole('link', { name: 'Chatbot' })).toHaveCount(0);

    // Direct navigation attempt
    await page.goto('/admin/rag');
    // Unauthorized / redirected away from admin rag
    await expect(page.getByTestId('admin-rag-page')).toHaveCount(0);
  });
});
