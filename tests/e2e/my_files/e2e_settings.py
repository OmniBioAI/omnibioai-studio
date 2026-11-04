from omnibioai.settings_test import *  # noqa
import pymysql
pymysql.install_as_MySQLdb()
DATABASES = {"default": {"ENGINE": "django.db.backends.mysql", "NAME": "e2e", "HOST": "myfiles-e2e-mysql", "PORT": "3306", "USER": "root", "PASSWORD": __import__("os").environ["E2E_DB_PASSWORD"], "OPTIONS": {"isolation_level": "read committed"}}}
STORAGE_TENANT_ROOT = "/e2e/run/tenants"
STORAGE_IAM_URL = "http://fakeiam:9000"
STORAGE_BILLING_URL = "http://fakeiam:9000"
STORAGE_QUOTA_MODE = "audit"
OMNIBIOAI_DATA_ROOT = "/e2e/run/data"
