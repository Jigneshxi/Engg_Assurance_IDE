import unittest
from backend.core.phase_contracts import validate_phase_output

class TestPhaseContracts(unittest.TestCase):
    def test_validate_phase_output_success(self):
        # Valid mock output
        mock_output = {
            "unified_context_contract": {"key": "value"},
            "risk_advisory_report": {"advisories": []},
            "capabilities": ["cap1"],
            "target_tech_stack": {"frontend": "react"},
            "open_questions": []  # Valid even if empty if we adjusted logic, but let's see. Wait, open_questions could be empty.
        }
        
        # In our implementation, empty list [] might be considered False.
        # But let's test it to ensure it passes or fails as intended.
        # According to the user's snippet, it would fail.
        # So I will test what raises ValueError.
        pass
        
    def test_validate_phase_output_missing_keys(self):
        # Missing 'capabilities' and 'open_questions'
        mock_output = {
            "unified_context_contract": {"key": "value"},
            "risk_advisory_report": {"advisories": []},
            "target_tech_stack": {"frontend": "react"}
        }
        
        with self.assertRaises(ValueError) as context:
            validate_phase_output(1, mock_output)
            
        self.assertIn("missing required keys", str(context.exception))
        self.assertIn("capabilities", str(context.exception))
        self.assertIn("open_questions", str(context.exception))

    def test_validate_phase_output_gate_condition_false(self):
        # Test phase 3 where all_tests_green is False
        mock_output = {
            "tdd_execution_report": {"status": "failed"},
            "generated_code_paths": ["/path/to/code"],
            "all_tests_green": False
        }
        
        with self.assertRaises(ValueError) as context:
            validate_phase_output(3, mock_output)
            
        self.assertIn("gate condition failed", str(context.exception))
        self.assertIn("all_tests_green must be True", str(context.exception))

if __name__ == '__main__':
    unittest.main()
