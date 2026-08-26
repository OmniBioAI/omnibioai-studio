import ast
from pathlib import Path


CONFTEST = Path(__file__).parent / "integration" / "conftest.py"
CREDENTIAL_NAMES = {
    "AUTH_ADMIN_EMAIL",
    "AUTH_ADMIN_PASSWORD",
    "LIMS_USERNAME",
    "LIMS_PASSWORD",
    "RAGBIO_API_KEY",
}


def test_integration_credentials_have_no_nonempty_literal_defaults():
    tree = ast.parse(CONFTEST.read_text(encoding="utf-8"))
    assignments = {
        node.targets[0].id: node.value
        for node in tree.body
        if isinstance(node, ast.Assign)
        and isinstance(node.targets[0], ast.Name)
        and node.targets[0].id in CREDENTIAL_NAMES
    }

    assert assignments.keys() == CREDENTIAL_NAMES
    for value in assignments.values():
        assert isinstance(value, ast.Call)
        assert isinstance(value.func, ast.Attribute)
        assert value.func.attr == "getenv"
        assert len(value.args) == 2
        assert isinstance(value.args[1], ast.Constant)
        assert value.args[1].value == ""
