import { useEffect, useState, type FormEvent, type ChangeEvent } from 'react';
import { api, toApiError } from '../api';
import { useToast } from '../toast';

export interface KnowledgeDocument {
  id: number;
  title: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  chunks: number;
}

export const MAX_DOC_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit (Req-1)

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function AdminRagPage() {
  const toast = useToast();
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api<{ documents: KnowledgeDocument[] }>('/docs');
      setDocuments(data.documents || []);
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    if (!selected) {
      setFile(null);
      return;
    }

    // Req-2: If documents bigger (<10mb), send small notification
    if (selected.size >= MAX_DOC_SIZE_BYTES) {
      toast('File exceeds the 10 MB limit', 'error');
      setError('File exceeds the 10 MB limit');
      e.target.value = '';
      setFile(null);
      return;
    }

    const ext = selected.name.toLowerCase().slice(selected.name.lastIndexOf('.'));
    if (ext !== '.txt' && ext !== '.md') {
      toast('Please select a .txt or .md file', 'error');
      setError('Please select a .txt or .md file');
      e.target.value = '';
      setFile(null);
      return;
    }

    setError('');
    setFile(selected);
  };

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please choose a file to upload');
      return;
    }

    if (file.size >= MAX_DOC_SIZE_BYTES) {
      toast('File exceeds the 10 MB limit', 'error');
      setError('File exceeds the 10 MB limit');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    if (title.trim()) {
      formData.append('title', title.trim());
    }

    try {
      setUploading(true);
      setError('');
      await api('/docs', {
        method: 'POST',
        body: formData,
      });
      toast('Document uploaded and chunked successfully', 'success');
      setFile(null);
      setTitle('');
      // Reset input element
      const input = document.getElementById('rag-file-input') as HTMLInputElement | null;
      if (input) input.value = '';
      await loadDocuments();
    } catch (err) {
      const apiErr = toApiError(err);
      toast(apiErr.message, 'error');
      setError(apiErr.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: KnowledgeDocument) => {
    if (!window.confirm(`Delete document "${doc.title}"?`)) return;

    try {
      await api(`/docs/${doc.id}`, { method: 'DELETE' });
      toast('Document deleted', 'success');
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      const apiErr = toApiError(err);
      toast(apiErr.message, 'error');
    }
  };

  return (
    <div className="admin-rag-page" data-testid="admin-rag-page">
      <div className="row spread mb-4">
        <div>
          <h1>Chatbot Knowledge Documents</h1>
          <p className="text-muted">
            Manage RAG documents (tonal guidelines, business rules, auction licenses, and policies) for the Gemini chat assistant.
          </p>
        </div>
      </div>

      <div className="card mb-6 p-4">
        <h2>Upload Document</h2>
        <p className="text-sm text-muted mb-4">
          Upload UTF-8 text (.txt, .md) under 10 MB. Documents are chunked and embedded before saving to the database.
        </p>

        {error && (
          <div className="banner banner-error mb-4" role="alert" data-testid="rag-upload-error">
            {error}
          </div>
        )}

        <form onSubmit={handleUpload} className="rag-upload-form" data-testid="rag-upload-form">
          <div className="form-group mb-3">
            <label htmlFor="rag-file-input" className="label">
              File (.txt or .md, &lt; 10 MB)
            </label>
            <input
              id="rag-file-input"
              type="file"
              accept=".txt,.md"
              onChange={handleFileChange}
              disabled={uploading}
              data-testid="rag-file-input"
              className="input-file"
            />
          </div>

          <div className="form-group mb-3">
            <label htmlFor="rag-title-input" className="label">
              Title (optional, defaults to filename)
            </label>
            <input
              id="rag-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Auction Bidding Rules & Licenses"
              disabled={uploading}
              maxLength={255}
              data-testid="rag-title-input"
              className="input"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={!file || uploading}
            data-testid="rag-upload-submit"
          >
            {uploading ? 'Processing & Chunking...' : 'Upload Document'}
          </button>
        </form>
      </div>

      <div className="card p-4">
        <h2>Uploaded Documents</h2>
        {loading ? (
          <p className="text-muted" data-testid="rag-loading">Loading documents...</p>
        ) : documents.length === 0 ? (
          <p className="text-muted" data-testid="rag-empty">No knowledge documents uploaded yet.</p>
        ) : (
          <div className="table-responsive">
            <table className="table" data-testid="rag-documents-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Filename</th>
                  <th>Size</th>
                  <th>Chunks</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} data-testid={`rag-doc-row-${doc.id}`}>
                    <td className="font-semibold">{doc.title}</td>
                    <td>{doc.filename}</td>
                    <td>{formatBytes(doc.sizeBytes)}</td>
                    <td>
                      <span className="ui-pill ui-pill-steel">{doc.chunks} chunks</span>
                    </td>
                    <td>{new Date(doc.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(doc)}
                        data-testid={`rag-delete-btn-${doc.id}`}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
