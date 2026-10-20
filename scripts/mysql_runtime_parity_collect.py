#!/usr/bin/env python3
"""Read-only Mac/DGX runtime evidence; prints allowlisted metadata, never secrets.

Run with python3 -B from the deployed Studio directory. Docker commands only
inspect/config/exec SELECT-only diagnostics. No application modules are loaded.
"""
import datetime
import gzip
import hashlib
import json
from pathlib import Path
import re
import subprocess


def run(args, stdin=None):
    p = subprocess.run(args, input=stdin, text=True, capture_output=True)
    if p.returncode:
        return None  # Never forward raw errors/configuration/logs.
    return p.stdout


RUNTIME = r'''
import os,json,pathlib,hashlib
result={}
try:
 import pymysql
 base=pathlib.Path('/app')
 files=['omnibioai/settings.py','plugins/workflow_builder/models.py','plugins/workflow_builder/views.py']
 result['files']={f:hashlib.sha256((base/f).read_bytes()).hexdigest() for f in files if (base/f).exists()}
 result['workflow_migration_files']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (base/'plugins/workflow_builder/migrations').glob('*.py')}
 names={'0002_rename_dashboard_w_workflo_3fb586_idx_workflow_ru_workflo_699112_idx_and_more','0003_owned_workflows','0004_cancellation'}
 apps={'epigenomics_chip','exome_analysis','genome_analysis','metagenomics','rnaseq_analysis','single_cell_analysis','spatial_omics'}
 result['eleven_history_file_candidates']={str(p.relative_to(base)):hashlib.sha256(p.read_bytes()).hexdigest() for p in base.rglob('migrations/*.py') if p.stem in names or (any(a in p.parts for a in apps) and p.stem in ['0001_initial','0002_delete_job'])}
 result['target']={k:os.environ.get(k) for k in ['DJANGO_SETTINGS_MODULE','DB_HOST','DB_NAME','DB_PORT','DB_USER']}
 c=pymysql.connect(host=os.environ.get('DB_HOST','127.0.0.1'),port=int(os.environ.get('DB_PORT','3306')),user=os.environ.get('DB_USER','root'),password=os.environ.get('DB_PASSWORD',''),database=os.environ.get('DB_NAME','omnibioai'))
 cur=c.cursor();cur.execute('START TRANSACTION READ ONLY')
 cur.execute('SELECT DATABASE(),@@hostname,@@server_uuid,VERSION()');result['actual_database']=cur.fetchone()
 cur.execute("SELECT TABLE_SCHEMA,COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA IN ('omnibioai','limsdb','model_registry','omnibioai_billing','omnibioai_audit','omnibioai_licenses') GROUP BY TABLE_SCHEMA");result['live_table_counts']=cur.fetchall()
 cur.execute("SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('workflow_builder_workflowdefinition','workflow_builder_workflowexecution') ORDER BY TABLE_NAME,ORDINAL_POSITION");result['workflow_columns']=cur.fetchall()
 cur.execute('SELECT app,name FROM django_migrations ORDER BY app,name');result['django_migrations']=cur.fetchall()
 checks={'workflow_list_scope':"SELECT name,updated_at,created_at FROM workflow_builder_workflowdefinition WHERE owner_user_id = -1 AND organization_id IS NULL LIMIT 0",'workflow_get_fields':"SELECT owner_user_id,organization_id FROM workflow_builder_workflowdefinition LIMIT 0",'execution_status_fields':"SELECT owner_user_id,organization_id,cancel_requested FROM workflow_builder_workflowexecution LIMIT 0"}
 result['read_only_checks']={}
 for name,q in checks.items():
  try:cur.execute(q);result['read_only_checks'][name]={'pass':True}
  except Exception as e:result['read_only_checks'][name]={'pass':False,'error_code':e.args[0] if e.args and isinstance(e.args[0],int) else None}
 c.rollback();c.close()
except Exception as e:
 result['collection_error_type']=type(e).__name__
print(json.dumps(result))
'''


def main():
    cwd = Path.cwd()
    report = {'collected_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'studio_path': str(cwd), 'git': {}, 'containers': [], 'compose': {}}
    for repo in ['omnibioai-studio', 'omnibioai-workbench', 'omnibioai-tes',
                 'omnibioai-workflow-bundles', 'omnibioai-auth']:
        p = cwd.parent / repo
        commit = run(['git', '-C', str(p), 'rev-parse', 'HEAD'])
        report['git'][repo] = commit.strip() if commit else None
    # Resolved config remains in memory. Emit only an explicit safe allowlist.
    raw = run(['docker', 'compose', 'config', '--format', 'json'])
    if raw:
        config = json.loads(raw)
        for name in ['workbench', 'tes', 'workflow-bundles', 'mysql']:
            s = config.get('services', {}).get(name, {})
            env = s.get('environment') or {}
            report['compose'][name] = {
                'database_target': {k: env.get(k) for k in ['DJANGO_SETTINGS_MODULE','DB_HOST','DB_NAME','DB_PORT','DB_USER']},
                'dependencies': list(s.get('depends_on') or {}),
                'ports': s.get('ports', []),
                'startup_mentions_migration': bool(re.search(r'manage\.py\s+migrate|alembic\s+upgrade', str(s.get('command', '')))),
            }
    ids = run(['docker', 'compose', 'ps', '-aq'])
    if ids and ids.split():
        raw = run(['docker', 'inspect', *ids.split()])
        for c in json.loads(raw or '[]'):
            labels = c['Config'].get('Labels') or {}
            service = labels.get('com.docker.compose.service')
            if service not in ['workbench','tes','workflow-bundles','mysql']:
                continue
            image = json.loads(run(['docker','image','inspect',c['Image']]) or '[{}]')[0]
            image_labels = (image.get('Config') or {}).get('Labels') or {}
            report['containers'].append({'service':service,'id':c['Id'],'name':c['Name'],
                'created':c['Created'],'state':c['State']['Status'],'image_id':c['Image'],
                'image_created':image.get('Created'),'repo_digests':image.get('RepoDigests'),
                'image_revision':image_labels.get('org.opencontainers.image.revision'),
                'startup_mentions_migration':bool(re.search(r'manage\.py\s+migrate|alembic\s+upgrade',str(c['Config'].get('Cmd','')))),
                'compose_files':labels.get('com.docker.compose.project.config_files'),
                'code_mounts':[{'source':m['Source'],'destination':m['Destination'],'rw':m['RW']} for m in c['Mounts'] if m['Type']=='bind' and m['Destination'].startswith(('/app','/workspace'))]})
            if service == 'workbench' and c['State']['Status'] == 'running':
                out = run(['docker','exec','-i',c['Id'],'python','-B','-'], RUNTIME)
                report['workbench_runtime'] = json.loads(out) if out else {'collection_failed':True}
    archive = Path.home() / 'omnibioai-db-transfer/omnibioai_six_databases_20261011.sql.gz'
    if archive.exists():
        data = archive.read_bytes()
        report['archive'] = {'sha256':hashlib.sha256(data).hexdigest(),'compressed_bytes':len(data)}
        try:
            sql = gzip.decompress(data).decode()
            report['archive'].update({'gzip_pass':True,
                'databases':re.findall(r'^USE `([^`]+)`;',sql,re.M),
                'completion':re.findall(r'^-- Dump completed.*$',sql,re.M)})
        except Exception:
            report['archive']['gzip_pass'] = False
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
