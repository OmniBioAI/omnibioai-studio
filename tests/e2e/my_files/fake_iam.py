import json, http.server
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def do_GET(self):
        body={"/me":{"user":{"id":int(open("/e2e/run/subject").read()),"status":"active"}},
              "/orgs":[{"id":1001,"name":"E2E Lab","status":"active"}],
              "/billing/me/entitlements":{"owner_type":"USER","plan":"free","status":"active","storage_quota_bytes":10**12}}.get(self.path)
        data=json.dumps(body).encode(); self.send_response(200 if body else 404); self.send_header("Content-Length",str(len(data))); self.end_headers(); self.wfile.write(data)
http.server.ThreadingHTTPServer(("0.0.0.0",9000),H).serve_forever()
