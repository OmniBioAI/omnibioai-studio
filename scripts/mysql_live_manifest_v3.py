#!/usr/bin/env python3
"""SELECT/SHOW-only manifest; no raw data or authentication values emitted."""
import datetime, hashlib, json, pathlib, re, subprocess

DBS = ['omnibioai','limsdb','model_registry','omnibioai_billing','omnibioai_audit','omnibioai_licenses']
CONTAINER = 'omnibioai-studio-mysql-1'
def query(sql):
    p = subprocess.run(['docker','exec','-i',CONTAINER,'sh','-c',
        'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --batch --raw --skip-column-names'],
        input=sql, text=True, capture_output=True)
    if p.returncode:
        raise RuntimeError('mysql_collection_failed')
    return p.stdout.splitlines()
def ident(s):
    return '`'+s.replace('`','``')+'`'
def main():
    report={'collected_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    where='('+','.join("'"+s+"'" for s in DBS)+')'
    report['server']=query('SELECT VERSION(),@@hostname,@@server_uuid;')
    report['schemas']=query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME IN '+where+' ORDER BY 1;')
    tables=[line.split('\t') for line in query('SELECT TABLE_SCHEMA,TABLE_NAME,TABLE_TYPE,COALESCE(ENGINE,\'\') FROM information_schema.TABLES WHERE TABLE_SCHEMA IN '+where+' ORDER BY 1,2;')]
    report['tables']=tables
    report['metadata']={}
    for table,cols,filtercol,order in [
        ('COLUMNS','TABLE_SCHEMA,TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,IS_NULLABLE,COLUMN_KEY,EXTRA,CHARACTER_SET_NAME,COLLATION_NAME','TABLE_SCHEMA','TABLE_SCHEMA,TABLE_NAME,ORDINAL_POSITION'),
        ('STATISTICS','TABLE_SCHEMA,TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,COLLATION,SUB_PART,INDEX_TYPE,EXPRESSION','TABLE_SCHEMA','TABLE_SCHEMA,TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX'),
        ('TABLE_CONSTRAINTS','CONSTRAINT_SCHEMA,TABLE_NAME,CONSTRAINT_NAME,CONSTRAINT_TYPE,ENFORCED','CONSTRAINT_SCHEMA','CONSTRAINT_SCHEMA,TABLE_NAME,CONSTRAINT_NAME'),
        ('KEY_COLUMN_USAGE','TABLE_SCHEMA,TABLE_NAME,CONSTRAINT_NAME,COLUMN_NAME,ORDINAL_POSITION,REFERENCED_TABLE_SCHEMA,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME','TABLE_SCHEMA','TABLE_SCHEMA,TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION'),
        ('REFERENTIAL_CONSTRAINTS','CONSTRAINT_SCHEMA,TABLE_NAME,CONSTRAINT_NAME,UPDATE_RULE,DELETE_RULE','CONSTRAINT_SCHEMA','CONSTRAINT_SCHEMA,TABLE_NAME,CONSTRAINT_NAME'),
        ('TRIGGERS','TRIGGER_SCHEMA,TRIGGER_NAME,EVENT_MANIPULATION,EVENT_OBJECT_TABLE,ACTION_TIMING,ACTION_STATEMENT,DEFINER,SQL_MODE','TRIGGER_SCHEMA','TRIGGER_SCHEMA,TRIGGER_NAME'),
        ('ROUTINES','ROUTINE_SCHEMA,ROUTINE_NAME,ROUTINE_TYPE','ROUTINE_SCHEMA','ROUTINE_SCHEMA,ROUTINE_NAME'),
        ('EVENTS','EVENT_SCHEMA,EVENT_NAME,STATUS','EVENT_SCHEMA','EVENT_SCHEMA,EVENT_NAME')]:
        expression='JSON_ARRAY('+cols+')'
        report['metadata'][table]=[json.loads(x) for x in query('SELECT '+expression+' FROM information_schema.'+table+' WHERE '+filtercol+' IN '+where+' ORDER BY '+order+';')]
    sql=['SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;','START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;']
    for db,t,kind,engine in tables:
        if kind=='BASE TABLE': sql.append('SELECT JSON_ARRAY(\''+db+'\',\''+t.replace("'","''")+'\',COUNT(*)) FROM '+ident(db)+'.'+ident(t)+';')
    sql.append('ROLLBACK;')
    report['row_counts']=[json.loads(x) for x in query('\n'.join(sql))]
    report['ddl']={}
    for db,t,kind,engine in tables:
        lines=query('SHOW CREATE TABLE '+ident(db)+'.'+ident(t)+';')
        ddl='\n'.join(lines).split('\t',1)[1]
        report['ddl'][db+'.'+t]=ddl
    report['migration_history']={}
    for db,t,kind,engine in tables:
        if t=='django_migrations': report['migration_history'][db+'.'+t]=[json.loads(x) for x in query('SELECT JSON_ARRAY(app,name) FROM '+ident(db)+'.'+ident(t)+' ORDER BY app,name;')]
        if t=='alembic_version': report['migration_history'][db+'.'+t]=query('SELECT version_num FROM '+ident(db)+'.'+ident(t)+' ORDER BY version_num;')
    report['accounts']=query('SELECT User,Host,account_locked FROM mysql.user ORDER BY User,Host;')
    c=json.loads(subprocess.run(['docker','inspect',CONTAINER],capture_output=True,text=True,check=True).stdout)[0]
    report['container']={'id':c['Id'],'image':c['Image'],'health':c['State'].get('Health',{}).get('Status'),'ports':c['NetworkSettings'].get('Ports'),'mounts':[{'type':m['Type'],'name':m.get('Name'),'source':m['Source'],'destination':m['Destination']} for m in c['Mounts']]}
    report['archives']={}
    import gzip
    for rel in ['omnibioai_six_databases_20261011.sql.gz','dgx-original-20261011/dgx-original-four-databases.sql.gz']:
        p=pathlib.Path.home()/'omnibioai-db-transfer'/rel
        if p.exists():
            b=p.read_bytes(); expanded=gzip.decompress(b)
            report['archives'][rel]={'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'gzip_pass':True,'expanded_bytes':len(expanded)}
    print(json.dumps(report,indent=2))
if __name__=='__main__': main()
