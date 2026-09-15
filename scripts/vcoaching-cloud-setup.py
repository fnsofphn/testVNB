"""Configure the authorized Test-Vinabrain production worker; dry-run by default.

Uses the existing service-role key locally. The derived worker secret is stored
in Supabase Vault and is never printed or added to the repository.
"""
import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
for line in (ROOT / '.env.local').read_text('utf-8-sig').splitlines():
    if '=' in line and not line.startswith('#'):
        name, value = line.split('=', 1)
        os.environ.setdefault(name, value.strip().strip('"'))
parser = argparse.ArgumentParser()
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
url = (os.environ.get('SUPABASE_URL') or os.environ.get('VITE_SUPABASE_URL', '')).rstrip('/')
key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
if url != 'https://npazlysytrqhnwezugcs.supabase.co' or not key:
    raise SystemExit('Refusing: expected the confirmed Test-Vinabrain Supabase configuration')
destination = 'https://test-vinabrain.vercel.app/api/vcoaching?op=tick'
print('Target: Test-Vinabrain / namespace production / ' + destination)
if not args.apply:
    print('Dry run: configure only the V-Coaching worker target and its Vault secret. Use --apply to write.')
else:
    secret = hmac.new(key.encode(), b'vcoaching-worker-v1:production', hashlib.sha256).hexdigest()
    body = json.dumps({'p_namespace':'production','p_url':destination,'p_secret':secret}).encode()
    req = Request(url+'/rest/v1/rpc/vcoaching_configure_worker', data=body, method='POST',
                  headers={'apikey':key,'Authorization':'Bearer '+key,'Content-Type':'application/json'})
    try:
        with urlopen(req, timeout=30) as response:
            assert response.status in (200,204)
        print('Configured. Queued production files run after this code is deployed to the production domain.')
    except HTTPError as error:
        raise SystemExit('Configuration failed (HTTP '+str(error.code)+'); no credentials were logged.') from None
