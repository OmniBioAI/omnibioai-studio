#!/usr/bin/env python3
"""Authorized V4 only: isolated archive restore and exact workflow migrations.

Never reads application records or hashes row contents. All SQL writes are
restricted to a verified newly created networkless tmpfs container.
"""
import contextlib, datetime, gzip, hashlib, importlib.util, io, json, os
from pathlib import Path
import re, secrets, subprocess, time

ROOT = Path(__file__).resolve().parents[1]
IMAGE = 'sha256:7dcddc01f13bab2f15cde676d44d01f61fc9f99fe7785e86196dfc07d358ae2b'
LABEL = 'OMNIBIOAI_MYSQL_DISPOSABLE_REHEARSAL_V4'
DBS = ['omnibioai','limsdb','model_registry','omnibioai_billing','omnibioai_audit','omnibioai_licenses']
EXPECTED = {
 '0001_initial.py':'73351e0d5bae7017413c1a08aacdd58a6b77216c65615aad81cda35c3b2d1c82',
 '0002_workflowexecution.py':'a747f39e9eccd7de2608f1681d78e198f0df4e407bac3985c86621b04f6b0ef9',
 '0003_owned_workflows.py':'4f1d06c7302143437a2693aabbaed3c36dc45cbce44cb4f59bd40cfac132de4d',
 '0004_cancellation.py':'9046606d77343e1619cee7f2fd8a68290cc8b02e51f6a119909d982ebfb9bda5'}

RUNNER = r'''
import datetime,hashlib,json,pathlib,sys,time,os
try:
 import pymysql
 pymysql.install_as_MySQLdb()
 import django
 from django.conf import settings
 pkg=pathlib.Path('/tmp/v4/workflow_builder');(pkg/'migrations').mkdir(parents=True)
 (pkg/'__init__.py').write_text('');(pkg/'models.py').write_text('');(pkg/'migrations/__init__.py').write_text('')
 expected=json.loads(os.environ['V4_EXPECTED_HASHES'])
 for name,h in expected.items():
  data=(pathlib.Path('/app/plugins/workflow_builder/migrations')/name).read_bytes()
  assert hashlib.sha256(data).hexdigest()==h, 'migration_file_hash_mismatch'
  (pkg/'migrations'/name).write_bytes(data)
 sys.path.insert(0,'/tmp/v4')
 password=pathlib.Path('/run/secrets/v4-root').read_text().strip()
 settings.configure(SECRET_KEY='disposable-settings-only',INSTALLED_APPS=['workflow_builder'],
  DATABASES={'default':{'ENGINE':'django.db.backends.mysql','HOST':'127.0.0.1','PORT':'3306','NAME':'omnibioai','USER':'root','PASSWORD':password,'OPTIONS':{'charset':'utf8mb4'}}},
  USE_TZ=True,DEFAULT_AUTO_FIELD='django.db.models.BigAutoField')
 django.setup()
 from django.db import connection
 from django.db.migrations.executor import MigrationExecutor
 with connection.cursor() as c:
  c.execute('SELECT @@server_uuid');assert c.fetchone()[0]==os.environ['V4_SERVER_UUID'], 'target_uuid_mismatch'
 e=MigrationExecutor(connection);plan=e.migration_plan([('workflow_builder','0004_cancellation')])
 names=[(m.app_label,m.name,back) for m,back in plan]
 assert names==[('workflow_builder','0003_owned_workflows',False),('workflow_builder','0004_cancellation',False)], 'unexpected_migration_plan'
 deps={m.name:m.dependencies for m,back in plan}
 sql=e.loader.collect_sql(plan)
 result={'django_version':django.get_version(),'migration_file_hashes':expected,'plan':names,'dependencies':deps,'planned_sql':sql,'durations_seconds':{}}
 for name in ['0003_owned_workflows','0004_cancellation']:
  e=MigrationExecutor(connection);t=time.monotonic();e.migrate([('workflow_builder',name)],fake=False,fake_initial=False)
  result['durations_seconds'][name]=round(time.monotonic()-t,6)
 with connection.cursor() as c:
  c.execute("SELECT app,name FROM django_migrations WHERE app='workflow_builder' ORDER BY name");result['workflow_history']=c.fetchall()
 connection.close();print(json.dumps(result))
except Exception as exc:
 print(json.dumps({'runner_failed':True,'error_type':type(exc).__name__,'error_code':exc.args[0] if exc.args and isinstance(exc.args[0],int) else None}));sys.exit(1)
'''

def command(args, input=None):
    p=subprocess.run(args,input=input,capture_output=True,text=True)
    if p.returncode:
        raise RuntimeError('command_failed:'+args[0])
    return p.stdout

