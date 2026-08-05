"""
test_org_switching.py — proves "organization switching" against the live
auth service (port 8001).

Background
----------
There is no token-level "switch active org" endpoint in omnibioai-auth --
by design. Authorization is re-derived from the database on every request,
keyed off the {org_id} in the URL path (app/rbac.py's
get_org_membership_or_platform_admin), never trusted from whatever org_id
happens to be baked into the caller's JWT (the auth repo's own
tests/test_jwt_org_context.py::test_jwt_org_id_claim_does_not_grant_cross_org_access
covers this at the unit level). So "switching org" for an already
logged-in, multi-org user is just: call a different {org_id} in the path
with the SAME access token, and get a real per-request DB check back.

org_service.create_organization() makes the creator an org_admin member of
whatever org they create (app/services/org_service.py), so two POST /orgs
calls by the same user are enough to set up multi-org membership -- no
/orgs/{id}/invite round trip needed.
"""

import uuid

import requests

from conftest import AUTH_DIRECT_URL, TIMEOUT

BASE = AUTH_DIRECT_URL


def _register_and_login() -> dict:
    email = f"itest-orgswitch-{uuid.uuid4().hex}@example.com"
    password = "S3curePass!"

    reg = requests.post(f"{BASE}/auth/register", json={"email": email, "password": password}, timeout=TIMEOUT)
    assert reg.status_code == 200, f"setup: register failed: {reg.text}"

    login = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=TIMEOUT)
    assert login.status_code == 200, f"setup: login failed: {login.text}"
    return login.json()


def _headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


def _create_org(access_token: str) -> dict:
    slug = f"itest-org-{uuid.uuid4().hex[:12]}"
    r = requests.post(
        f"{BASE}/orgs",
        json={"name": slug, "slug": slug},
        headers=_headers(access_token),
        timeout=TIMEOUT,
    )
    assert r.status_code == 201, f"setup: create_org failed: {r.text}"
    return r.json()


class TestMultiOrgUserCanActOnEachOwnOrg:
    def test_user_can_get_first_org_they_created(self):
        tokens = _register_and_login()
        org_a = _create_org(tokens["access_token"])

        r = requests.get(f"{BASE}/orgs/{org_a['id']}", headers=_headers(tokens["access_token"]), timeout=TIMEOUT)
        assert r.status_code == 200
        assert r.json()["id"] == org_a["id"]

    def test_same_token_can_act_on_a_second_org_too(self):
        tokens = _register_and_login()
        org_a = _create_org(tokens["access_token"])
        org_b = _create_org(tokens["access_token"])

        r_a = requests.get(f"{BASE}/orgs/{org_a['id']}", headers=_headers(tokens["access_token"]), timeout=TIMEOUT)
        r_b = requests.get(f"{BASE}/orgs/{org_b['id']}", headers=_headers(tokens["access_token"]), timeout=TIMEOUT)

        assert r_a.status_code == 200
        assert r_b.status_code == 200
        assert r_a.json()["id"] != r_b.json()["id"]

    def test_list_my_orgs_includes_both_created_orgs(self):
        tokens = _register_and_login()
        org_a = _create_org(tokens["access_token"])
        org_b = _create_org(tokens["access_token"])

        r = requests.get(f"{BASE}/orgs", headers=_headers(tokens["access_token"]), timeout=TIMEOUT)
        assert r.status_code == 200
        ids = {org["id"] for org in r.json()}
        assert org_a["id"] in ids
        assert org_b["id"] in ids


class TestNonMemberCannotAccessAnotherUsersOrg:
    def test_get_org_owned_by_a_different_user_returns_404(self):
        owner_tokens = _register_and_login()
        outsider_tokens = _register_and_login()

        owners_org = _create_org(owner_tokens["access_token"])

        r = requests.get(
            f"{BASE}/orgs/{owners_org['id']}",
            headers=_headers(outsider_tokens["access_token"]),
            timeout=TIMEOUT,
        )
        assert r.status_code == 404

    def test_outsiders_org_list_does_not_include_owners_org(self):
        owner_tokens = _register_and_login()
        outsider_tokens = _register_and_login()

        owners_org = _create_org(owner_tokens["access_token"])

        r = requests.get(f"{BASE}/orgs", headers=_headers(outsider_tokens["access_token"]), timeout=TIMEOUT)
        assert r.status_code == 200
        ids = {org["id"] for org in r.json()}
        assert owners_org["id"] not in ids
