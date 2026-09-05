import os
import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
backend_env = dotenv_values("/app/backend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")


def _secret(name: str) -> str:
    value = os.environ.get(name) or backend_env.get(name)
    if not value:
        raise RuntimeError(f"{name} missing — set it in the environment or /app/backend/.env")
    return value


ADMIN_TOKEN = _secret("TEST_ADMIN_SESSION_TOKEN")
END_USER_TOKEN = _secret("TEST_END_USER_SESSION_TOKEN")


def _client(token=None):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="session")
def api():
    return _client()


@pytest.fixture(scope="session")
def admin():
    return _client(ADMIN_TOKEN)


@pytest.fixture(scope="session")
def enduser():
    return _client(END_USER_TOKEN)


@pytest.fixture(scope="session")
def base_url_fixture():
    return BASE_URL