def main():
    os.umask(0o077)
    run=ROOT/'reports'/('mysql-rehearsal-v4-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    run.mkdir(mode=0o700)
    secret=run/'temporary-root-secret';secret.write_text(secrets.token_urlsafe(48)+'\n');secret.chmod(0o600)
    created=[];results={'workstream':LABEL,'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'content_verification':'NOT_AUTHORIZED_NOT_PERFORMED','production_changes':False}
    def save(name,obj): (run/name).write_text(json.dumps(obj,indent=2)+'\n')
    def inspect(cid):
        c=json.loads(command(['docker','inspect',cid]))[0]
        assert c['Id']==cid and c['Config']['Labels'].get('omnibioai.workstream')==LABEL
        assert c['HostConfig']['NetworkMode']=='none' and not c['HostConfig'].get('PortBindings')
        assert not c['NetworkSettings'].get('Networks') or set(c['NetworkSettings']['Networks'])=={'none'}
        assert all(m['Type']=='tmpfs' or (m['Type']=='bind' and m['Source']==str(secret) and not m['RW']) for m in c['Mounts'])
        assert not any(m['Type']=='volume' for m in c['Mounts'])
        assert '/var/lib/mysql' in c['HostConfig']['Tmpfs']
        return c
    def sql(cid,text):
        inspect(cid)
        return command(['docker','exec','-i',cid,'sh','-c','MYSQL_PWD="$(cat /run/secrets/v4-root)" mysql -uroot --batch --raw --skip-column-names --binary-mode'],text)
    def create(kind):
        name=run.name+'-'+kind
        cid=command(['docker','run','-d','--name',name,'--label','omnibioai.workstream='+LABEL,'--network','none','--memory','2g','--cpus','2',
         '--tmpfs','/var/lib/mysql:rw,size=1g','--tmpfs','/tmp:rw,size=256m',
         '--mount','type=bind,src='+str(secret)+',dst=/run/secrets/v4-root,readonly',
         '-e','MYSQL_ROOT_PASSWORD_FILE=/run/secrets/v4-root','-e','MYSQL_ROOT_HOST=%',IMAGE]).strip()
        created.append(cid);inspect(cid)
        deadline=time.monotonic()+90
        while True:
            try:
                if sql(cid,'SELECT VERSION();').strip()=='8.0.46':break
            except RuntimeError: pass
            if time.monotonic()>deadline:raise RuntimeError('mysql_start_timeout')
            time.sleep(1)
        return cid
    def manifest(cid):
        spec=importlib.util.spec_from_file_location('v4_manifest',ROOT/'scripts/mysql_live_manifest_v3.py')
        mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
        mod.CONTAINER=cid;mod.query=lambda text:sql(cid,text).splitlines()
        buf=io.StringIO()
        with contextlib.redirect_stdout(buf):mod.main()
        return json.loads(buf.getvalue())
    try:
        disk=os.statvfs(ROOT);free=disk.f_bavail*disk.f_frsize
        assert free>5*1024**3 and os.stat(ROOT).st_dev==os.stat('/var/lib/docker').st_dev
        results['root_free_bytes']=free
        app_image=command(['docker','inspect','--format','{{.Image}}','omnibioai-studio-workbench-1']).strip()
        results['app_image']=app_image;results['mysql_image']=IMAGE
        archive=Path.home()/'omnibioai-db-transfer/omnibioai_six_databases_20261011.sql.gz'
        compressed=archive.read_bytes();assert hashlib.sha256(compressed).hexdigest()=='e3144c3c1594ee90b8fd760360ed22bc68ae741f4cac97a3b70d6a7f8a19beb3'
        source_sql=gzip.decompress(compressed).decode()
        c=create('upgrade');results['isolation']=inspect(c)['HostConfig']['NetworkMode'];results['scratch_container_id']=c
        t=time.monotonic();sql(c,source_sql);results['source_restore_seconds']=round(time.monotonic()-t,6)
        before=manifest(c);save('source-before.json',before)
        ref=json.loads((ROOT/'MYSQL_MIGRATION_V3_REFERENCE_RESULTS.json').read_text())
        counts=lambda r:{d+'.'+t:n for d,t,n in r['row_counts']}
        expected_counts={d+'.'+t:n for d,ts in ref['databases'].items() for t,n in ts.items()}
        assert counts(before)==expected_counts and set(before['schemas'])==set(DBS)
        assert len(before['tables'])==203 and len(before['metadata']['TRIGGERS'])==2
        assert all(hashlib.sha256((t+'\t'+before['ddl'][d+'.'+t]+'\n').encode()).hexdigest()==h for d,ts in ref['schema_ddl_sha256'].items() for t,h in ts.items())
        mac=json.loads((ROOT/'MYSQL_MAC_LIVE_PARITY_V3_MAC_MANIFEST.json').read_text())
        assert before['migration_history']==mac['migration_history']
        assert before['metadata']['TRIGGERS']==mac['metadata']['TRIGGERS']
        assert expected_counts['omnibioai.workflow_builder_workflowdefinition']==0 and expected_counts['omnibioai.workflow_builder_workflowexecution']==0
        results['source_baseline_pass']=True
        def checks():
            queries={'list_scope':'SELECT name,updated_at,created_at FROM omnibioai.workflow_builder_workflowdefinition WHERE owner_user_id=-1 AND organization_id IS NULL LIMIT 0;',
             'definition_scope':'SELECT owner_user_id,organization_id FROM omnibioai.workflow_builder_workflowdefinition LIMIT 0;',
             'execution_scope':'SELECT owner_user_id,organization_id,cancel_requested FROM omnibioai.workflow_builder_workflowexecution LIMIT 0;'}
            r={}
            for name,text in queries.items():
                try:sql(c,'START TRANSACTION READ ONLY;'+text+'ROLLBACK;');r[name]=True
                except RuntimeError:r[name]=False
            return r
        results['queries_before']=checks();assert not any(results['queries_before'].values())
        server_uuid=sql(c,'SELECT @@server_uuid;').strip()
        args=['docker','run','--rm','-i','--name',run.name+'-runner','--label','omnibioai.workstream='+LABEL,'--network','container:'+c,
         '--read-only','--tmpfs','/tmp:rw,size=256m','--memory','1g','--cpus','2',
         '--mount','type=bind,src='+str(secret)+',dst=/run/secrets/v4-root,readonly',
         '-e','V4_EXPECTED_HASHES='+json.dumps(EXPECTED),'-e','V4_SERVER_UUID='+server_uuid,'--entrypoint','python',app_image,'-B','-']
        p=subprocess.run(args,input=RUNNER,text=True,capture_output=True)
        try:r=json.loads(p.stdout)
        except Exception:r={'runner_failed':True,'error_type':'invalid_runner_output'}
        save('migration-runner.json',r)
        if p.returncode or r.get('runner_failed'):raise RuntimeError('migration_runner_failed')
        results['migrations']=r
        after=manifest(c);save('source-after.json',after)
        expected_counts['omnibioai.django_migrations']+=2
        assert counts(after)==expected_counts and before['tables']==after['tables']
        assert after['metadata']['TRIGGERS']==before['metadata']['TRIGGERS']
        changed=sorted(k for k in before['ddl'] if before['ddl'][k]!=after['ddl'][k])
        assert changed==['omnibioai.django_migrations','omnibioai.workflow_builder_workflowdefinition','omnibioai.workflow_builder_workflowexecution']
        history=after['migration_history'];old=before['migration_history']['omnibioai.django_migrations']
        assert history['omnibioai.django_migrations']==sorted(old+[['workflow_builder','0003_owned_workflows'],['workflow_builder','0004_cancellation']])
        for key in history:
            if key!='omnibioai.django_migrations':assert history[key]==before['migration_history'][key]
        assert before['metadata']['REFERENTIAL_CONSTRAINTS']==after['metadata']['REFERENTIAL_CONSTRAINTS']
        dgx=json.loads((ROOT/'MYSQL_MAC_LIVE_PARITY_V3_DGX_MANIFEST.json').read_text())
        normal=lambda ddl:re.sub(r' AUTO_INCREMENT=\d+','',ddl)
        for table in ['workflow_builder_workflowdefinition','workflow_builder_workflowexecution']:
            key='omnibioai.'+table;assert normal(after['ddl'][key])==normal(dgx['ddl'][key])
        results['changed_ddl_tables']=changed;results['queries_after']=checks();assert all(results['queries_after'].values())
        results['workflow_schema_matches_dgx']=True
        results['scratch_storage']=sql(c,"SELECT SUM(DATA_LENGTH+INDEX_LENGTH) FROM information_schema.TABLES WHERE TABLE_SCHEMA IN ('omnibioai','limsdb','model_registry','omnibioai_billing','omnibioai_audit','omnibioai_licenses');").strip()
        results['tmpfs_usage']=command(['docker','exec',c,'df','-B1','/var/lib/mysql','/tmp']).strip()
        results['status']='PASS_WORKFLOW_REHEARSAL'
    except Exception as exc:
        results['status']='STOPPED_ON_UNEXPECTED_RESULT';results['error_type']=type(exc).__name__
        results['failed_step']=str(exc) if isinstance(exc,RuntimeError) else 'assertion_failed'
    finally:
        cleanup=[]
        for cid in reversed(created):
            try:inspect(cid);command(['docker','rm','-f',cid]);cleanup.append({'id':cid,'removed':True})
            except Exception:cleanup.append({'id':cid,'removed':False})
        secret.unlink(missing_ok=True);results['cleanup']=cleanup;results['temporary_secret_deleted']=not secret.exists()
        save('results.json',results)
        print(json.dumps({'report_directory':str(run),'status':results.get('status'),'cleanup':cleanup}))
    return 0 if results.get('status')=='PASS_WORKFLOW_REHEARSAL' else 1

if __name__=='__main__':raise SystemExit(main())
