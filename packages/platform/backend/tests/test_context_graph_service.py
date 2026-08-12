from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from app.services.ceda_service import CEDAService
from app.services.context_graph_service import ContextGraphService


class ContextGraphServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = TemporaryDirectory()
        self.ceda = CEDAService(Path(self.temporary.name) / "Student-LAD-Workspace")
        self.graph = ContextGraphService(self.ceda)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _context_object(self, user_id: int, text: str, event_id: str) -> str:
        event = self.ceda.observe_event(user_id, "UserMessageObserved", {"text": text}, "test", event_id=event_id)
        self.assertIsNotNone(event["candidate"])
        return self.ceda.decide(user_id, event["candidate"]["id"], True)["context_object_id"]

    def test_default_relationship_definitions_and_architecture_policies_exist(self) -> None:
        definitions = {item["relationship_type"] for item in self.graph.relationship_definitions()}
        policies = {item["policy_key"] for item in self.graph.architecture_policies()}

        self.assertIn("depends_on", definitions)
        self.assertIn("governed_by_policy", definitions)
        self.assertIn("stable_unique_ids_required", policies)
        self.assertIn("relationship_definitions_required", policies)
        self.assertIn("audit_all_record_changes", policies)

    def test_record_registration_requires_stable_unique_id_and_logs_change(self) -> None:
        rejected = self.graph.validate_record_architecture(1, "assignment", "bad id with spaces", "assignments")
        self.assertFalse(rejected["allowed"])

        record = self.graph.register_record(1, "assignment", "ASSIGN-STAT-002", "academic_assignments", source_module="test")
        self.assertEqual(record["record_id"], "ASSIGN-STAT-002")
        changes = self.graph.record_changes(1, "assignment", "ASSIGN-STAT-002")
        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0]["action"], "register_record")

    def test_relationship_creation_is_idempotent_and_policy_checked(self) -> None:
        self.graph.register_record(2, "course", "COURSE-STAT-101", "courses")
        self.graph.register_record(2, "assignment", "ASSIGN-STAT-002", "assignments")

        first = self.graph.create_relationship(2, "course", "COURSE-STAT-101", "has_assignment", "assignment", "ASSIGN-STAT-002", metadata={"source": "syllabus"})
        replay = self.graph.create_relationship(2, "course", "COURSE-STAT-101", "has_assignment", "assignment", "ASSIGN-STAT-002", metadata={"source": "syllabus"})

        self.assertFalse(first["idempotent_replay"])
        self.assertTrue(replay["idempotent_replay"])
        self.assertEqual(first["relationship_id"], replay["relationship_id"])
        self.assertEqual(first["metadata"], {"source": "syllabus"})

        neighbors = self.graph.get_neighbors(2, "course", "COURSE-STAT-101")
        self.assertEqual(neighbors["neighbors"], [{"type": "assignment", "id": "ASSIGN-STAT-002", "direction": "outbound"}])

    def test_graph_related_dependencies_and_impact(self) -> None:
        for record_type, record_id, table in (
            ("course", "COURSE-STAT-101", "courses"),
            ("assignment", "ASSIGN-STAT-002", "assignments"),
            ("document", "DOC-SYLLABUS-001", "documents"),
            ("reminder", "REM-JUL20", "reminders"),
            ("policy", "POL-ACADEMIC", "policies"),
        ):
            self.graph.register_record(3, record_type, record_id, table)
        self.graph.create_relationship(3, "course", "COURSE-STAT-101", "has_assignment", "assignment", "ASSIGN-STAT-002")
        self.graph.create_relationship(3, "assignment", "ASSIGN-STAT-002", "sourced_from", "document", "DOC-SYLLABUS-001")
        self.graph.create_relationship(3, "assignment", "ASSIGN-STAT-002", "has_deadline", "reminder", "REM-JUL20")
        self.graph.create_relationship(3, "assignment", "ASSIGN-STAT-002", "governed_by_policy", "policy", "POL-ACADEMIC")

        related = self.graph.get_related(3, "course", "COURSE-STAT-101", depth=2)
        self.assertIn({"type": "assignment", "id": "ASSIGN-STAT-002", "depth": 1}, related["nodes"])
        self.assertIn({"type": "reminder", "id": "REM-JUL20", "depth": 2}, related["nodes"])

        dependencies = self.graph.get_dependencies(3, "assignment", "ASSIGN-STAT-002")
        dependency_ids = {item["id"] for item in dependencies["dependencies"]}
        self.assertEqual(dependency_ids, {"DOC-SYLLABUS-001", "REM-JUL20"})

        impact = self.graph.get_impact(3, "policy", "POL-ACADEMIC")
        self.assertEqual(impact["impacted"][0]["id"], "ASSIGN-STAT-002")

    def test_context_objects_can_be_relationship_nodes_and_are_user_isolated(self) -> None:
        assignment = self._context_object(4, "Remember Statistics Assignment 2 is due July 20", "graph-event-1")
        exam = self._context_object(4, "Remember Statistics Exam is due July 30", "graph-event-2")

        relation = self.graph.create_relationship(4, "context_object", assignment, "depends_on", "context_object", exam)
        self.assertEqual(relation["source_id"], assignment)
        self.assertEqual(len(self.graph.get_neighbors(4, "context_object", assignment)["relationships"]), 1)

        with self.assertRaises(ValueError):
            self.graph.create_relationship(5, "context_object", assignment, "depends_on", "context_object", exam)

    def test_undefined_relationship_type_is_rejected(self) -> None:
        self.graph.register_record(6, "course", "COURSE-STAT-101", "courses")
        self.graph.register_record(6, "assignment", "ASSIGN-STAT-002", "assignments")
        with self.assertRaises(ValueError):
            self.graph.create_relationship(6, "course", "COURSE-STAT-101", "invented_by_llm", "assignment", "ASSIGN-STAT-002")


if __name__ == "__main__":
    unittest.main()
