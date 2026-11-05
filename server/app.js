import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { draw } from './draw.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const newToken = (bytes = 16) => crypto.randomBytes(bytes).toString('base64url');
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
// Admin tokens are twice as long (44 chars); 22-char ones from older groups remain valid.
const ADMIN_TOKEN_RE = /^[A-Za-z0-9_-]{22}$|^[A-Za-z0-9_-]{44}$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function cleanName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 100) throw new HttpError(400, 'invalid_name');
  return name;
}

export function createApp(pool) {
  const app = express();
  app.use(express.json({ limit: '10kb' }));

  const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

  async function groupByAdmin(token) {
    if (!ADMIN_TOKEN_RE.test(token)) throw new HttpError(404, 'unknown_link');
    const [[group]] = await pool.query('SELECT * FROM event_groups WHERE admin_token = ?', [token]);
    if (!group) throw new HttpError(404, 'unknown_link');
    return group;
  }

  async function groupByJoin(token) {
    if (!TOKEN_RE.test(token)) throw new HttpError(404, 'unknown_link');
    const [[group]] = await pool.query('SELECT * FROM event_groups WHERE join_token = ?', [token]);
    if (!group) throw new HttpError(404, 'unknown_link');
    return group;
  }

  async function addParticipant(groupId, name) {
    const token = newToken();
    const [r] = await pool.query('INSERT INTO participants (group_id, name, token) VALUES (?, ?, ?)', [
      groupId,
      name,
      token,
    ]);
    return { id: r.insertId, token };
  }

  // Create a group; the creator is also a participant.
  app.post('/api/groups', wrap(async (req, res) => {
    const name = cleanName(req.body.name);
    const adminName = cleanName(req.body.adminName);
    const adminToken = newToken(33);
    const joinToken = newToken();
    const [r] = await pool.query(
      'INSERT INTO event_groups (name, admin_token, join_token) VALUES (?, ?, ?)',
      [name, adminToken, joinToken],
    );
    const me = await addParticipant(r.insertId, adminName);
    res.status(201).json({ adminToken, joinToken, participantToken: me.token });
  }));

  app.get('/api/join/:token', wrap(async (req, res) => {
    const group = await groupByJoin(req.params.token);
    const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM participants WHERE group_id = ?', [group.id]);
    res.json({ name: group.name, drawn: !!group.drawn, count });
  }));

  app.post('/api/join/:token', wrap(async (req, res) => {
    const group = await groupByJoin(req.params.token);
    if (group.drawn) throw new HttpError(409, 'already_drawn');
    const me = await addParticipant(group.id, cleanName(req.body.name));
    res.status(201).json({ participantToken: me.token });
  }));

  app.get('/api/me/:token', wrap(async (req, res) => {
    if (!TOKEN_RE.test(req.params.token)) throw new HttpError(404, 'unknown_link');
    const [[me]] = await pool.query(
      `SELECT p.id, p.group_id, p.name, g.name AS groupName, g.drawn, t.name AS target
       FROM participants p
       JOIN event_groups g ON g.id = p.group_id
       LEFT JOIN participants t ON t.id = p.target_id
       WHERE p.token = ?`,
      [req.params.token],
    );
    if (!me) throw new HttpError(404, 'unknown_link');
    // Names only: tokens and targets of others are never exposed.
    const [members] = await pool.query('SELECT id, name FROM participants WHERE group_id = ? ORDER BY id', [me.group_id]);
    res.json({
      name: me.name,
      groupName: me.groupName,
      drawn: !!me.drawn,
      target: me.target,
      members: members.map((m) => ({ name: m.name, me: m.id === me.id })),
    });
  }));

  app.patch('/api/me/:token', wrap(async (req, res) => {
    if (!TOKEN_RE.test(req.params.token)) throw new HttpError(404, 'unknown_link');
    const name = cleanName(req.body.name);
    const [r] = await pool.query('UPDATE participants SET name = ? WHERE token = ?', [name, req.params.token]);
    if (!r.affectedRows) throw new HttpError(404, 'unknown_link');
    res.json({ name });
  }));

  // Admin routes.
  app.get('/api/admin/:token', wrap(async (req, res) => {
    const group = await groupByAdmin(req.params.token);
    const [participants] = await pool.query(
      'SELECT id, name, token, target_id FROM participants WHERE group_id = ? ORDER BY id',
      [group.id],
    );
    const [exclusions] = await pool.query('SELECT id, a_id AS a, b_id AS b FROM exclusions WHERE group_id = ?', [group.id]);
    res.json({
      name: group.name,
      drawn: !!group.drawn,
      joinToken: group.join_token,
      participants: participants.map(({ target_id, ...p }) => p),
      exclusions,
      assignments: group.drawn
        ? participants.filter((p) => p.target_id).map((p) => ({ giver: p.id, receiver: p.target_id }))
        : [],
    });
  }));

  app.delete('/api/admin/:token/participants/:id', wrap(async (req, res) => {
    const group = await groupByAdmin(req.params.token);
    if (group.drawn) throw new HttpError(409, 'reset_first');
    await pool.query('DELETE FROM participants WHERE id = ? AND group_id = ?', [req.params.id, group.id]);
    res.status(204).end();
  }));

  app.patch('/api/admin/:token/participants/:id', wrap(async (req, res) => {
    const group = await groupByAdmin(req.params.token);
    const name = cleanName(req.body.name);
    const [r] = await pool.query('UPDATE participants SET name = ? WHERE id = ? AND group_id = ?', [name, req.params.id, group.id]);
    if (!r.affectedRows) throw new HttpError(404, 'unknown_participant');
    res.json({ name });
  }));

  app.post('/api/admin/:token/exclusions', wrap(async (req, res) => {
    const group = await groupByAdmin(req.params.token);
    if (group.drawn) throw new HttpError(409, 'reset_first');
    const a = Number(req.body.a);
    const b = Number(req.body.b);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a === b) throw new HttpError(400, 'pick_two');
    const [found] = await pool.query('SELECT id FROM participants WHERE group_id = ? AND id IN (?, ?)', [group.id, a, b]);
    if (found.length !== 2) throw new HttpError(400, 'unknown_participant');
    const [lo, hi] = a < b ? [a, b] : [b, a];
    await pool.query('INSERT IGNORE INTO exclusions (group_id, a_id, b_id) VALUES (?, ?, ?)', [group.id, lo, hi]);
    res.status(201).end();
  }));

  app.delete('/api/admin/:token/exclusions/:id', wrap(async (req, res) => {
    const group = await groupByAdmin(req.params.token);
    if (group.drawn) throw new HttpError(409, 'reset_first');
    await pool.query('DELETE FROM exclusions WHERE id = ? AND group_id = ?', [req.params.id, group.id]);
    res.status(204).end();
  }));

  app.post('/api/admin/:token/draw', wrap(async (req, res) => {
    const group = await groupByAdmin(req.params.token);
    if (group.drawn) throw new HttpError(409, 'already_drawn');
    const [people] = await pool.query('SELECT id FROM participants WHERE group_id = ?', [group.id]);
    if (people.length < 3) throw new HttpError(400, 'min_three');
    const [excl] = await pool.query('SELECT a_id, b_id FROM exclusions WHERE group_id = ?', [group.id]);
    const result = draw(people.map((p) => p.id), excl.map((e) => [e.a_id, e.b_id]));
    if (!result) throw new HttpError(422, 'no_valid_draw');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const [giver, receiver] of result) {
        await conn.query('UPDATE participants SET target_id = ? WHERE id = ?', [receiver, giver]);
      }
      await conn.query('UPDATE event_groups SET drawn = 1 WHERE id = ?', [group.id]);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    res.json({ drawn: true });
  }));

  app.post('/api/admin/:token/reset', wrap(async (req, res) => {
    const group = await groupByAdmin(req.params.token);
    await pool.query('UPDATE participants SET target_id = NULL WHERE group_id = ?', [group.id]);
    await pool.query('UPDATE event_groups SET drawn = 0 WHERE id = ?', [group.id]);
    res.json({ drawn: false });
  }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

  app.use(express.static(publicDir));
  app.get(/^\/(join|admin|me)\/[^/]+$/, (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  });

  return app;
}
