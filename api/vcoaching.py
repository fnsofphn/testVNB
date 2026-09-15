"""Vercel WSGI entrypoint. Durable state is in Supabase, never the function disk."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'vcoaching'))
from server import app
