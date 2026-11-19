"""rag-1.4 / rag2-1.5: check an uploaded document before anything is sent anywhere."""
import os

DOC_MAX_BYTES = 10 * 1024 * 1024
DOC_TYPES = {".txt": "text/plain", ".md": "text/markdown"}


class UploadError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def read_upload(file):
    """(filename, mime_type, text) of a Flask upload: .txt/.md, at most 10 MB, UTF-8. Raises UploadError."""
    filename = os.path.basename(file.filename or "") if file else ""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in DOC_TYPES:
        raise UploadError("Choose a .txt or .md file")
    data = file.read(DOC_MAX_BYTES + 1)
    if len(data) > DOC_MAX_BYTES:
        raise UploadError("The file is larger than 10 MB", 413)
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise UploadError("The file must be UTF-8 text") from None
    return filename[:255], DOC_TYPES[ext], text
