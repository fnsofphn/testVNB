export default function handler(_req, res) {
  res.status(200).json({
    ok: true,
    app: 'vcontent-3.0',
    runtime: 'vercel',
  });
}
