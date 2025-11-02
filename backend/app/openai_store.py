"""Storage helpers that persist ChatKit attachments to an OpenAI vector store."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from io import BytesIO
from typing import Any

from chatkit.store import AttachmentStore, NotFoundError
from chatkit.types import Attachment, AttachmentCreateParams, FileAttachment
from openai import OpenAI

from .memory_store import MemoryStore

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class _AttachmentRecord:
    """Book-keeping record for an uploaded attachment."""

    attachment: FileAttachment
    size: int
    vector_file_id: str | None = None


class _AttachmentRegistry:
    """Thread-safe in-memory registry of attachment metadata."""

    def __init__(self) -> None:
        self._records: dict[str, _AttachmentRecord] = {}
        self._lock = asyncio.Lock()

    async def register(self, attachment: FileAttachment, size: int) -> None:
        async with self._lock:
            self._records[attachment.id] = _AttachmentRecord(
                attachment=attachment,
                size=size,
            )

    async def ensure(self, attachment: FileAttachment) -> None:
        async with self._lock:
            record = self._records.get(attachment.id)
            if record is None:
                self._records[attachment.id] = _AttachmentRecord(
                    attachment=attachment,
                    size=0,
                )
            else:
                record.attachment = attachment

    async def get_for_upload(self, attachment_id: str) -> tuple[str, str, int]:
        async with self._lock:
            record = self._records.get(attachment_id)
            if record is None:
                raise NotFoundError(f"Attachment {attachment_id} not found")
            if record.vector_file_id is not None:
                raise NotFoundError(
                    f"Attachment {attachment_id} has already been uploaded"
                )
            return record.attachment.name, record.attachment.mime_type, record.size

    async def mark_uploaded(
        self,
        attachment_id: str,
        vector_file_id: str,
        size: int | None,
    ) -> FileAttachment:
        async with self._lock:
            record = self._records.get(attachment_id)
            if record is None:
                raise NotFoundError(f"Attachment {attachment_id} not found")
            record.vector_file_id = vector_file_id
            if size is not None:
                record.size = size
            record.attachment = FileAttachment(
                id=record.attachment.id,
                name=record.attachment.name,
                mime_type=record.attachment.mime_type,
                upload_url=None,
            )
            return record.attachment.model_copy(deep=True)

    async def get(self, attachment_id: str) -> FileAttachment:
        async with self._lock:
            record = self._records.get(attachment_id)
            if record is None:
                raise NotFoundError(f"Attachment {attachment_id} not found")
            return record.attachment.model_copy(deep=True)

    async def pop(self, attachment_id: str) -> _AttachmentRecord | None:
        async with self._lock:
            return self._records.pop(attachment_id, None)

    async def vector_file_id(self, attachment_id: str) -> str | None:
        async with self._lock:
            record = self._records.get(attachment_id)
            if record is None:
                raise NotFoundError(f"Attachment {attachment_id} not found")
            return record.vector_file_id


class OpenAIVectorAttachmentStore(AttachmentStore[dict[str, Any]]):
    """Attachment store that uploads files to an OpenAI vector store."""

    def __init__(
        self,
        *,
        vector_store_id: str,
        registry: _AttachmentRegistry,
        client: OpenAI | None = None,
    ) -> None:
        if not vector_store_id:
            raise ValueError("vector_store_id must be provided to enable attachments")
        self._vector_store_id = vector_store_id
        self._registry = registry
        self._client = client or OpenAI()

    def _build_upload_url(
        self, attachment_id: str, context: dict[str, Any]
    ) -> str:
        request = context.get("request")
        if request is None:
            raise RuntimeError("Request context is required to generate an upload URL")
        try:
            return str(request.url_for("upload_attachment", attachment_id=attachment_id))
        except Exception:  # pragma: no cover - fallback for non-FastAPI contexts
            base_url = str(getattr(request, "base_url", "")).rstrip("/")
            return f"{base_url}/attachments/{attachment_id}"

    async def create_attachment(
        self, input: AttachmentCreateParams, context: dict[str, Any]
    ) -> FileAttachment:
        attachment_id = self.generate_attachment_id(input.mime_type, context)
        upload_url = self._build_upload_url(attachment_id, context)
        attachment = FileAttachment(
            id=attachment_id,
            name=input.name,
            mime_type=input.mime_type,
            upload_url=upload_url,
        )
        await self._registry.register(attachment, input.size)
        return attachment

    async def upload_attachment(
        self, attachment_id: str, data: bytes, *, mime_type: str | None = None
    ) -> FileAttachment:
        name, expected_mime, expected_size = await self._registry.get_for_upload(
            attachment_id
        )
        content_type = mime_type or expected_mime or "application/octet-stream"

        if expected_size and len(data) != expected_size:
            logger.warning(
                "Attachment %s size mismatch: expected %s bytes, received %s bytes",
                attachment_id,
                expected_size,
                len(data),
            )

        stream = BytesIO(data)
        stream.name = name  # type: ignore[attr-defined]

        vector_file = await asyncio.to_thread(
            self._client.vector_stores.files.upload_and_poll,
            vector_store_id=self._vector_store_id,
            file=(name, stream, content_type),
        )

        size_bytes = getattr(vector_file, "size_bytes", None)
        return await self._registry.mark_uploaded(
            attachment_id,
            vector_file.id,
            size_bytes,
        )

    async def delete_attachment(self, attachment_id: str, context: dict[str, Any]) -> None:
        record = await self._registry.pop(attachment_id)
        if record is None or record.vector_file_id is None:
            return

        try:
            await asyncio.to_thread(
                self._client.vector_stores.files.delete,
                vector_store_id=self._vector_store_id,
                file_id=record.vector_file_id,
            )
        except Exception:  # pragma: no cover - defensive logging
            logger.exception(
                "Failed to delete vector store file %s", record.vector_file_id
            )


class OpenAIStore(MemoryStore):
    """Memory-backed ChatKit store with OpenAI vector-store attachment support."""

    def __init__(self, vector_store_id: str, *, client: OpenAI | None = None) -> None:
        super().__init__()
        self._client = client or OpenAI()
        self._vector_store_id = vector_store_id
        self._attachments = _AttachmentRegistry()
        self.attachment_store = OpenAIVectorAttachmentStore(
            vector_store_id=vector_store_id,
            registry=self._attachments,
            client=self._client,
        )

    @staticmethod
    def _coerce_file_attachment(attachment: Attachment) -> FileAttachment:
        if isinstance(attachment, FileAttachment):
            return attachment
        raise TypeError(
            "Only file attachments are supported by the OpenAIStore implementation"
        )

    async def save_attachment(
        self, attachment: Attachment, context: dict[str, Any]
    ) -> None:
        file_attachment = self._coerce_file_attachment(attachment)
        await self._attachments.ensure(file_attachment)

    async def load_attachment(
        self, attachment_id: str, context: dict[str, Any]
    ) -> FileAttachment:
        return await self._attachments.get(attachment_id)

    async def delete_attachment(self, attachment_id: str, context: dict[str, Any]) -> None:
        await self._attachments.pop(attachment_id)

    async def get_vector_file_id(self, attachment_id: str) -> str:
        file_id = await self._attachments.vector_file_id(attachment_id)
        if not file_id:
            raise NotFoundError(
                f"Attachment {attachment_id} has not been uploaded to the vector store"
            )
        return file_id


__all__ = ["OpenAIStore", "OpenAIVectorAttachmentStore"]
