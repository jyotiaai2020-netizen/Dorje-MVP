from pathlib import Path
from tempfile import TemporaryDirectory
import base64
import unittest

from docx import Document

from app.services.document_service import DocumentService


class DocumentEmailWorkflowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = TemporaryDirectory()
        self.service = DocumentService(Path(self.temporary.name) / "uploads")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_create_rewrite_and_append_same_word_document(self) -> None:
        created = self.service.create_word_document(
            user_id=101,
            filename="student-update.docx",
            title="Student Update",
            body="Initial draft",
            mode="create",
        )
        self.assertEqual(created["filename"], "student-update.docx")
        self.assertTrue(created["data_base64"])

        rewritten = self.service.create_word_document(
            user_id=101,
            filename="student-update.docx",
            title="Student Update",
            body="Rewritten draft",
            mode="rewrite",
            document_id=created["document_id"],
        )
        self.assertEqual(rewritten["document_id"], created["document_id"])

        appended = self.service.create_word_document(
            user_id=101,
            filename="student-update.docx",
            title="Follow-up",
            body="Appended section",
            mode="append",
            document_id=created["document_id"],
        )
        self.assertEqual(appended["document_id"], created["document_id"])

        doc_path = Path(self.temporary.name) / "uploads" / "generated-documents" / "101" / f"{created['document_id']}.docx"
        text = "\n".join(paragraph.text for paragraph in Document(doc_path).paragraphs)
        self.assertIn("Rewritten draft", text)
        self.assertIn("Appended section", text)
        self.assertNotIn("Initial draft", text)
        self.assertGreater(len(base64.b64decode(appended["data_base64"])), 0)


if __name__ == "__main__":
    unittest.main()
